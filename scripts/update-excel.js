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
        const xlsxFile = data.files.find(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv') || (f.mimeType && (f.mimeType.includes('spreadsheet') || f.mimeType.includes('csv'))));
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
  if (!row) return '';
  if (!row._normalizedMap) {
    const map = new Map();
    for (const k of Object.keys(row)) {
      map.set(k.trim().toLowerCase(), row[k]);
    }
    Object.defineProperty(row, '_normalizedMap', { value: map, enumerable: false, writable: true });
  }
  for (const name of possibleNames) {
    const val = row._normalizedMap.get(name.trim().toLowerCase());
    if (val !== undefined && val !== null) {
      return String(val).trim();
    }
  }
  return '';
}

function parseCSV(csvText) {
  if (csvText.charCodeAt(0) === 0xFEFF) {
    csvText = csvText.slice(1);
  }
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal);
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentVal);
      currentVal = '';
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentVal += char;
    }
  }
  if (currentVal !== '' || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });
}

function parseExcelOrCsv(fileBuffer) {
  // Check if buffer is zip/xlsx (PK magic header: 0x50 0x4B 0x03 0x04) or OLE/xls (0xD0 0xCF 0x11 0xE0)
  const isZipXlsx = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B && fileBuffer[2] === 0x03 && fileBuffer[3] === 0x04;
  const isOleXls = fileBuffer.length >= 4 && fileBuffer[0] === 0xD0 && fileBuffer[1] === 0xCF && fileBuffer[2] === 0x11 && fileBuffer[3] === 0xE0;

  if (isZipXlsx || isOleXls) {
    const wb = XLSX.read(fileBuffer, { type: 'buffer', codepage: 65001, raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  // Otherwise, treat as UTF-8 CSV
  const csvText = fileBuffer.toString('utf8');
  return parseCSV(csvText);
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
    console.log(`📥 Descargando archivo desde Google Drive (ID: ${targetFileId})...`);
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

  console.log('🔄 Leyendo y convirtiendo archivo a data.json...');
  const fileBuffer = fs.readFileSync(fileToRead);
  const rawExcel = parseExcelOrCsv(fileBuffer);

  // Cargar mapa previo para preservar planificador/día si no vienen en el nuevo CSV
  const prevDataMap = new Map();
  if (fs.existsSync(TARGET_JSON)) {
    try {
      const prevJson = JSON.parse(fs.readFileSync(TARGET_JSON, 'utf-8'));
      if (prevJson && prevJson.rows) {
        prevJson.rows.forEach(r => {
          if (r && r.data) {
            const c = (r.data.mERYr || '') + '_' + (r.data.lak0f || '');
            const title = (r.data['5kIsO'] || '').trim().toLowerCase();
            if (r.data.planificador || r.data.diaPlanificador) {
              prevDataMap.set(c, { planificador: r.data.planificador, diaPlanificador: r.data.diaPlanificador });
              if (title) prevDataMap.set(title, { planificador: r.data.planificador, diaPlanificador: r.data.diaPlanificador });
            }
          }
        });
      }
    } catch (e) {
      console.warn('⚠️ No se pudo leer data.json previo para respaldo de planificador:', e.message);
    }
  }

  const PREFIX_OP = { ALQ: 'ALQUILER', VEN: 'VENTA', PREV: 'PREVENTA', ANT: 'ANTICRETICO', ENTR: 'ENTREGA INMEDIATA', PROF: 'PROF / LOCAL' };
  
  const jsonRows = rawExcel.map(r => {
    const code = getColValue(r, 'Ncodigo', 'ncodigo', 'Codigo', 'codigo', 'odigo', 'ID', 'id');
    const m = code.match(/^([A-Z]+)(\d+)$/);
    const prefix = m ? m[1] : '';
    const num = m ? parseInt(m[2], 10) : '';
    const op = PREFIX_OP[prefix] || getColValue(r, 'Operacion', 'operacion', 'Operación', 'mERYr') || 'VENTA';
    const tempImgRaw = getColValue(r, 'TempImg', 'tempimg', 'Imagenes', 'imagenes', 'Fotos', 'fotos');
    const imgs = tempImgRaw.split(',').map(s => s.trim()).filter(Boolean);
    const cover = imgs[0] || '';
    const gallery = imgs.slice(1).join(', ');
    
    const cargo = getColValue(r, 'Cargo', 'cargo');
    const isEx = /^ex/i.test(cargo);
    const disponibleRaw = getColValue(r, 'DISPONIBLE', 'disponible', 'Disponible');
    const isAvailable = disponibleRaw.toLowerCase() === 'si' && !isEx;

    const ofiBroker = getColValue(r, 'Ofi BROKER', 'ofi broker', 'Oficina Broker', 'Oficina', 'oficina');
    const planificadorRaw = getColValue(r, 'Planificador', 'planificador', 'Grupo Planificador', 'grupo planificador', 'Grupo', 'grupo');
    let planificador = planificadorRaw ? parseInt(planificadorRaw, 10) || planificadorRaw : '';
    let diaPlanificador = getColValue(r, 'Dia planificador', 'dia planificador', 'Dia', 'dia', 'Día', 'día', 'Day', 'day');

    const equipoBroker = getColValue(r, 'Team', 'team', 'TEAM', 'Eq Broker ', 'Eq Broker', 'eq broker', 'equipo broker', 'Equipo Broker', 'Equipo', 'equipo');
    const consignador = getColValue(r, 'Consignador', 'consignador', 'Consignatario', 'consignatario');
    const propTitle = getColValue(r, 'Propiedad', 'propiedad', 'Titulo', 'titulo');

    // Respaldo de planificador si no vino en el CSV exportado
    if (!planificador || !diaPlanificador) {
      const key1 = op + '_' + num;
      const key2 = propTitle.trim().toLowerCase();
      const prev = prevDataMap.get(key1) || (key2 ? prevDataMap.get(key2) : null);
      if (prev) {
        if (!planificador && prev.planificador) planificador = prev.planificador;
        if (!diaPlanificador && prev.diaPlanificador) diaPlanificador = prev.diaPlanificador;
      }
    }

    return {
      data: {
        mERYr: op,
        oHoAu: getColValue(r, 'Tipo', 'tipo'),
        WIoeb: getColValue(r, 'Zona', 'zona'),
        '5kIsO': propTitle,
        GRkSW: getColValue(r, 'preciofinal', 'precio final', 'Precio', 'precio'),
        lak0f: num,
        '0C9DE': cover,
        '7fYNu': gallery,
        '34Af3': isAvailable ? 'si' : 'no',
        vDBia: getColValue(r, 'Txt Catalogo', 'txt catalogo', 'Catalogo', 'catalogo') || getColValue(r, 'Txt Facebook', 'txt facebook', 'Facebook', 'facebook'),
        abzcW: getColValue(r, 'Txt Facebook', 'txt facebook', 'Facebook', 'facebook') || getColValue(r, 'Txt Catalogo', 'txt catalogo', 'Catalogo', 'catalogo'),
        PJe5x: cargo ? (isEx ? `Ex (${cargo})` : cargo) : '',
        Cargo: cargo,
        ofiBroker: ofiBroker,
        planificador: planificador,
        UZGXo: planificador,
        diaPlanificador: diaPlanificador,
        a6X7r: diaPlanificador,
        equipoBroker: equipoBroker,
        consignador: consignador
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
    console.log('✅ No se detectaron cambios en el archivo.');
  } else {
    fs.writeFileSync(TARGET_JSON, newJsonStr, 'utf-8');
    console.log(`✨ data.json actualizado correctamente con ${jsonRows.length} propiedades.`);
  }
}

main().catch(err => {
  console.error('❌ Error en el proceso:', err);
  process.exit(1);
});
