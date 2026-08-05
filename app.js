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
  status: 'TieEY',     // estado (ej. "Abierta")
  group: 'UZGXo',      // grupo del Planificador (1-5, checkboxes en la app)
  active: '34Af3',     // publicado / activo ("si" vs "no")
  agent: 'PJe5x',      // Asesor / Supervisor responsable
  catalog: 'vDBia',    // Texto catálogo de la propiedad
  facebook: 'abzcW'    // Texto Facebook de la propiedad
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

function driveIdFromUrl(url) {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
function driveDownloadUrl(id) {
  return `https://drive.google.com/uc?export=download&id=${id}`;
}
function triggerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function driveThumbUrl(id) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w200`;
}

function parsePhotos(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean)
    .map(driveIdFromUrl).filter(Boolean);
}

function populateSelect(sel, values, placeholder) {
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
  document.getElementById('toolbar').style.display = 'flex';
  document.getElementById('hint').style.display = 'block';

  const ops = new Set(), types = new Set(), zones = new Set(), days = new Set(), statuses = new Set();
  ROWS.forEach(d => {
    if (d[FIELD.op]) ops.add(d[FIELD.op]);
    if (d[FIELD.type]) types.add(d[FIELD.type]);
    if (d[FIELD.zone]) zones.add(d[FIELD.zone]);
    if (d[FIELD.day]) days.add(d[FIELD.day]);
    if (d[FIELD.status]) statuses.add(d[FIELD.status]);
  });
  populateSelect(document.getElementById('opFilter'), ops, 'Operación (todas)');
  populateSelect(document.getElementById('typeFilter'), types, 'Tipo (todos)');
  populateSelect(document.getElementById('zoneFilter'), zones, 'Zona (todas)');
  populateSelect(document.getElementById('dayFilter'), days, 'Día de publicación (todos)');
  populateSelect(document.getElementById('statusFilter'), statuses, 'Estado (todos)');
  updateAgentDropdown();

  const groupWrap = document.getElementById('groupChecks');
  groupWrap.innerHTML = '';
  [1, 2, 3, 4, 5].forEach(n => {
    const label = document.createElement('label');
    label.className = 'chip';
    label.innerHTML = `<input type="checkbox" value="${n}"> ${n}`;
    label.querySelector('input').addEventListener('change', (e) => {
      label.classList.toggle('active', e.target.checked);
      render();
    });
    groupWrap.appendChild(label);
  });

  const todayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()];
  if (days.has(todayName)) document.getElementById('dayFilter').value = todayName;
  if (statuses.has('Abierta')) document.getElementById('statusFilter').value = 'Abierta';

  render();
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

async function fetchDefaultData() {
  const statText = document.getElementById('fileStatText');
  const resetBtn = document.getElementById('resetDataBtn');
  statText.innerHTML = '⌛ Cargando datos base...';
  resetBtn.style.display = 'none';

  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const ok = loadData(text, false);
    if (ok) {
      statText.innerHTML = `✅ <b>Datos de Propiedades cargados</b> (${ROWS.length} objetos)`;
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
          const code = String(r['Ncodigo'] || '').trim();
          const m = code.match(/^([A-Z]+)(\d+)$/);
          const prefix = m ? m[1] : '';
          const num = m ? parseInt(m[2], 10) : '';
          const op = PREFIX_OP[prefix] || 'VENTA';
          const imgs = String(r['TempImg'] || '').split(',').map(s => s.trim()).filter(Boolean);
          const cover = imgs[0] || '';
          const gallery = imgs.slice(1).join(', ');

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
              '34Af3': String(r['DISPONIBLE'] || '').trim().toLowerCase() === 'si' ? 'si' : 'no',
              vDBia: r['Txt Catalogo'] || r['Txt Facebook'] || '',
              abzcW: r['Txt Facebook'] || r['Txt Catalogo'] || ''
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
  const pasteText = document.getElementById('pasteInput')?.value || '';
  const pastedCodes = extractCodesFromText(pasteText);
  const pasteStat = document.getElementById('pasteStat');

  if (pastedCodes.length > 0) {
    const matchedRows = [];
    const missingCodes = [];

    pastedCodes.forEach(c => {
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

      if (found) {
        if (!matchedRows.includes(found)) matchedRows.push(found);
      } else {
        missingCodes.push(c);
      }
    });

    if (pasteStat) {
      if (missingCodes.length > 0 || matchedRows.length < pastedCodes.length) {
        const missingList = missingCodes.length > 0 ? missingCodes.join(', ') : 'Código duplicado o sin coincidencia directa';
        pasteStat.innerHTML = `📋 <b>${pastedCodes.length}</b> códigos detectados (<b>${matchedRows.length}</b> encontrados) · <span style="color:var(--danger);font-weight:700;background:var(--danger-bg);padding:2px 8px;border-radius:4px;border:1px solid rgba(220,38,38,0.2);">⚠️ No está en tu data.json: ${missingList}</span>`;
      } else {
        pasteStat.innerHTML = `✅ <b>${pastedCodes.length}</b> códigos detectados y encontrados correctamente.`;
      }
    }
    return matchedRows;
  } else {
    if (pasteStat) pasteStat.innerHTML = '';
  }

  const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const active = document.getElementById('activeFilter')?.value || 'si';
  const op = document.getElementById('opFilter').value;
  const type = document.getElementById('typeFilter').value;
  const zone = document.getElementById('zoneFilter').value;
  const day = document.getElementById('dayFilter').value;
  const status = document.getElementById('statusFilter').value;
  const agent = document.getElementById('agentFilter')?.value || '';
  const checkedGroups = [...document.querySelectorAll('#groupChecks input:checked')].map(i => String(i.value));

  const onlyActiveAgents = document.getElementById('onlyActiveAgentsCheck')?.checked ?? true;

  return ROWS.filter(d => {
    const code = codeFor(d).toLowerCase();
    const title = (d[FIELD.title] || '').toLowerCase();
    const rowAgents = [d['Lt6BS'], d[FIELD.agent], d['Pverj'], d['bF4oQ']].map(a => (a || '').trim()).filter(Boolean);

    if (search) {
      if (!code.includes(search) && !title.includes(search)) return false;
      return true;
    }

    if (active === 'si' && d[FIELD.active] && String(d[FIELD.active]).toLowerCase() === 'no') return false;
    if (active === 'no' && String(d[FIELD.active]).toLowerCase() !== 'no') return false;

    // Exclude properties of EX agents when only active agents/publications are desired
    if (onlyActiveAgents && rowAgents.some(a => isExAgent(a))) return false;

    if (op && d[FIELD.op] !== op) return false;
    if (type && d[FIELD.type] !== type) return false;
    if (zone && d[FIELD.zone] !== zone) return false;
    if (day && d[FIELD.day] !== day) return false;
    if (status) {
      if (d[FIELD.status] !== status) return false;
    } else {
      if (d[FIELD.status] === 'Cerrada') return false;
    }
    if (agent && !rowAgents.includes(agent)) return false;

    if (checkedGroups.length) {
      const val = d[FIELD.group];
      if (val !== undefined && val !== null && val !== '') {
        const strVal = String(val);
        const isMatch = checkedGroups.some(g => strVal.includes(g));
        if (!isMatch) return false;
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

async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

async function downloadObject(d, btn) {
  const catalogText = d[FIELD.catalog] || d['vDBia'] || '';
  const textCopied = await copyToClipboard(catalogText);

  const list = getPhotoList(d).slice(0, 10);
  if (!list.length) {
    alert('Este objeto no tiene fotos detectadas.' + (textCopied ? ' (Texto catálogo copiado al portapapeles)' : ''));
    return;
  }
  const code = codeFor(d);

  btn.disabled = true;
  const pill = btn.parentElement.querySelector('.progress-pill');
  pill.classList.add('show');

  for (let i = 0; i < list.length; i++) {
    if (CANCEL_DOWNLOADING_ALL) break;

    while (IS_PAUSED_ALL && !CANCEL_DOWNLOADING_ALL) {
      pill.textContent = `⏸️ Pausado (${i}/${list.length})`;
      await new Promise(res => setTimeout(res, 250));
    }

    if (CANCEL_DOWNLOADING_ALL) break;

    const copyNotice = textCopied ? '📋 Catálogo copiado · ' : '';
    pill.textContent = `${copyNotice}Descargando ${i + 1}/${list.length}...`;
    const numStr = String(i + 1).padStart(2, '0');
    const filename = i === 0 ? `${code}_01_Portada.jpg` : `${code}_${numStr}_Foto.jpg`;
    await downloadDirectPhoto(list[i], filename);
    await new Promise(res => setTimeout(res, 500));
  }

  if (CANCEL_DOWNLOADING_ALL) {
    pill.textContent = `❌ Cancelado`;
  } else {
    const copyNotice = textCopied ? '📋 Catálogo copiado · ' : '';
    pill.textContent = `${copyNotice}✅ Listo (${list.length})`;
  }
  btn.disabled = false;
  setTimeout(() => { pill.classList.remove('show'); }, 4000);
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
    container.innerHTML = '<div class="empty">No se encontraron inmuebles con los filtros seleccionados.</div>';
    return;
  }

  visibleList.forEach(d => {
    const photoList = getPhotoList(d);
    const thumbId = photoList[0] || '';
    const count = photoList.length;

    const el = document.createElement('div');
    el.className = 'obj';
    el.innerHTML = `
      <div class="obj-head">
        <div class="obj-thumb" style="background-image:url('${thumbId ? driveThumbUrl(thumbId) : ''}')"></div>
        <div class="obj-info">
          <div class="obj-code">${codeFor(d)} <span class="badge">${d[FIELD.type] || ''}</span></div>
          <div class="obj-title">${(d[FIELD.title] || 'Sin título').trim()}</div>
          <div class="obj-meta">${d[FIELD.zone] || ''} · ${d[FIELD.currency] || ''} ${d[FIELD.price] ?? ''} · ${count} foto${count === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="obj-actions">
        <button class="btn btn-primary btn-dl-jpg">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Descargar fotos (.jpg)
        </button>
        <button class="btn btn-ghost btn-copy-facebook">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Copiar Facebook
        </button>
        <button class="btn btn-ghost btn-copy-catalog">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copiar catálogo
        </button>
        <button class="btn btn-ghost toggle-links">Ver enlaces (${count})</button>
        <span class="progress-pill"></span>
      </div>
      <div class="links-list" style="display:none;padding:0 14px 14px;border-top:1px solid var(--border);margin-top:10px;padding-top:12px;"></div>
    `;
    const linksList = el.querySelector('.links-list');
    photoList.slice(0, 10).forEach((id, i) => {
      const link = document.createElement('a');
      link.href = `https://lh3.googleusercontent.com/d/${id}`;
      link.textContent = i === 0 ? `Foto 1 (Portada)` : `Foto ${i + 1}`;
      link.style.cssText = `display:inline-flex;align-items:center;margin:3px 6px 3px 0;padding:6px 12px;background:${i === 0 ? 'var(--accent)' : 'var(--surface-2)'};color:${i === 0 ? 'var(--accent-text)' : 'var(--text)'};border-radius:6px;font-size:12px;font-family:var(--font-mono);text-decoration:none;font-weight:${i === 0 ? '700' : '500'};border:1px solid ${i === 0 ? 'var(--accent)' : 'var(--border)'};cursor:pointer;`;
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        const code = codeFor(d);
        const numStr = String(i + 1).padStart(2, '0');
        const filename = i === 0 ? `${code}_01_Portada.jpg` : `${code}_${numStr}_Foto.jpg`;
        downloadDirectPhoto(id, filename);
      });
      linksList.appendChild(link);
    });

    el.querySelector('.toggle-links').addEventListener('click', () => {
      linksList.style.display = linksList.style.display === 'none' ? 'block' : 'none';
    });
    el.querySelector('.btn-dl-jpg').addEventListener('click', (e) => downloadObject(d, e.target));
    el.querySelector('.btn-copy-catalog').addEventListener('click', async () => {
      const catalogText = d[FIELD.catalog] || d['vDBia'] || '';
      const pill = el.querySelector('.progress-pill');
      if (!catalogText) {
        alert('Este inmueble no tiene texto catálogo disponible.');
        return;
      }
      const ok = await copyToClipboard(catalogText);
      pill.classList.add('show');
      if (ok) {
        pill.textContent = '📋 Catálogo copiado al portapapeles';
      } else {
        pill.textContent = '⚠️ Error al copiar al portapapeles';
      }
      setTimeout(() => { pill.classList.remove('show'); }, 3500);
    });
    el.querySelector('.btn-copy-facebook').addEventListener('click', async () => {
      const fbText = d[FIELD.facebook] || d['abzcW'] || d[FIELD.catalog] || d['vDBia'] || '';
      const pill = el.querySelector('.progress-pill');
      if (!fbText) {
        alert('Este inmueble no tiene texto de Facebook disponible.');
        return;
      }
      const ok = await copyToClipboard(fbText);
      pill.classList.add('show');
      if (ok) {
        pill.textContent = '📘 Texto Facebook copiado al portapapeles';
      } else {
        pill.textContent = '⚠️ Error al copiar al portapapeles';
      }
      setTimeout(() => { pill.classList.remove('show'); }, 3500);
    });

    container.appendChild(el);
  });

  if (list.length > VISIBLE_COUNT) {
    const nextBatch = Math.min(PAGE_SIZE, list.length - VISIBLE_COUNT);
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'text-align:center;margin:20px 0 10px;grid-column:1/-1;';
    btnWrap.innerHTML = `
      <button id="loadMoreBtn" class="btn btn-primary" style="padding:10px 24px;font-size:13.5px;font-weight:600;display:inline-flex;align-items:center;gap:8px;border-radius:8px;box-shadow:0 4px 12px rgba(37,99,235,0.25);cursor:pointer;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
}s';
      }
      setTimeout(() => { pill.classList.remove('show'); }, 3500);
    });
    container.appendChild(el);
  });
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

  if (!confirm(`Vas a descargar fotos de ${list.length} objetos (hasta 10 c/u). Puede tardar y tu navegador pedirá permitir pop-ups. ¿Continuar?`)) return;

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
      const photoList = getPhotoList(d).slice(0, 10);
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

document.getElementById('cancelDownloadBtn').addEventListener('click', () => {
  if (confirm('¿Deseas cancelar la descarga masiva en curso?')) {
    CANCEL_DOWNLOADING_ALL = true;
    IS_PAUSED_ALL = false;
  }
});

document.getElementById('pasteInput').addEventListener('input', () => render(true));
document.getElementById('pasteClipboardBtn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      document.getElementById('pasteInput').value = text;
      render(true);
    } else {
      alert('El portapapeles está vacío.');
    }
  } catch (err) {
    const textarea = document.getElementById('pasteInput');
    textarea.focus();
    alert('Por favor mantén presionado el cuadro de texto para pegar.');
  }
});

document.getElementById('clearPasteBtn').addEventListener('click', () => {
  document.getElementById('pasteInput').value = '';
  render(true);
});

document.getElementById('pasteInput').value = '';

document.getElementById('searchInput').addEventListener('input', () => render(true));
document.getElementById('activeFilter').addEventListener('change', () => render(true));
document.getElementById('opFilter').addEventListener('change', () => render(true));
document.getElementById('typeFilter').addEventListener('change', () => render(true));
document.getElementById('zoneFilter').addEventListener('change', () => render(true));
document.getElementById('dayFilter').addEventListener('change', () => render(true));
document.getElementById('statusFilter').addEventListener('change', () => render(true));
document.getElementById('agentFilter').addEventListener('change', () => render(true));
document.getElementById('onlyActiveAgentsCheck')?.addEventListener('change', () => {
  updateAgentDropdown();
  render(true);
});
document.getElementById('downloadAllBtn').addEventListener('click', downloadAllFiltered);

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
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

document.getElementById('resetDataBtn').addEventListener('click', async () => {
  if (confirm('¿Restablecer al data.json por defecto del servidor?')) {
    await clearStoredData();
    fetchDefaultData();
  }
});

initData();
