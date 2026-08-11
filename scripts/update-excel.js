const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID || '';
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';
const DRIVE_API_KEY = process.env.DRIVE_API_KEY || '';

const ROOT_XLSX = path.join(__dirname, '..', 'Propiedades.xlsx');
const TEMP_XLSX = path.join(__dirname, '..', 'temp_propiedades.xlsx');
const TARGET_JSON = path.join(__dirname, '..', 'data.json');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
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
    const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
    const html = await fetchText(embedUrl);
    const matches = [...html.matchAll(/id="entry-([^"]+)"[\s\S]*?<div class="name" title="([^"]+)"[\s\S]*?<div class="date" title="([^"]+)"/g)];
    if (matches.length > 0) {
      const files = matches.map(m => ({ id: m[1], name: m[2], dateStr: m[3] }));
      const xlsxFiles = files.filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || !f.name.includes('.'));
      if (xlsxFiles.length > 0) {
        console.log(`📌 Archivo más reciente en carpeta pública: ${xlsxFiles[0].name}`);
        return xlsxFiles[0].id;
      }
    }
  } catch (e) {
    console.log('⚠️ No se pudo obtener la lista vía vista pública de carpeta:', e.message);
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
