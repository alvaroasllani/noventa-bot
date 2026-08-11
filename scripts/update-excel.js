const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID || '';
const ROOT_XLSX = path.join(__dirname, '..', 'Propiedades.xlsx');
const TEMP_XLSX = path.join(__dirname, '..', 'temp_propiedades.xlsx');
const TARGET_JSON = path.join(__dirname, '..', 'data.json');

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

  if (DRIVE_FILE_ID) {
    console.log('📥 Descargando Excel desde Google Drive...');
    const downloadUrl = `https://docs.google.com/uc?export=download&id=${DRIVE_FILE_ID}`;
    await downloadFile(downloadUrl, TEMP_XLSX);
    fileToRead = TEMP_XLSX;
  } else if (fs.existsSync(ROOT_XLSX)) {
    console.log('📂 Usando Propiedades.xlsx local...');
    fileToRead = ROOT_XLSX;
  } else {
    console.error('❌ ERROR: No se encontró DRIVE_FILE_ID ni el archivo local Propiedades.xlsx.');
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
    console.log('✅ No se detectaron cambios en Propiedades.xlsx.');
  } else {
    fs.writeFileSync(TARGET_JSON, newJsonStr, 'utf-8');
    console.log(`✨ data.json actualizado correctamente con ${jsonRows.length} propiedades.`);
  }
}

main().catch(err => {
  console.error('❌ Error en el proceso:', err);
  process.exit(1);
});
