const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID || '';

if (!DRIVE_FILE_ID) {
  console.error('❌ ERROR: DRIVE_FILE_ID no está configurado.');
  process.exit(1);
}

const DOWNLOAD_URL = `https://docs.google.com/uc?export=download&id=${DRIVE_FILE_ID}`;
const LOCAL_XLSX = path.join(__dirname, '..', 'temp_propiedades.xlsx');
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

async function main() {
  console.log('📥 Descargando Propiedades.xlsx desde Google Drive...');
  await downloadFile(DOWNLOAD_URL, LOCAL_XLSX);

  console.log('🔄 Leyendo y convirtiendo Excel a data.json...');
  const wb = XLSX.readFile(LOCAL_XLSX);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawExcel = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const PREFIX_OP = { ALQ: 'ALQUILER', VEN: 'VENTA', PREV: 'PREVENTA', ANT: 'ANTICRETICO', ENTR: 'ENTREGA INMEDIATA', PROF: 'PROF / LOCAL' };
  
  const jsonRows = rawExcel.map(r => {
    const code = String(r['Ncodigo'] || '').trim();
    const m = code.match(/^([A-Z]+)(\d+)$/);
    const prefix = m ? m[1] : '';
    const num = m ? parseInt(m[2], 10) : '';
    const op = PREFIX_OP[prefix] || 'VENTA';
    const imgs = String(r['TempImg'] || '').split(',').map(s => s.trim()).filter(Boolean);
    const cover = imgs[0] || '';
    const gallery = imgs.slice(1).join(', ');
    const cargo = String(r['Cargo'] || '').trim();
    const isEx = /^ex/i.test(cargo);
    const isAvailable = String(r['DISPONIBLE'] || '').trim().toLowerCase() === 'si' && !isEx;

    return {
      data: {
        mERYr: op,
        oHoAu: r['Tipo'] || '',
        WIoeb: r['Zona'] || '',
        '5kIsO': r['Propiedad'] || '',
        GRkSW: r['preciofinal'] || '',
        lak0f: num,
        '0C9DE': cover,
        '7fYNu': gallery,
        '34Af3': isAvailable ? 'si' : 'no',
        vDBia: r['Txt Catalogo'] || r['Txt Facebook'] || '',
        abzcW: r['Txt Facebook'] || r['Txt Catalogo'] || '',
        PJe5x: cargo ? (isEx ? `Ex (${cargo})` : cargo) : ''
      }
    };
  });

  const newJsonStr = JSON.stringify({ rows: jsonRows }, null, 2);
  
  let oldJsonStr = '';
  if (fs.existsSync(TARGET_JSON)) {
    oldJsonStr = fs.readFileSync(TARGET_JSON, 'utf-8');
  }

  if (fs.existsSync(LOCAL_XLSX)) {
    fs.unlinkSync(LOCAL_XLSX);
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
