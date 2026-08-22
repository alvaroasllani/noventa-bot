// --- THEME MANAGEMENT ---
function initTheme() {
  const savedTheme = localStorage.getItem('nova_theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nova_theme', theme);
  const sunIcon = document.getElementById('sunIcon');
  const moonIcon = document.getElementById('moonIcon');
  const themeLabel = document.getElementById('themeLabel');
  
  if (theme === 'dark') {
    if (sunIcon) sunIcon.style.display = 'inline';
    if (moonIcon) moonIcon.style.display = 'none';
    if (themeLabel) themeLabel.textContent = 'Claro';
  } else {
    if (sunIcon) sunIcon.style.display = 'none';
    if (moonIcon) moonIcon.style.display = 'inline';
    if (themeLabel) themeLabel.textContent = 'Oscuro';
  }
}

document.getElementById('themeToggleBtn').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

document.getElementById('reloadPageBtn')?.addEventListener('click', () => {
  window.location.reload();
});

initTheme();

let ROWS = [];
const FIELD = {
  op: 'mERYr',       // ALQUILER / VENTA / PREVENTA / ANTICRETICO / ...
  type: 'oHoAu',      // Departamento / Casa / Local comercial ...
  zone: 'WIoeb',
  title: '5kIsO',
  price: 'GRkSW',
  currency: 'UOFib',
  code: 'lak0f',
  cover: '0C9DE',
  photos: '7fYNu',
  day: 'a6X7r',        // día programado de publicación (ej. "Domingo")
  diaPlanificador: 'diaPlanificador',
  status: 'TieEY',     // estado (ej. "Abierta")
  group: 'UZGXo',      // grupo del Planificador (1-5, checkboxes en la app)
  planificador: 'planificador',
  active: '34Af3',     // publicado / activo ("si" vs "no")
  agent: 'PJe5x',      // Asesor / Supervisor responsable
  cargo: 'Cargo',
  ofiBroker: 'ofiBroker',
  equipoBroker: 'equipoBroker',
  catalog: 'vDBia',    // Texto catálogo de la propiedad
  facebook: 'abzcW',   // Texto Facebook de la propiedad
  consignador: 'consignador'
};

const PREFIX = {
  'ALQUILER': 'ALQ',
  'VENTA': 'VEN',
  'PREVENTA': 'PREV',
  'ANTICRETICO': 'ANT',
  'ENTREGA INMEDIATA': 'ENTR',
  'PROF / LOCAL': 'PROF'
};

// --- BULK DOWNLOAD CONTROL STATE ---
let IS_DOWNLOADING_ALL = false;
let IS_PAUSED_ALL = false;
let CANCEL_DOWNLOADING_ALL = false;

function resetBulkDownloadState() {
  IS_DOWNLOADING_ALL = false;
  IS_PAUSED_ALL = false;
  CANCEL_DOWNLOADING_ALL = false;
  
  const btnText = document.getElementById('downloadAllBtnText');
  const cancelBtn = document.getElementById('cancelDownloadBtn');
  const bulkPill = document.getElementById('bulkStatusPill');
  const iconWrap = document.getElementById('downloadAllIcon');
  
  if (btnText) btnText.textContent = 'Descargar todo';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (bulkPill) {
    bulkPill.classList.remove('show');
    bulkPill.textContent = '';
  }
  if (iconWrap) {
    iconWrap.innerHTML = `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`;
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function driveIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
function driveDownloadUrl(id) {
  if (!id || !/^[a-zA-Z0-9_-]{10,100}$/.test(id)) return '';
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}
function triggerDownload(url) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function driveThumbUrl(id) {
  if (!id || !/^[a-zA-Z0-9_-]{10,100}$/.test(id)) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w200`;
}

function parsePhotos(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean)
    .map(driveIdFromUrl).filter(Boolean);
}

function populateSelect(sel, values, placeholder) {
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  [...values].sort().forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
  sel.value = cur;
}

// --- INDEXEDDB STORAGE FOR CUSTOM DATA.JSON ---
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('NovaDownloadDB', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function getStoredData() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('customDataJson');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function setStoredData(text, fileName) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ text, fileName, date: new Date().toISOString() }, 'customDataJson');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function clearStoredData() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.delete('customDataJson');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

function isExAgent(name) {
  if (!name) return false;
  return /^ex([\s\-_].*|$)/i.test(name.trim());
}

function updateAgentDropdown() {
  const sel = document.getElementById('agentFilter');
  if (!sel) return;
  const onlyActive = document.getElementById('onlyActiveAgentsCheck')?.checked ?? true;
  const curValue = sel.value;

  const agentMap = new Map();
  ROWS.forEach(d => {
    const agList = [d['Lt6BS'], d[FIELD.agent], d['Pverj'], d['bF4oQ']];
    const isActive = String(d[FIELD.active] || '').toLowerCase() === 'si';
    const isOpen = d[FIELD.status] !== 'Cerrada';

    const seenInRow = new Set();
    agList.forEach(rawName => {
      if (!rawName) return;
      const name = rawName.trim();
      if (!name || seenInRow.has(name)) return;
      seenInRow.add(name);

      if (!agentMap.has(name)) {
        agentMap.set(name, { total: 0, activeOpen: 0, isEx: isExAgent(name) });
      }
      const info = agentMap.get(name);
      info.total++;
      if (isActive && isOpen) info.activeOpen++;
    });
  });

  const sortedAgents = Array.from(agentMap.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));

  let filtered = sortedAgents;
  if (onlyActive) {
    filtered = sortedAgents.filter(([name, info]) => info.activeOpen > 0 && !info.isEx);
  }

  const placeholder = onlyActive
    ? `Asesor (${filtered.length} activos)`
    : `Asesor (todos - ${sortedAgents.length})`;

  sel.innerHTML = `<option value="">${placeholder}</option>`;

  filtered.forEach(([name, info]) => {
    const o = document.createElement('option');
    o.value = name;
    if (onlyActive) {
      o.textContent = `${name} (${info.activeOpen})`;
    } else {
      let tag = '';
      if (info.isEx) tag = ' (EX-Asesor)';
      else if (info.activeOpen === 0) tag = ' (0 - inactivo)';
      else tag = ` (${info.activeOpen})`;
      o.textContent = `${name}${tag}`;
    }
    sel.appendChild(o);
  });

  if (filtered.some(([name]) => name === curValue)) {
    sel.value = curValue;
  } else {
    sel.value = '';
  }
}

function updateEquipoDropdown() {
  const ofiSelected = document.getElementById('ofiFilter')?.value || '';
  const equipoSel = document.getElementById('equipoFilter');
  if (!equipoSel) return;

  const currentVal = equipoSel.value;
  const teams = new Set();

  ROWS.forEach(d => {
    const ofiVal = String(d['ofiBroker'] || d['Ofi BROKER'] || '').trim();
    const eqVal = String(d['equipoBroker'] || d['Eq Broker '] || d['Equipo Broker'] || '').trim();
    if (eqVal) {
      if (!ofiSelected || ofiVal === ofiSelected) {
        teams.add(eqVal);
      }
    }
  });

  const sortedTeams = Array.from(teams).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  equipoSel.innerHTML = '<option value="">Equipo (todos)</option>';
  sortedTeams.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    equipoSel.appendChild(opt);
  });

  if (currentVal && teams.has(currentVal)) {
    equipoSel.value = currentVal;
    equipoSel.classList.add('has-value');
  } else {
    equipoSel.value = '';
    equipoSel.classList.remove('has-value');
  }
}

function updateConsignadorDropdown() {
  const sel = document.getElementById('consignadorFilter');
  if (!sel) return;
  const curValue = sel.value;

  const consignadorMap = new Map();
  ROWS.forEach(d => {
    const rawConsignador = String(d[FIELD.consignador] || d['consignador'] || d['Consignador'] || '').trim();
    if (!rawConsignador) return;

    const cargo = String(d[FIELD.cargo] || d['Cargo'] || '').trim();
    const isEx = /^ex/i.test(cargo) || isExAgent(rawConsignador);
    if (isEx) return;

    const isActive = String(d[FIELD.active] || '').toLowerCase() === 'si';
    const isOpen = d[FIELD.status] !== 'Cerrada';

    if (!consignadorMap.has(rawConsignador)) {
      consignadorMap.set(rawConsignador, { total: 0, activeOpen: 0 });
    }
    const info = consignadorMap.get(rawConsignador);
    info.total++;
    if (isActive && isOpen) info.activeOpen++;
  });

  const sortedConsignadores = Array.from(consignadorMap.entries())
    .filter(([_, info]) => info.activeOpen > 0)
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { sensitivity: 'base' }));

  sel.innerHTML = `<option value="">Consignador (${sortedConsignadores.length})</option>`;

  sortedConsignadores.forEach(([name, info]) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${name} (${info.activeOpen})`;
    sel.appendChild(opt);
  });

  if (sortedConsignadores.some(([name]) => name === curValue)) {
    sel.value = curValue;
    sel.classList.add('has-value');
  } else {
    sel.value = '';
    sel.classList.remove('has-value');
  }
}

function loadData(text, isUserUpload = false) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    if (isUserUpload) alert('No se pudo leer el archivo. Asegúrate de subir el JSON completo tal como lo copiaste de DevTools.');
    return false;
  }
  const rows = json.rows || json;
  ROWS = (Array.isArray(rows) ? rows : []).map(r => r.data || r).filter(d => d && d[FIELD.op]);

  document.getElementById('filtersCard').style.display = 'block';
  document.getElementById('opSegmentedBar').style.display = 'flex';
  document.getElementById('toolbar').style.display = 'flex';
  document.getElementById('hint').style.display = 'block';

  const ops = new Set(), types = new Set(), zones = new Set(), days = new Set(), statuses = new Set(), ofis = new Set();
  ROWS.forEach(d => {
    if (d[FIELD.op]) ops.add(d[FIELD.op]);
    if (d[FIELD.type]) types.add(d[FIELD.type]);
    if (d[FIELD.zone]) zones.add(d[FIELD.zone]);
    const dayVal = d['diaPlanificador'] || d[FIELD.day];
    if (dayVal) days.add(dayVal);
    if (d[FIELD.status]) statuses.add(d[FIELD.status]);
    const ofiVal = d['ofiBroker'] || d['Ofi BROKER'];
    if (ofiVal) ofis.add(ofiVal);
  });

  populateSelect(document.getElementById('opFilter'), ops, 'Operación (todas)');
  populateSelect(document.getElementById('zoneFilter'), zones, 'Zona (todas)');
  populateSelect(document.getElementById('ofiFilter'), ofis, 'Oficina Broker (todas)');
  updateEquipoDropdown();
  updateConsignadorDropdown();

  // Configurar Chips de Día Planificador (selección única con detección automática del día de hoy)
  const dayWrap = document.getElementById('dayChips');
  if (dayWrap) {
    dayWrap.innerHTML = '';
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayName = dayNames[new Date().getDay()];
    const shortNames = { 'Lunes': 'Lun', 'Martes': 'Mar', 'Miércoles': 'Mié', 'Jueves': 'Jue', 'Viernes': 'Vie', 'Sábado': 'Sáb', 'Domingo': 'Dom' };

    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].forEach(dayName => {
      const label = document.createElement('label');
      const shortText = shortNames[dayName] || dayName;
      label.className = 'chip';
      label.title = dayName;
      label.innerHTML = `<input type="radio" name="dayChipRadio" value="${dayName}"> ${shortText}`;
      
      label.addEventListener('click', (e) => {
        e.preventDefault();
        const radio = label.querySelector('input');
        const wasChecked = label.classList.contains('active');

        // Desmarcar todos los demás
        dayWrap.querySelectorAll('.chip').forEach(c => {
          c.classList.remove('active');
          c.querySelector('input').checked = false;
        });

        if (!wasChecked) {
          label.classList.add('active');
          radio.checked = true;
        }
        render(true);
      });
      dayWrap.appendChild(label);
    });
  }

  // Configurar Chips de Grupo Planificador (1 al 5 - multiselección, solo números)
  const groupWrap = document.getElementById('groupChecks');
  if (groupWrap) {
    groupWrap.innerHTML = '';
    [1, 2, 3, 4, 5].forEach(n => {
      const label = document.createElement('label');
      label.className = 'chip chip-num';
      label.innerHTML = `<input type="checkbox" value="${n}"> ${n}`;
      label.querySelector('input').addEventListener('change', (e) => {
        label.classList.toggle('active', e.target.checked);
        render(true);
      });
      groupWrap.appendChild(label);
    });
  }

  render(true);
  return true;
}

async function initData() {
  const statText = document.getElementById('fileStatText');
  const resetBtn = document.getElementById('resetDataBtn');
  statText.innerHTML = '⌛ Cargando datos...';

  const custom = await getStoredData();
  if (custom && custom.text) {
    const ok = loadData(custom.text, false);
    if (ok) {
      const d = new Date(custom.date);
      const fDate = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statText.innerHTML = `✅ <b>Propiedades.xlsx personalizado cargado</b> (${ROWS.length} objetos · ${fDate})`;
      resetBtn.style.display = 'inline-flex';
      return;
    }
  }
  fetchDefaultData();
}

let currentDataSignature = null;
let checkerInterval = null;

async function checkForRemoteUpdate() {
  if (document.hidden) return; // Pausar verificación si la pestaña está oculta/minimizada

  try {
    // Petición HEAD: Solo pide encabezados HTTP (~0.5 KB), NO descarga el contenido data.json
    let res = await fetch(`./data.json?v=${Date.now()}`, { method: 'HEAD', cache: 'no-cache' });
    let sig = '';

    if (res.ok) {
      const etag = res.headers.get('etag');
      const lm = res.headers.get('last-modified');
      const cl = res.headers.get('content-length');
      sig = etag || lm || cl || '';
    }

    // Respaldo por si el servidor no incluye etag/last-modified en respuestas HEAD
    if (!sig) {
      res = await fetch(`./data.json?v=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) return;
      const text = await res.text();
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }
      sig = `${text.length}_${hash}`;
    }

    if (currentDataSignature && sig && sig !== currentDataSignature) {
      const btn = document.getElementById('reloadPageBtn');
      if (btn && !btn.classList.contains('has-update')) {
        btn.classList.add('has-update');
        btn.title = '✨ ¡Nueva versión o push detectado! Haz clic para recargar la página';
      }
    }
  } catch (e) {
    // Ignorar errores de red silenciosamente
  }
}

function startAutoUpdateChecker() {
  if (checkerInterval) return;
  checkerInterval = setInterval(checkForRemoteUpdate, 30000);
  window.addEventListener('focus', checkForRemoteUpdate);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForRemoteUpdate();
  });
}

async function fetchDefaultData() {
  const statText = document.getElementById('fileStatText');
  const resetBtn = document.getElementById('resetDataBtn');
  statText.innerHTML = '⌛ Cargando datos base...';
  resetBtn.style.display = 'none';

  try {
    const res = await fetch(`./data.json?v=${Date.now()}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const etag = res.headers.get('etag');
    const lm = res.headers.get('last-modified');
    const cl = res.headers.get('content-length');

    const text = await res.text();
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    currentDataSignature = etag || lm || cl || `${text.length}_${hash}`;

    const ok = loadData(text, false);
    if (ok) {
      statText.innerHTML = `✅ <b>Datos de Propiedades cargados</b> (${ROWS.length} objetos)`;
      startAutoUpdateChecker();
    } else {
      statText.innerHTML = `⚠️ Error al procesar datos base. Puedes subir Propiedades.xlsx abajo.`;
    }
  } catch (e) {
    statText.innerHTML = `⚠️ No se pudieron cargar los datos base. Sube Propiedades.xlsx abajo.`;
  }
}

async function handleUserFileUpload(file) {
  if (!file) return;
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') {
      alert('La librería para leer archivos Excel no está disponible.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawExcel = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const PREFIX_OP = { ALQ: 'ALQUILER', VEN: 'VENTA', PREV: 'PREVENTA', ANT: 'ANTICRETICO', ENTR: 'ENTREGA INMEDIATA', PROF: 'PROF / LOCAL' };
        const jsonRows = rawExcel.map(r => {
          const getVal = (...names) => {
            const keys = Object.keys(r);
            for (const n of names) {
              const target = n.trim().toLowerCase();
              const found = keys.find(k => k.trim().toLowerCase() === target);
              if (found && r[found] !== undefined && r[found] !== null) return String(r[found]).trim();
            }
            return '';
          };
          const code = getVal('Ncodigo', 'ncodigo', 'Codigo');
          const m = code.match(/^([A-Z]+)(\d+)$/);
          const prefix = m ? m[1] : '';
          const num = m ? parseInt(m[2], 10) : '';
          const op = PREFIX_OP[prefix] || 'VENTA';
          const tempImgRaw = getVal('TempImg', 'tempimg', 'Imagenes');
          const imgs = tempImgRaw.split(',').map(s => s.trim()).filter(Boolean);
          const cover = imgs[0] || '';
          const gallery = imgs.slice(1).join(', ');
          const cargo = getVal('Cargo', 'cargo');
          const isEx = /^ex/i.test(cargo);
          const disponible = getVal('DISPONIBLE', 'disponible');
          const isAvailable = disponible.toLowerCase() === 'si' && !isEx;

          const ofiBroker = getVal('Ofi BROKER', 'ofi broker', 'Oficina Broker', 'Oficina');
          const planificadorRaw = getVal('Planificador', 'planificador');
          const planificador = planificadorRaw ? parseInt(planificadorRaw, 10) || planificadorRaw : '';
          const diaPlanificador = getVal('Dia planificador', 'dia planificador', 'Dia');
          const equipoBroker = getVal('Eq Broker ', 'eq broker', 'equipo broker', 'Equipo Broker');
          const consignador = getVal('Consignador', 'consignador', 'Consignatario');

          return {
            data: {
              mERYr: op,
              oHoAu: getVal('Tipo', 'tipo'),
              WIoeb: getVal('Zona', 'zona'),
              '5kIsO': getVal('Propiedad', 'propiedad'),
              GRkSW: getVal('preciofinal', 'precio final'),
              lak0f: num,
              '0C9DE': cover,
              '7fYNu': gallery,
              '34Af3': isAvailable ? 'si' : 'no',
              vDBia: getVal('Txt Catalogo', 'txt catalogo') || getVal('Txt Facebook', 'txt facebook'),
              abzcW: getVal('Txt Facebook', 'txt facebook') || getVal('Txt Catalogo', 'txt catalogo'),
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

        const jsonStr = JSON.stringify({ rows: jsonRows });
        const ok = loadData(jsonStr, true);
        if (ok) {
          await setStoredData(jsonStr, file.name);
          const statText = document.getElementById('fileStatText');
          const resetBtn = document.getElementById('resetDataBtn');
          const now = new Date();
          const fDate = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          statText.innerHTML = `✅ <b>${file.name} subido y guardado en la app</b> (${ROWS.length} objetos · ${fDate})`;
          resetBtn.style.display = 'inline-flex';
        }
      } catch (e) {
        alert('Error al procesar el archivo Excel: ' + e.message);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = async ev => {
    const text = ev.target.result;
    const ok = loadData(text, true);
    if (ok) {
      await setStoredData(text, file.name);
      const statText = document.getElementById('fileStatText');
      const resetBtn = document.getElementById('resetDataBtn');
      const now = new Date();
      const fDate = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statText.innerHTML = `✅ <b>Nuevo archivo subido y guardado localmente</b> (${ROWS.length} objetos · ${fDate})`;
      resetBtn.style.display = 'inline-flex';
    }
  };
  reader.readAsText(file);
}

function getPhotoList(d) {
  const list = [];
  const coverId = driveIdFromUrl(d[FIELD.cover] || '');
  if (coverId) list.push(coverId);

  Object.values(d).forEach(val => {
    if (typeof val === 'string' && !val.includes('/drive/folders/')) {
      val.split(',').forEach(part => {
        const id = driveIdFromUrl(part.trim());
        if (id && !list.includes(id)) {
          list.push(id);
        }
      });
    }
  });
  return list;
}

function extractCodesFromText(text) {
  if (!text) return [];
  const matches = [...text.matchAll(/\b(ALQ|VEN|PREV|ANT|ENTR|PROF)\s*#?\s*(\d+)\b/gi)];
  const codes = matches.map(m => `${m[1].toUpperCase()}${m[2]}`);
  return Array.from(new Set(codes));
}

function currentFiltered() {
  const rawSearch = (document.getElementById('searchInput')?.value || '').trim();
  if (rawSearch) {
    const searchCodes = extractCodesFromText(rawSearch);
    if (searchCodes.length > 0) {
      const matchedRows = [];
      searchCodes.forEach(c => {
        const codeNum = c.replace(/^[A-Z]+/, '');
        const prefix = c.replace(/\d+$/, '');

        const found = ROWS.find(d => {
          if (codeFor(d) === c) return true;
          if (String(d[FIELD.code]) === codeNum && (PREFIX[d[FIELD.op]] === prefix || !d[FIELD.op])) return true;
          const desc = String(d['vDBia'] || '');
          const title = String(d[FIELD.title] || '');
          if (new RegExp(`\\b#?${c}\\b`, 'i').test(desc) || new RegExp(`\\b#?${c}\\b`, 'i').test(title)) return true;
          return false;
        });

        if (found && !matchedRows.includes(found)) {
          matchedRows.push(found);
        }
      });

      if (matchedRows.length > 0) {
        return matchedRows;
      }
    }

    // Si son múltiples términos/números separados por espacio o coma (ej: "119, 648" o "ALQ119 VEN648")
    const searchTokens = rawSearch.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (searchTokens.length > 1) {
      const isMultiCodeOrNum = searchTokens.some(t => /^\d+$/.test(t) || /^[a-z]+\d+$/i.test(t));
      if (isMultiCodeOrNum) {
        return ROWS.filter(d => {
          const code = codeFor(d).toLowerCase();
          const codeNum = String(d[FIELD.code] || '').toLowerCase();
          const title = (d[FIELD.title] || '').toLowerCase();
          const zoneVal = (d[FIELD.zone] || '').toLowerCase();

          return searchTokens.some(token =>
            code === token ||
            codeNum === token ||
            code.includes(token) ||
            title.includes(token) ||
            zoneVal.includes(token)
          );
        });
      }
    }
  }

  const search = rawSearch.toLowerCase();
  const activeOpBtn = document.querySelector('#opSegmentedControl .segment-btn.active');
  const op = activeOpBtn ? (activeOpBtn.dataset.op || '') : (document.getElementById('opFilter')?.value || '');
  const zone = document.getElementById('zoneFilter')?.value || '';
  const ofi = document.getElementById('ofiFilter')?.value || '';
  const equipo = document.getElementById('equipoFilter')?.value || '';
  const consignadorFilter = document.getElementById('consignadorFilter')?.value || '';
  
  const checkedGroups = [...document.querySelectorAll('#groupChecks input:checked')].map(i => String(i.value));
  const activeDayEl = document.querySelector('#dayChips .chip.active input');
  const selectedDay = activeDayEl ? activeDayEl.value : '';

  return ROWS.filter(d => {
    const code = codeFor(d).toLowerCase();
    const title = (d[FIELD.title] || '').toLowerCase();
    const zoneVal = (d[FIELD.zone] || '').toLowerCase();
    const cargo = String(d['Cargo'] || d[FIELD.agent] || '').trim();
    const isExCargo = /^ex/i.test(cargo);

    if (search) {
      if (!code.includes(search) && !title.includes(search) && !zoneVal.includes(search)) return false;
      return true;
    }

    // Regla obligatoria: Solo disponibles (DISPONIBLE == "Si" y Cargo != "EX")
    const isActivePub = d[FIELD.active] && String(d[FIELD.active]).toLowerCase() === 'si';
    if (!isActivePub || isExCargo) return false;

    // Regla obligatoria: Excluir cerradas
    if (d[FIELD.status] === 'Cerrada') return false;

    if (op && d[FIELD.op] !== op) return false;
    if (zone && d[FIELD.zone] !== zone) return false;
    if (ofi && (d['ofiBroker'] || d['Ofi BROKER'] || '') !== ofi) return false;
    if (equipo && (d['equipoBroker'] || d['Eq Broker '] || d['Equipo Broker'] || '') !== equipo) return false;
    if (consignadorFilter && String(d[FIELD.consignador] || d['consignador'] || d['Consignador'] || '').trim() !== consignadorFilter) return false;

    // Filtro de Día Planificador (selección única)
    if (selectedDay) {
      const dayVal = String(d['diaPlanificador'] || d[FIELD.day] || d['a6X7r'] || '').trim();
      if (dayVal !== selectedDay) return false;
    }

    // Filtro de Grupo Planificador (1 al 5 - multiselección)
    if (checkedGroups.length > 0) {
      const val = d['planificador'] ?? d[FIELD.group] ?? d['UZGXo'];
      if (val !== undefined && val !== null && val !== '') {
        const strVal = String(val);
        const isMatch = checkedGroups.some(g => strVal.includes(g));
        if (!isMatch) return false;
      } else {
        return false;
      }
    }

    return true;
  });
}

function codeFor(d) {
  const prefix = PREFIX[d[FIELD.op]] || 'OBJ';
  return `${prefix}${d[FIELD.code] ?? ''}`;
}

async function downloadDirectPhoto(id, filename) {
  try {
    const res = await fetch(`https://lh3.googleusercontent.com/d/${id}`);
    if (!res.ok) throw new Error('Fetch HTTP ' + res.status);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return true;
  } catch (e) {
    const a = document.createElement('a');
    a.href = `https://lh3.googleusercontent.com/d/${id}`;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return false;
  }
}

function getCatalogText(d) {
  if (!d) return '';
  const val = d[FIELD.catalog] || d['vDBia'] || d['Txt Catalogo'] || d['txt catalogo'];
  if (val && String(val).trim()) return String(val).trim();
  const fbVal = d[FIELD.facebook] || d['abzcW'] || d['Txt Facebook'] || d['txt facebook'];
  if (fbVal && String(fbVal).trim()) return String(fbVal).trim();
  const title = d[FIELD.title] || d['5kIsO'] || 'Inmueble';
  return `${codeFor(d)} - ${String(title).trim()}`;
}

function getFacebookText(d) {
  if (!d) return '';
  const fbVal = d[FIELD.facebook] || d['abzcW'] || d['Txt Facebook'] || d['txt facebook'];
  if (fbVal && String(fbVal).trim()) return String(fbVal).trim();
  const catVal = d[FIELD.catalog] || d['vDBia'] || d['Txt Catalogo'] || d['txt catalogo'];
  if (catVal && String(catVal).trim()) return String(catVal).trim();
  const title = d[FIELD.title] || d['5kIsO'] || 'Inmueble';
  return `${codeFor(d)} - ${String(title).trim()}`;
}

function copyToClipboardSync(text) {
  if (!text) return false;
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '2em';
    ta.style.height = '2em';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0.01';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
    ta.remove();
  } catch (e) {
    ok = false;
  }
  if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    ok = true;
  }
  return ok;
}

async function copyToClipboard(text) {
  return copyToClipboardSync(text);
}

function isIOS() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || isTouchMac;
}

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

function safeOpenUrl(url, target = '_blank') {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = target;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { a.remove(); } catch (e) {}
    }, 100);
    return true;
  } catch (e) {
    try {
      window.open(url, target);
      return true;
    } catch (err) {
      console.warn('Error abriendo URL:', err);
      return false;
    }
  }
}

function canShareFiles() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

function getMaxPhotosLimit() {
  const sel = document.getElementById('maxPhotosSelect');
  if (!sel) return 10;
  const val = parseInt(sel.value, 10);
  return isNaN(val) || val <= 0 ? 999 : val;
}

let currentIOSShareContext = 'save';

function openIOSShareModal(d, fileArray, context = 'save') {
  currentIOSShareData = d;
  currentIOSShareFiles = fileArray || [];
  currentIOSShareContext = context;

  const modal = document.getElementById('iosShareModal');
  if (!modal) return;

  const code = codeFor(d);
  const isFB = context === 'facebook';
  const isWA = context === 'whatsapp';
  const catalogText = getCatalogText(d);
  const fbText = getFacebookText(d);
  const activeText = isFB ? fbText : catalogText;
  const textName = isFB ? 'Facebook' : 'Catálogo';

  // Asegurar copia síncrona de texto
  copyToClipboardSync(activeText);

  // Elementos UI del Modal
  const badgeEl = document.getElementById('iosModalBadge');
  const titleEl = document.getElementById('iosModalTitle');
  const alertTextEl = document.getElementById('iosModalAlertText');
  const shareBtnTextEl = document.getElementById('iosModalShareText');
  const waLink = document.getElementById('iosModalWhatsAppLink');
  const fbLink = document.getElementById('iosModalFacebookLink');
  const galleryEl = document.getElementById('iosModalGallery');

  if (badgeEl) badgeEl.textContent = code;
  if (titleEl) {
    if (isFB) titleEl.textContent = 'Publicar en Facebook';
    else if (isWA) titleEl.textContent = 'Enviar por WhatsApp';
    else titleEl.textContent = 'Guardar en Fotos / Compartir';
  }

  if (alertTextEl) {
    alertTextEl.textContent = `Texto ${textName} copiado al portapapeles. Listo para pegar.`;
  }

  if (shareBtnTextEl) {
    const count = currentIOSShareFiles.length;
    if (isFB) shareBtnTextEl.textContent = `📲 Compartir ${count ? count + ' ' : ''}fotos en Facebook`;
    else if (isWA) shareBtnTextEl.textContent = `📲 Compartir ${count ? count + ' ' : ''}fotos en WhatsApp`;
    else shareBtnTextEl.textContent = `📲 Guardar ${count ? count + ' ' : ''}fotos en tu iPhone`;
  }

  if (waLink) {
    waLink.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(catalogText)}`;
  }
  if (fbLink) {
    fbLink.href = 'https://m.facebook.com/';
  }

  if (galleryEl) {
    galleryEl.innerHTML = '';
    const maxPhotos = getMaxPhotosLimit();
    const photoIds = getPhotoList(d).slice(0, maxPhotos);

    photoIds.forEach((id, idx) => {
      const item = document.createElement('div');
      item.className = 'ios-gallery-item';
      item.innerHTML = `
        <span class="ios-photo-badge">#${idx + 1}</span>
        <img src="${driveThumbUrl(id)}" alt="Foto ${idx + 1}" loading="lazy" />
        <a href="https://lh3.googleusercontent.com/d/${id}" target="_blank" rel="noopener" class="ios-photo-link">
          <span>Abrir foto HD ↗</span>
        </a>
      `;
      galleryEl.appendChild(item);
    });
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeIOSShareModal() {
  const modal = document.getElementById('iosShareModal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

async function fetchPhotoFiles(photoIds, code, onProgress) {
  const total = photoIds.length;
  if (!total) return [];

  let completed = 0;
  // Carga paralela de todas las fotos en simultáneo para máximo rendimiento
  const promises = photoIds.map(async (id, idx) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const filename = idx === 0 ? `${code}_01_Portada.jpg` : `${code}_${numStr}_Foto.jpg`;
    try {
      const res = await fetch(`https://lh3.googleusercontent.com/d/${id}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      completed++;
      if (onProgress) onProgress(completed, total);
      return new File([blob], filename, { type: blob.type || 'image/jpeg' });
    } catch (err) {
      console.warn(`Error al cargar foto ${idx + 1}:`, err);
      completed++;
      if (onProgress) onProgress(completed, total);
      return null;
    }
  });

  const files = await Promise.all(promises);
  return files.filter(Boolean);
}

async function downloadObject(d, btnTarget) {
  const btn = btnTarget.closest ? btnTarget.closest('button') : btnTarget;
  if (!btn || btn.disabled) return;
  const catalogText = getCatalogText(d);
  const textCopied = copyToClipboardSync(catalogText);

  const maxPhotos = getMaxPhotosLimit();
  const list = getPhotoList(d).slice(0, maxPhotos);
  if (!list.length) {
    alert('Este objeto no tiene fotos detectadas.' + (textCopied ? ' (Texto catálogo copiado al portapapeles)' : ''));
    return;
  }
  const code = codeFor(d);

  btn.disabled = true;
  const cardEl = btn.closest('.obj');
  const pill = cardEl ? cardEl.querySelector('.progress-pill') : (btn.parentElement ? btn.parentElement.querySelector('.progress-pill') : null);
  if (pill) pill.classList.add('show');

  const copyNotice = textCopied ? '📋 Catálogo copiado · ' : '';

  // Flujo optimizado para iOS (iPhone / iPad)
  if (isIOS()) {
    if (pill) pill.textContent = `${copyNotice}Cargando fotos para iPhone...`;
    const fileArray = await fetchPhotoFiles(list, code, (cur, total) => {
      if (pill) pill.textContent = `${copyNotice}Cargando fotos ${cur}/${total}...`;
    });

    if (canShareFiles() && fileArray.length > 0) {
      try {
        if (pill) pill.textContent = `📲 Abriendo menú de Fotos...`;
        // En iOS Safari, pasar SOLAMENTE { files } para que WebKit no rechace la llamada
        await navigator.share({ files: fileArray });
        if (pill) pill.textContent = `${copyNotice}✅ Fotos listas / guardadas`;
        btn.disabled = false;
        setTimeout(() => { if (pill) pill.classList.remove('show'); }, 4000);
        return;
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') {
          if (pill) pill.textContent = textCopied ? '📋 Catálogo copiado' : 'Cancelado';
          btn.disabled = false;
          setTimeout(() => { if (pill) pill.classList.remove('show'); }, 3000);
          return;
        }
        console.warn('navigator.share bloqueado por Safari o no soportado, abriendo modal interactivo:', shareErr);
      }
    }

    // Fallback interactivo para iOS si navigator.share expiró por timeout de gesto
    openIOSShareModal(d, fileArray, 'save');
    if (pill) pill.textContent = `${copyNotice}Toca el botón en pantalla`;
    btn.disabled = false;
    setTimeout(() => { if (pill) pill.classList.remove('show'); }, 4000);
    return;
  }

  // Descarga secuencial directa original (Android / PC / Mac)
  for (let i = 0; i < list.length; i++) {
    if (CANCEL_DOWNLOADING_ALL) break;

    while (IS_PAUSED_ALL && !CANCEL_DOWNLOADING_ALL) {
      if (pill) pill.textContent = `⏸️ Pausado (${i}/${list.length})`;
      await new Promise(res => setTimeout(res, 250));
    }

    if (CANCEL_DOWNLOADING_ALL) break;

    if (pill) pill.textContent = `${copyNotice}Descargando ${i + 1}/${list.length}...`;
    const numStr = String(i + 1).padStart(2, '0');
    const filename = i === 0 ? `${code}_01_Portada.jpg` : `${code}_${numStr}_Foto.jpg`;
    await downloadDirectPhoto(list[i], filename);
    await new Promise(res => setTimeout(res, 500));
  }

  if (CANCEL_DOWNLOADING_ALL) {
    if (pill) pill.textContent = `❌ Cancelado`;
  } else {
    if (pill) pill.textContent = `${copyNotice}✅ Listo (${list.length})`;
  }
  btn.disabled = false;
  setTimeout(() => { if (pill) pill.classList.remove('show'); }, 4000);
}

async function shareSocial(d, btnTarget, platform = 'whatsapp') {
  const btn = btnTarget.closest ? btnTarget.closest('button') : btnTarget;
  if (!btn || btn.disabled) return;

  const isFB = platform === 'facebook';
  const shareText = isFB ? getFacebookText(d) : getCatalogText(d);
  const textName = isFB ? 'Facebook' : 'Catálogo';

  // Copia inmediata síncrona en el gesto del usuario
  const textCopied = copyToClipboardSync(shareText);
  const code = codeFor(d);
  const maxPhotos = getMaxPhotosLimit();
  const list = getPhotoList(d).slice(0, maxPhotos);

  const cardEl = btn.closest('.obj');
  const pill = cardEl ? cardEl.querySelector('.progress-pill') : (btn.parentElement ? btn.parentElement.querySelector('.progress-pill') : null);

  btn.disabled = true;
  if (pill) pill.classList.add('show');

  const copyNotice = textCopied ? `📋 Texto ${textName} copiado · ` : '';

  if (!list.length) {
    if (isIOS()) {
      if (platform === 'whatsapp') {
        safeOpenUrl(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
      } else {
        safeOpenUrl('https://m.facebook.com/', '_blank');
      }
      if (pill) pill.textContent = `✅ Texto ${textName} copiado`;
    } else {
      if (canShareFiles()) {
        try {
          await navigator.share({ title: code, text: shareText });
          if (pill) pill.textContent = `✅ Compartido (${textName})`;
        } catch (e) {
          if (platform === 'whatsapp') {
            safeOpenUrl(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
          } else {
            safeOpenUrl('https://m.facebook.com/', '_blank');
          }
          if (pill) pill.textContent = `${copyNotice}Texto en portapapeles`;
        }
      } else {
        if (platform === 'whatsapp') {
          safeOpenUrl(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
        } else {
          safeOpenUrl('https://m.facebook.com/', '_blank');
        }
        if (pill) pill.textContent = `${copyNotice}Texto en portapapeles`;
      }
    }
    btn.disabled = false;
    setTimeout(() => { if (pill) pill.classList.remove('show'); }, 3500);
    return;
  }

  if (pill) pill.textContent = `${copyNotice}Cargando fotos...`;
  const fileArray = await fetchPhotoFiles(list, code, (cur, total) => {
    if (pill) pill.textContent = `${copyNotice}Cargando fotos ${cur}/${total}...`;
  });

  // Flujo específico para iOS
  if (isIOS()) {
    if (canShareFiles() && fileArray.length > 0) {
      try {
        if (pill) pill.textContent = `📲 Elige ${isFB ? 'Facebook' : 'WhatsApp'} en el menú...`;
        try {
          await navigator.share({
            title: code,
            text: shareText,
            files: fileArray
          });
        } catch (mixErr) {
          if (mixErr.name !== 'AbortError') {
            await navigator.share({ files: fileArray });
          } else {
            throw mixErr;
          }
        }
        if (pill) pill.textContent = `✅ Fotos y texto ${textName} listos para enviar`;
        btn.disabled = false;
        setTimeout(() => { if (pill) pill.classList.remove('show'); }, 4000);
        return;
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') {
          if (pill) pill.textContent = textCopied ? `📋 Texto ${textName} copiado` : 'Cancelado';
          btn.disabled = false;
          setTimeout(() => { if (pill) pill.classList.remove('show'); }, 3000);
          return;
        }
        console.warn('Share falló en iOS, abriendo modal interactivo:', shareErr);
      }
    }

    // Fallback interactivo para iOS
    openIOSShareModal(d, fileArray, platform);
    if (pill) pill.textContent = `${copyNotice}Toca el botón en pantalla`;
    btn.disabled = false;
    setTimeout(() => { if (pill) pill.classList.remove('show'); }, 4000);
    return;
  }

  // Comportamiento para Desktop / Android
  if (canShareFiles() && fileArray.length > 0 && navigator.canShare && navigator.canShare({ files: fileArray })) {
    try {
      if (pill) pill.textContent = `📲 Elige la app (${isFB ? 'Facebook' : 'WhatsApp'})...`;
      await navigator.share({
        title: code,
        text: shareText,
        files: fileArray
      });
      if (pill) pill.textContent = `✅ Fotos y texto ${textName} listos para enviar`;
    } catch (shareErr) {
      if (shareErr.name === 'AbortError') {
        if (pill) pill.textContent = textCopied ? `📋 Texto ${textName} copiado` : 'Cancelado';
      } else {
        if (platform === 'whatsapp') {
          safeOpenUrl(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
        } else {
          safeOpenUrl('https://m.facebook.com/', '_blank');
        }
        if (pill) pill.textContent = `📋 Texto ${textName} copiado`;
      }
    }
  } else {
    if (pill) pill.textContent = `${copyNotice}Descargando fotos...`;
    for (let i = 0; i < list.length; i++) {
      if (CANCEL_DOWNLOADING_ALL) break;
      const numStr = String(i + 1).padStart(2, '0');
      const filename = i === 0 ? `${code}_01_Portada.jpg` : `${code}_${numStr}_Foto.jpg`;
      await downloadDirectPhoto(list[i], filename);
      await new Promise(res => setTimeout(res, 400));
    }
    if (platform === 'whatsapp') {
      safeOpenUrl(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
    } else if (platform === 'facebook') {
      safeOpenUrl('https://m.facebook.com/', '_blank');
    }
    if (pill) pill.textContent = `📋 Texto ${textName} copiado · Fotos descargadas`;
  }

  btn.disabled = false;
  setTimeout(() => { if (pill) pill.classList.remove('show'); }, 4000);
}

let PAGE_SIZE = 10;
let VISIBLE_COUNT = 10;

function render(resetPagination = false) {
  if (resetPagination === true) {
    VISIBLE_COUNT = PAGE_SIZE;
  }

  const list = currentFiltered();
  const visibleList = list.slice(0, VISIBLE_COUNT);

  const statEl = document.getElementById('resultStat');
  if (list.length === 0) {
    statEl.innerHTML = `<b>0</b> objetos encontrados`;
  } else if (list.length <= VISIBLE_COUNT) {
    statEl.innerHTML = `<b>${list.length}</b> objetos encontrados`;
  } else {
    statEl.innerHTML = `Mostrando <b>${visibleList.length}</b> de <b>${list.length}</b> objetos encontrados`;
  }

  const container = document.getElementById('results');
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </div>
        <div class="empty-text">
          <strong style="display:block;margin-bottom:4px;color:var(--text);">No se encontraron inmuebles</strong>
          <span>Ajusta los filtros seleccionados o pega una lista de códigos en el cuadro superior.</span>
        </div>
      </div>
    `;
    return;
  }

  const useShare = isIOS();
  const maxPhotos = getMaxPhotosLimit();
  const fragment = document.createDocumentFragment();

  visibleList.forEach(d => {
    const photoList = getPhotoList(d);
    const displayPhotos = photoList.slice(0, maxPhotos);
    const thumbId = displayPhotos[0] || photoList[0] || '';
    const count = displayPhotos.length;

    const ofi = d['ofiBroker'] || d['Ofi BROKER'] || '';
    const equipo = d['equipoBroker'] || d['Eq Broker '] || d['equipo broker'] || '';
    const planGroup = d['planificador'] ?? d[FIELD.group] ?? d['UZGXo'];
    const planDay = d['diaPlanificador'] || d[FIELD.day] || d['a6X7r'] || '';

    const codeStr = escapeHtml(codeFor(d));
    const typeStr = escapeHtml(d[FIELD.type] || '');
    const ofiStr = ofi ? `<span class="badge badge-ofi">${escapeHtml(ofi)}</span>` : '';
    const titleStr = escapeHtml((d[FIELD.title] || 'Sin título').trim());
    const zoneStr = escapeHtml(d[FIELD.zone] || '');
    const currStr = escapeHtml(d[FIELD.currency] || '');
    const priceStr = escapeHtml(d[FIELD.price] ?? '');
    const thumbUrl = thumbId ? driveThumbUrl(thumbId) : '';

    const el = document.createElement('div');
    el.className = 'obj';
    el.innerHTML = `
      <div class="obj-head">
        <div class="obj-thumb" style="background-image:url('${thumbUrl}')"></div>
        <div class="obj-info">
          <div class="obj-code">
            <span class="code-badge">${codeStr}</span>
            <span class="badge">${typeStr}</span>
            ${ofiStr}
          </div>
          <div class="obj-title">${titleStr}</div>
          <div class="obj-meta tabular-nums">${zoneStr} · ${currStr} ${priceStr} · ${count} foto${count === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="obj-actions">
        <button class="btn btn-primary btn-dl-jpg">
          ${useShare ? `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <span>Guardar en Fotos</span>
          ` : `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Descargar fotos (.jpg)</span>
          `}
        </button>
        <button class="btn btn-share-wa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.99c-.002 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
          <span>WhatsApp</span>
        </button>
        <button class="btn btn-share-fb">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <span>Facebook</span>
        </button>
        <button class="btn btn-ghost btn-copy-catalog">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>Copiar catálogo</span>
        </button>
        <button class="btn btn-ghost btn-copy-facebook">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <span>Copiar FB</span>
        </button>
        <span class="progress-pill"></span>
      </div>
    `;

    el.querySelector('.btn-share-wa')?.addEventListener('click', (e) => shareSocial(d, e.target, 'whatsapp'));
    el.querySelector('.btn-share-fb')?.addEventListener('click', (e) => shareSocial(d, e.target, 'facebook'));
    el.querySelector('.btn-dl-jpg')?.addEventListener('click', (e) => downloadObject(d, e.target));
    
    el.querySelector('.btn-copy-catalog')?.addEventListener('click', () => {
      const catalogText = getCatalogText(d);
      const pill = el.querySelector('.progress-pill');
      const ok = copyToClipboardSync(catalogText);
      if (pill) {
        pill.classList.add('show');
        pill.textContent = ok ? '📋 Catálogo copiado al portapapeles' : '⚠️ Error al copiar al portapapeles';
        setTimeout(() => { pill.classList.remove('show'); }, 3500);
      }
    });

    el.querySelector('.btn-copy-facebook')?.addEventListener('click', () => {
      const fbText = getFacebookText(d);
      const pill = el.querySelector('.progress-pill');
      const ok = copyToClipboardSync(fbText);
      if (pill) {
        pill.classList.add('show');
        pill.textContent = ok ? '📘 Texto Facebook copiado al portapapeles' : '⚠️ Error al copiar al portapapeles';
        setTimeout(() => { pill.classList.remove('show'); }, 3500);
      }
    });

    fragment.appendChild(el);
  });

  container.appendChild(fragment);

  if (list.length > VISIBLE_COUNT) {
    const nextBatch = Math.min(PAGE_SIZE, list.length - VISIBLE_COUNT);
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'text-align:center;margin:16px 0 8px;width:100%;';
    btnWrap.innerHTML = `
      <button id="loadMoreBtn" class="btn btn-primary" style="padding:10px 24px;font-size:0.875rem;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <polyline points="19 12 12 19 5 12"/>
        </svg>
        Mostrar más (${nextBatch})
      </button>
    `;
    btnWrap.querySelector('#loadMoreBtn').addEventListener('click', () => {
      VISIBLE_COUNT += PAGE_SIZE;
      render(false);
    });
    container.appendChild(btnWrap);
  }
}

async function downloadAllFiltered() {
  const list = currentFiltered();
  if (!list.length) return;

  if (IS_DOWNLOADING_ALL) {
    if (IS_PAUSED_ALL) {
      IS_PAUSED_ALL = false;
      document.getElementById('downloadAllBtnText').textContent = 'Pausar';
      document.getElementById('downloadAllIcon').innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
    } else {
      IS_PAUSED_ALL = true;
      document.getElementById('downloadAllBtnText').textContent = 'Reanudar';
      document.getElementById('downloadAllIcon').innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }
    return;
  }

  const limit = getMaxPhotosLimit();
  const limitText = limit >= 999 ? 'todas las fotos' : `hasta ${limit} foto${limit === 1 ? '' : 's'} por propiedad`;
  if (!confirm(`Vas a descargar ${limitText} de ${list.length} objetos. Puede tardar y tu navegador pedirá permitir pop-ups. ¿Continuar?`)) return;

  IS_DOWNLOADING_ALL = true;
  IS_PAUSED_ALL = false;
  CANCEL_DOWNLOADING_ALL = false;

  document.getElementById('downloadAllBtnText').textContent = 'Pausar';
  document.getElementById('downloadAllIcon').innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
  document.getElementById('cancelDownloadBtn').style.display = 'inline-flex';

  const bulkPill = document.getElementById('bulkStatusPill');
  bulkPill.classList.add('show');

  for (let index = 0; index < list.length; index++) {
    if (CANCEL_DOWNLOADING_ALL) break;

    while (IS_PAUSED_ALL && !CANCEL_DOWNLOADING_ALL) {
      bulkPill.textContent = `⏸️ Pausado (${index}/${list.length})`;
      await new Promise(res => setTimeout(res, 250));
    }

    if (CANCEL_DOWNLOADING_ALL) break;

    const d = list[index];
    bulkPill.textContent = `Descargando ${index + 1}/${list.length} (${codeFor(d)})`;

    const objCard = [...document.querySelectorAll('.obj')].find(el => {
      const codeEl = el.querySelector('.obj-code');
      return codeEl && codeEl.textContent.trim().startsWith(codeFor(d));
    });
    const btn = objCard ? objCard.querySelector('.btn-dl-jpg') : null;

    if (btn) {
      await downloadObject(d, btn);
    } else {
      const photoList = getPhotoList(d).slice(0, limit);
      for (let i = 0; i < photoList.length; i++) {
        if (CANCEL_DOWNLOADING_ALL) break;
        while (IS_PAUSED_ALL && !CANCEL_DOWNLOADING_ALL) {
          bulkPill.textContent = `⏸️ Pausado (${index + 1}/${list.length})`;
          await new Promise(res => setTimeout(res, 250));
        }
        if (CANCEL_DOWNLOADING_ALL) break;
        const code = codeFor(d);
        const numStr = String(i + 1).padStart(2, '0');
        const filename = i === 0 ? `${code}_01_Portada.jpg` : `${code}_${numStr}_Foto.jpg`;
        await downloadDirectPhoto(photoList[i], filename);
        await new Promise(res => setTimeout(res, 500));
      }
    }

    await new Promise(res => setTimeout(res, 400));
  }

  if (CANCEL_DOWNLOADING_ALL) {
    bulkPill.textContent = '❌ Descarga cancelada';
    setTimeout(resetBulkDownloadState, 2000);
  } else {
    bulkPill.textContent = `✅ Completo (${list.length} objetos)`;
    setTimeout(resetBulkDownloadState, 3500);
  }
}

function debounce(func, wait = 150) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

document.getElementById('cancelDownloadBtn')?.addEventListener('click', () => {
  if (confirm('¿Deseas cancelar la descarga masiva en curso?')) {
    CANCEL_DOWNLOADING_ALL = true;
    IS_PAUSED_ALL = false;
  }
});

const searchInputEl = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchInputBtn');
const pasteSearchBtn = document.getElementById('pasteSearchBtn');

if (pasteSearchBtn) {
  pasteSearchBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (searchInputEl) {
          searchInputEl.value = text;
          if (clearSearchBtn) clearSearchBtn.style.display = 'inline-flex';
        }
        render(true);
      } else {
        alert('El portapapeles está vacío.');
      }
    } catch (err) {
      if (searchInputEl) searchInputEl.focus();
      alert('Por favor mantén presionado el buscador para pegar.');
    }
  });
}

if (searchInputEl) {
  searchInputEl.addEventListener('input', () => {
    if (clearSearchBtn) {
      clearSearchBtn.style.display = searchInputEl.value.trim() ? 'inline-flex' : 'none';
    }
    debounce(() => render(true), 180)();
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    if (searchInputEl) {
      searchInputEl.value = '';
      clearSearchBtn.style.display = 'none';
      render(true);
    }
  });
}

// Segmented Control de Operación
document.querySelectorAll('#opSegmentedControl .segment-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#opSegmentedControl .segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render(true);
  });
});

// Selects con highlight al tener valor seleccionado
['zoneFilter', 'ofiFilter', 'equipoFilter', 'consignadorFilter'].forEach(id => {
  const sel = document.getElementById(id);
  if (sel) {
    sel.addEventListener('change', () => {
      sel.classList.toggle('has-value', Boolean(sel.value));
      if (id === 'ofiFilter') {
        updateEquipoDropdown();
      }
      render(true);
    });
  }
});

// Botón Restablecer Filtros
document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
  if (searchInputEl) {
    searchInputEl.value = '';
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';
  }
  
  // Segmented control op -> "Todas"
  document.querySelectorAll('#opSegmentedControl .segment-btn').forEach(b => {
    b.classList.toggle('active', (b.dataset.op || '') === '');
  });

  // Reset selects
  ['zoneFilter', 'ofiFilter', 'equipoFilter', 'consignadorFilter'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.value = '';
      sel.classList.remove('has-value');
    }
  });
  updateEquipoDropdown();

  // Reset Días (desmarcar todos)
  const dayWrap = document.getElementById('dayChips');
  if (dayWrap) {
    dayWrap.querySelectorAll('.chip').forEach(c => {
      c.classList.remove('active');
      const radio = c.querySelector('input');
      if (radio) radio.checked = false;
    });
  }

  // Reset Grupos (desmarcar todos)
  const groupWrap = document.getElementById('groupChecks');
  if (groupWrap) {
    groupWrap.querySelectorAll('.chip').forEach(c => {
      c.classList.remove('active');
      const chk = c.querySelector('input');
      if (chk) chk.checked = false;
    });
  }

  render(true);
});

document.getElementById('maxPhotosSelect')?.addEventListener('change', () => render(false));
document.getElementById('downloadAllBtn')?.addEventListener('click', downloadAllFiltered);

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
if (drop && fileInput) {
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) handleUserFileUpload(f);
  });
  ['dragover', 'dragleave', 'drop'].forEach(evt => {
    drop.addEventListener(evt, e => {
      e.preventDefault();
      drop.classList.toggle('dragover', evt === 'dragover');
    });
  });
  drop.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (f) handleUserFileUpload(f);
  });
}

// Event Listeners para Modal iOS
document.getElementById('iosModalCloseBtn')?.addEventListener('click', closeIOSShareModal);
document.getElementById('iosShareModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'iosShareModal') closeIOSShareModal();
});

document.getElementById('iosModalShareBtn')?.addEventListener('click', async () => {
  if (!currentIOSShareFiles || !currentIOSShareFiles.length) {
    alert('No hay fotos cargadas.');
    return;
  }
  if (canShareFiles()) {
    try {
      const d = currentIOSShareData;
      const isFB = currentIOSShareContext === 'facebook';
      const isSave = currentIOSShareContext === 'save';
      const shareText = isFB ? getFacebookText(d) : getCatalogText(d);
      const code = d ? codeFor(d) : '';

      try {
        if (isSave) {
          await navigator.share({ files: currentIOSShareFiles });
        } else {
          await navigator.share({
            title: code,
            text: shareText,
            files: currentIOSShareFiles
          });
        }
      } catch (mixErr) {
        if (mixErr.name !== 'AbortError') {
          await navigator.share({ files: currentIOSShareFiles });
        } else {
          throw mixErr;
        }
      }
      closeIOSShareModal();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Error al compartir desde modal iOS:', err);
      }
    }
  } else {
    alert('Tu navegador no soporta compartir fotos directamente. Usa los enlaces de abajo para guardar cada foto.');
  }
});

document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
  if (confirm('¿Restablecer al data.json por defecto del servidor?')) {
    await clearStoredData();
    fetchDefaultData();
  }
});

initData();


