const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID || '';
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1kJ942NqV1rspy9e-b11J4gihD_P6qyjC';
const DRIVE_API_KEY = process.env.DRIVE_API_KEY || '';

const ROOT_XLSX = path.join(__dirname, '..', 'Propiedades.xlsx');
const TEMP_XLSX = path.join(__dirname, '..', 'temp_propiedades.xlsx');
const TARGET_JSON = path.join(__dirname, '..', 'data.json');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP status ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      if (response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 301) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP status ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', err => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function getLatestFileIdFromFolder(folderId, apiKey) {
  if (apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&orderBy=modifiedTime+desc&fields=files(id,name,modifiedTime,mimeType)&key=${apiKey}`;
      const jsonText = await fetchText(apiUrl);
      const data = JSON.parse(jsonText);
      if (data.files && data.files.length > 0) {
        const xlsxFile = data.files.find(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || (f.mimeType && f.mimeType.includes('spreadsheet')));
        if (xlsxFile) {
          console.log(`📌 Archivo más reciente encontrado vía API: ${xlsxFile.name} (Modificado: ${xlsxFile.modifiedTime})`);
          return xlsxFile.id;
        }
      }
    } catch (e) {
      console.log('⚠️ Error al consultar Drive API v3:', e.message);
    }
  }

  try {
    const embedUrl = `https://drive.google.com/drive/folders/${folderId}`;
    const html = await fetchText(embedUrl);
    const allIds = [...new Set([...html.matchAll(/"([a-zA-Z0-9_-]{33})"/g)].map(m => m[1]))].filter(id => id !== folderId);
    
    if (allIds.length > 0) {
      console.log(`🔍 Se encontraron ${allIds.length} archivos en la carpeta de Drive. Evaluando fechas de modificación...`);
      const fileInfos = await Promise.all(allIds.map(async id => {
        try {
          const downloadUrl = `https://docs.google.com/uc?export=download&id=${id}`;
          const headRes = await new Promise(resolve => {
            https.get(downloadUrl, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
              if (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 303) {
                https.get(res.headers.location, { method: 'HEAD' }, res2 => {
                  resolve({
                    id,
                    lm: res2.headers['last-modified'] ? new Date(res2.headers['last-modified']).getTime() : 0
                  });
                }).on('error', () => resolve({ id, lm: 0 }));
              } else {
                resolve({
                  id,
                  lm: res.headers['last-modified'] ? new Date(res.headers['last-modified']).getTime() : 0
                });
              }
            }).on('error', () => resolve({ id, lm: 0 }));
          });
          return headRes;
        } catch (e) {
          return { id, lm: 0 };
        }
      }));

      fileInfos.sort((a, b) => b.lm - a.lm);
      if (fileInfos[0] && fileInfos[0].id) {
        console.log(`📌 Seleccionado archivo más reciente (ID: ${fileInfos[0].id}, Fecha: ${new Date(fileInfos[0].lm).toISOString()})`);
        return fileInfos[0].id;
      }
    }
  } catch (e) {
    console.log('⚠️ No se pudo obtener la lista vía vista de carpeta:', e.message);
  }

  return '';
}

function getColValue(row, ...possibleNames) {
  const keys = Object.keys(row);
  for (const name of possibleNames) {
    const target = name.trim().toLowerCase();
    const foundKey = keys.find(k => k.trim().toLowerCase() === target);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return String(row[foundKey]).trim();
    }
  }
  return '';
}

async function main() {
  let fileToRead = '';
  let targetFileId = DRIVE_FILE_ID;

  if (DRIVE_FOLDER_ID) {
    console.log(`📂 Buscando el archivo Excel más reciente dentro de la carpeta Drive ID: ${DRIVE_FOLDER_ID}...`);
    const folderLatestId = await getLatestFileIdFromFolder(DRIVE_FOLDER_ID, DRIVE_API_KEY);
    if (folderLatestId) {
      targetFileId = folderLatestId;
    } else {
      console.log('⚠️ No se pudo resolver automáticamente el archivo desde la carpeta, usando DRIVE_FILE_ID de respaldo.');
    }
  }

  if (targetFileId) {
    console.log(`📥 Descargando Excel desde Google Drive (ID: ${targetFileId})...`);
    const downloadUrl = `https://docs.google.com/uc?export=download&id=${targetFileId}`;
    await downloadFile(downloadUrl, TEMP_XLSX);
    fileToRead = TEMP_XLSX;
  } else if (fs.existsSync(ROOT_XLSX)) {
    console.log('📂 Usando Propiedades.xlsx local...');
    fileToRead = ROOT_XLSX;
  } else {
    console.error('❌ ERROR: No se encontró DRIVE_FOLDER_ID, DRIVE_FILE_ID ni el archivo local Propiedades.xlsx.');
    process.exit(1);
  }

  console.log('🔄 Leyendo y convirtiendo Excel a data.json...');
  const fileBuffer = fs.readFileSync(fileToRead);
  const wb = XLSX.read(fileBuffer);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawExcel = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const PREFIX_OP = { ALQ: 'ALQUILER', VEN: 'VENTA', PREV: 'PREVENTA', ANT: 'ANTICRETICO', ENTR: 'ENTREGA INMEDIATA', PROF: 'PROF / LOCAL' };
  
  const jsonRows = rawExcel.map(r => {
    const code = getColValue(r, 'Ncodigo', 'ncodigo', 'Codigo');
    const m = code.match(/^([A-Z]+)(\d+)$/);
    const prefix = m ? m[1] : '';
    const num = m ? parseInt(m[2], 10) : '';
    const op = PREFIX_OP[prefix] || 'VENTA';
    const tempImgRaw = getColValue(r, 'TempImg', 'tempimg', 'Imagenes', 'Fotos');
    const imgs = tempImgRaw.split(',').map(s => s.trim()).filter(Boolean);
    const cover = imgs[0] || '';
    const gallery = imgs.slice(1).join(', ');
    
    const cargo = getColValue(r, 'Cargo', 'cargo');
    const isEx = /^ex/i.test(cargo);
    const disponibleRaw = getColValue(r, 'DISPONIBLE', 'disponible', 'Disponible');
    const isAvailable = disponibleRaw.toLowerCase() === 'si' && !isEx;

    const ofiBroker = getColValue(r, 'Ofi BROKER', 'ofi broker', 'Oficina Broker', 'Oficina');
    const planificadorRaw = getColValue(r, 'Planificador', 'planificador', 'Grupo Planificador');
    const planificador = planificadorRaw ? parseInt(planificadorRaw, 10) || planificadorRaw : '';
    const diaPlanificador = getColValue(r, 'Dia planificador', 'dia planificador', 'Dia');
    const equipoBroker = getColValue(r, 'Eq Broker ', 'eq broker', 'equipo broker', 'Equipo Broker', 'Equipo');

    return {
      data: {
        mERYr: op,
        oHoAu: getColValue(r, 'Tipo', 'tipo'),
        WIoeb: getColValue(r, 'Zona', 'zona'),
        '5kIsO': getColValue(r, 'Propiedad', 'propiedad', 'Titulo'),
        GRkSW: getColValue(r, 'preciofinal', 'precio final', 'Precio'),
        lak0f: num,
        '0C9DE': cover,
        '7fYNu': gallery,
        '34Af3': isAvailable ? 'si' : 'no',
        vDBia: getColValue(r, 'Txt Catalogo', 'txt catalogo', 'Catalogo') || getColValue(r, 'Txt Facebook', 'txt facebook'),
        abzcW: getColValue(r, 'Txt Facebook', 'txt facebook') || getColValue(r, 'Txt Catalogo', 'txt catalogo'),
        PJe5x: cargo ? (isEx ? `Ex (${cargo})` : cargo) : '',
        Cargo: cargo,
        ofiBroker: ofiBroker,
        planificador: planificador,
        UZGXo: planificador,
        diaPlanificador: diaPlanificador,
        a6X7r: diaPlanificador,
        equipoBroker: equipoBroker
      }
    };
  });

  const newJsonStr = JSON.stringify({ rows: jsonRows }, null, 2);
  
  let oldJsonStr = '';
  if (fs.existsSync(TARGET_JSON)) {
    oldJsonStr = fs.readFileSync(TARGET_JSON, 'utf-8');
  }

  if (fs.existsSync(TEMP_XLSX)) {
    try {
      fs.unlinkSync(TEMP_XLSX);
    } catch (e) {
      // Ignorar bloqueo temporal en Windows
    }
  }

  if (oldJsonStr.trim() === newJsonStr.trim()) {
    console.log('✅ No se detectaron cambios en el Excel.');
  } else {
    fs.writeFileSync(TARGET_JSON, newJsonStr, 'utf-8');
    console.log(`✨ data.json actualizado correctamente con ${jsonRows.length} propiedades.`);
  }
}

main().catch(err => {
  console.error('❌ Error en el proceso:', err);
  process.exit(1);
});
