const fs = require('fs');
const path = require('path');
const https = require('https');
const NinetyDataAdapter = require('../data-adapter.js');

const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID || '';
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1FBlEYxCM8HrI9AAh_cLISbIgb8cCbbsT';
const DRIVE_API_KEY = process.env.DRIVE_API_KEY || '';

const ROOT_XLSX = path.join(__dirname, '..', 'Propiedades.xlsx');
const TEMP_XLSX = path.join(__dirname, '..', 'temp_inmuebles.csv');
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
    let lastModified = null;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 301) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status ${res.statusCode}`));
      }
      if (res.headers['last-modified']) {
        lastModified = new Date(res.headers['last-modified']).toISOString();
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(lastModified));
      });
      file.on('error', err => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
    req.on('error', reject);
  });
}

async function getLatestFileInfoFromFolder(folderId, apiKey) {
  if (apiKey) {
    try {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        orderBy: 'modifiedTime desc',
        pageSize: '1000',
        fields: 'files(id,name,modifiedTime,mimeType)',
        key: apiKey
      });
      const apiUrl = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
      const jsonText = await fetchText(apiUrl);
      const data = JSON.parse(jsonText);
      if (data.files && data.files.length > 0) {
        const file = data.files.find(f => String(f.name || '').toLowerCase().endsWith('.csv'));
        if (file) {
          console.log(`📌 CSV más reciente encontrado vía API: ${file.name} (Modificado: ${file.modifiedTime})`);
          return { id: file.id, name: file.name, modifiedTime: file.modifiedTime };
        }
      }
      console.log('⚠️ La carpeta no contiene archivos CSV visibles para la API de Drive.');
    } catch (e) {
      console.log('⚠️ Error al consultar Drive API v3:', e.message);
    }

    // Con API configurada evitamos inspeccionar el HTML de Drive, porque allí
    // no es posible distinguir de forma segura un CSV de imágenes u otros archivos.
    return null;
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
                  const lm = res2.headers['last-modified'] ? new Date(res2.headers['last-modified']).toISOString() : '';
                  resolve({ id, lm });
                }).on('error', () => resolve({ id, lm: '' }));
              } else {
                const lm = res.headers['last-modified'] ? new Date(res.headers['last-modified']).toISOString() : '';
                resolve({ id, lm });
              }
            }).on('error', () => resolve({ id, lm: '' }));
          });
          return headRes;
        } catch (e) {
          return { id, lm: '' };
        }
      }));

      fileInfos.sort((a, b) => new Date(b.lm || 0) - new Date(a.lm || 0));
      if (fileInfos[0] && fileInfos[0].id) {
        console.log(`📌 Seleccionado archivo más reciente (ID: ${fileInfos[0].id}, Fecha: ${fileInfos[0].lm})`);
        return { id: fileInfos[0].id, name: 'Propiedades.csv', modifiedTime: fileInfos[0].lm };
      }
    }
  } catch (e) {
    console.log('⚠️ No se pudo obtener la lista vía vista de carpeta:', e.message);
  }

  return null;
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

function parseExcelOrCsv(fileBuffer) {
  // Check if buffer is zip/xlsx (PK magic header: 0x50 0x4B 0x03 0x04) or OLE/xls (0xD0 0xCF 0x11 0xE0)
  const isZipXlsx = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B && fileBuffer[2] === 0x03 && fileBuffer[3] === 0x04;
  const isOleXls = fileBuffer.length >= 4 && fileBuffer[0] === 0xD0 && fileBuffer[1] === 0xCF && fileBuffer[2] === 0x11 && fileBuffer[3] === 0xE0;

  if (isZipXlsx || isOleXls) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(fileBuffer, { type: 'buffer', codepage: 65001, raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  // Otherwise, treat as UTF-8 CSV
  const csvText = fileBuffer.toString('utf8');
  return NinetyDataAdapter.parseCSV(csvText);
}

async function main() {
  let fileToRead = '';
  let fileModifiedTime = '';
  let sourceFileName = '';
  const customArg = process.argv[2];
  const ROOT_CSV24 = path.join(__dirname, '..', 'Propiedades (24).csv');
  const ROOT_CSV = path.join(__dirname, '..', 'Propiedades.csv');
  const localInmueblesCsv = fs.readdirSync(path.join(__dirname, '..'))
    .filter(name => /^inmuebles(?:\s*\(\d+\))?\.csv$/i.test(name))
    .map(name => ({ name, path: path.join(__dirname, '..', name), mtime: fs.statSync(path.join(__dirname, '..', name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];

  let targetFileId = DRIVE_FILE_ID;
  let driveInfo = null;

  if (customArg && fs.existsSync(customArg)) {
    console.log(`📂 Usando archivo especificado: ${customArg}...`);
    fileToRead = customArg;
    sourceFileName = path.basename(customArg);
  } else if (process.env.CI || process.env.FORCE_DRIVE) {
    if (DRIVE_FOLDER_ID) {
      console.log(`📂 Buscando el CSV más reciente dentro de la carpeta Drive ID: ${DRIVE_FOLDER_ID}...`);
      driveInfo = await getLatestFileInfoFromFolder(DRIVE_FOLDER_ID, DRIVE_API_KEY);
      if (driveInfo && driveInfo.id) {
        targetFileId = driveInfo.id;
        fileModifiedTime = driveInfo.modifiedTime || '';
        sourceFileName = driveInfo.name || 'Propiedades.csv';
      } else {
        console.log('⚠️ No se pudo resolver automáticamente el archivo desde la carpeta, usando DRIVE_FILE_ID de respaldo.');
      }
    }

    if (targetFileId) {
      console.log(`📥 Descargando archivo desde Google Drive (ID: ${targetFileId})...`);
      const downloadUrl = `https://docs.google.com/uc?export=download&id=${targetFileId}`;
      const lm = await downloadFile(downloadUrl, TEMP_XLSX);
      fileToRead = TEMP_XLSX;
      if (!sourceFileName) sourceFileName = 'inmuebles.csv';
      if (!fileModifiedTime && lm) fileModifiedTime = lm;
    } else if (localInmueblesCsv) {
      console.log(`📂 Usando ${localInmueblesCsv.name} local...`);
      fileToRead = localInmueblesCsv.path;
      sourceFileName = localInmueblesCsv.name;
    } else if (fs.existsSync(ROOT_CSV24)) {
      console.log('📂 Usando Propiedades (24).csv local...');
      fileToRead = ROOT_CSV24;
      sourceFileName = 'Propiedades (24).csv';
    } else if (fs.existsSync(ROOT_CSV)) {
      console.log('📂 Usando Propiedades.csv local...');
      fileToRead = ROOT_CSV;
      sourceFileName = 'Propiedades.csv';
    } else if (fs.existsSync(ROOT_XLSX)) {
      console.log('📂 Usando Propiedades.xlsx local...');
      fileToRead = ROOT_XLSX;
      sourceFileName = 'Propiedades.xlsx';
    }
  } else if (localInmueblesCsv) {
    console.log(`📂 Usando ${localInmueblesCsv.name} local...`);
    fileToRead = localInmueblesCsv.path;
    sourceFileName = localInmueblesCsv.name;
  } else if (fs.existsSync(ROOT_CSV24)) {
    console.log('📂 Usando Propiedades (24).csv local...');
    fileToRead = ROOT_CSV24;
    sourceFileName = 'Propiedades (24).csv';
  } else if (fs.existsSync(ROOT_CSV)) {
    console.log('📂 Usando Propiedades.csv local...');
    fileToRead = ROOT_CSV;
    sourceFileName = 'Propiedades.csv';
  } else if (fs.existsSync(ROOT_XLSX)) {
    console.log('📂 Usando Propiedades.xlsx local...');
    fileToRead = ROOT_XLSX;
    sourceFileName = 'Propiedades.xlsx';
  } else if (DRIVE_FOLDER_ID || DRIVE_FILE_ID) {
    if (DRIVE_FOLDER_ID) {
      console.log(`📂 Buscando el CSV más reciente dentro de la carpeta Drive ID: ${DRIVE_FOLDER_ID}...`);
      driveInfo = await getLatestFileInfoFromFolder(DRIVE_FOLDER_ID, DRIVE_API_KEY);
      if (driveInfo && driveInfo.id) {
        targetFileId = driveInfo.id;
        fileModifiedTime = driveInfo.modifiedTime || '';
        sourceFileName = driveInfo.name || 'Propiedades.csv';
      }
    }
    if (targetFileId) {
      console.log(`📥 Descargando archivo desde Google Drive (ID: ${targetFileId})...`);
      const downloadUrl = `https://docs.google.com/uc?export=download&id=${targetFileId}`;
      const lm = await downloadFile(downloadUrl, TEMP_XLSX);
      fileToRead = TEMP_XLSX;
      if (!fileModifiedTime && lm) fileModifiedTime = lm;
    }
  }

  if (!fileToRead) {
    console.error('❌ ERROR: No se encontró ningún archivo para procesar.');
    process.exit(1);
  }

  if (!fileModifiedTime && fs.existsSync(fileToRead)) {
    const stats = fs.statSync(fileToRead);
    fileModifiedTime = stats.mtime.toISOString();
  }
  if (!sourceFileName) {
    sourceFileName = path.basename(fileToRead);
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
  
  const isNinetyCsv = NinetyDataAdapter.isNinetyExport(rawExcel);
  const jsonRows = isNinetyCsv ? NinetyDataAdapter.normalizeNinetyRows(rawExcel) : rawExcel.map(r => {
    const code = getColValue(r, 'Ncodigo', 'ncodigo', 'Codigo', 'codigo', 'odigo', 'ID', 'id');
    const m = code.match(/^([A-Z]+)(\d+)$/);
    const prefix = m ? m[1] : '';
    const num = m ? parseInt(m[2], 10) : '';
    const op = PREFIX_OP[prefix] || getColValue(r, 'Operacion', 'operacion', 'Operación', 'mERYr') || 'VENTA';
    const tempImgRaw = getColValue(r, 'TempImg', 'tempimg', 'Imagenes', 'imagenes', 'Fotos', 'fotos');
    const imgs = tempImgRaw.split(',').map(s => s.trim()).filter(Boolean);
    const cover = imgs[0] || '';
    const gallery = imgs.slice(1).join(', ');
    
    const reservadoRaw = getColValue(r, 'Reservado', 'reservado', 'Reserva', 'reserva');
    const isReserved = /^(true|si)$/i.test(reservadoRaw.trim());

    const actPrecioRaw = getColValue(r, 'Actualizacion precio', 'actualizacion precio', 'Actualización precio', 'actualización precio', 'Actualizacion', 'actualizacion', 'Actualización', 'actualización');
    const isActPrecio = /^(true|si)$/i.test(actPrecioRaw.trim());

    const cargo = getColValue(r, 'Cargo', 'cargo');
    const isEx = /^ex/i.test(cargo);
    const disponibleRaw = getColValue(r, 'DISPONIBLE', 'disponible', 'Disponible');
    const isAvailable = disponibleRaw.toLowerCase() === 'si' && !isEx && !isReserved && !isActPrecio;

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
        consignador: consignador,
        reservado: isReserved ? 'si' : 'no',
        Reservado: isReserved ? 'si' : 'no',
        actualizacionPrecio: isActPrecio ? 'si' : 'no',
        'Actualizacion precio': isActPrecio ? 'si' : 'no'
      }
    };
  });

  const finalFileName = sourceFileName || path.basename(fileToRead);
  const versionMatch = finalFileName.match(/\((\d+)\)/) || finalFileName.match(/v?(\d+)/);
  const csvVersion = versionMatch ? `CSV #${versionMatch[1]}` : (finalFileName.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel');

  const nextJson = {
    version: csvVersion,
    sourceFile: finalFileName,
    updatedAt: fileModifiedTime || new Date().toISOString(),
    totalRows: jsonRows.length,
    publishableRows: jsonRows.filter(row => row.data && row.data['34Af3'] === 'si').length,
    rows: jsonRows
  };

  const newJsonStr = JSON.stringify(nextJson, null, 2);
  
  let oldJsonStr = '';
  let oldJson = null;
  if (fs.existsSync(TARGET_JSON)) {
    oldJsonStr = fs.readFileSync(TARGET_JSON, 'utf-8');
    try {
      oldJson = JSON.parse(oldJsonStr);
    } catch (e) {
      console.warn('⚠️ data.json previo no es JSON válido y será reemplazado:', e.message);
    }
  }

  if (fs.existsSync(TEMP_XLSX)) {
    try {
      fs.unlinkSync(TEMP_XLSX);
    } catch (e) {
      // Ignorar bloqueo temporal en Windows
    }
  }

  const oldCatalog = oldJson ? JSON.stringify({
    totalRows: oldJson.totalRows,
    publishableRows: oldJson.publishableRows,
    rows: oldJson.rows
  }) : '';
  const nextCatalog = JSON.stringify({
    totalRows: nextJson.totalRows,
    publishableRows: nextJson.publishableRows,
    rows: nextJson.rows
  });

  if (oldCatalog && oldCatalog === nextCatalog) {
    console.log('✅ El catálogo no cambió; se conserva data.json sin crear otro commit.');
  } else {
    fs.writeFileSync(TARGET_JSON, newJsonStr, 'utf-8');
    console.log(`✨ data.json actualizado correctamente con ${jsonRows.length} propiedades.`);
  }
}

main().catch(err => {
  console.error('❌ Error en el proceso:', err);
  process.exit(1);
});
