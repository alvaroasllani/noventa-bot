(function (root, factory) {
  const adapter = factory();
  if (typeof module === 'object' && module.exports) module.exports = adapter;
  if (root) root.NinetyDataAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const OPERATION_BY_PREFIX = {
    AL: 'ALQUILER',
    VN: 'VENTA',
    PV: 'PREVENTA',
    AN: 'ANTICRETICO',
    PE: 'ENTREGA INMEDIATA',
    AX: 'ALQUILER TEMPORAL'
  };

  const TYPE_LABELS = {
    'departamento': 'Departamento',
    'casa': 'Casa',
    'edificio de departamentos': 'Edificio de Departamentos',
    'lote': 'Lote',
    'local comercial': 'Local Comercial',
    'oficina / consultorio': 'Oficina / Consultorio',
    'monoambiente': 'Monoambiente',
    'casas en condominio': 'Casas en Condominio',
    'galpon': 'Galpón',
    'galpón': 'Galpón',
    'deposito': 'Depósito',
    'depósito': 'Depósito',
    'habitacion': 'Habitación',
    'habitación': 'Habitación'
  };

  const DAY_LABELS = {
    domingo: 'Domingo',
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado'
  };

  function cleanText(value) {
    return value === undefined || value === null
      ? ''
      : String(value).replace(/\r\n/g, '\n').trim();
  }

  function compactText(value) {
    return cleanText(value).replace(/\s+/g, ' ');
  }

  function plainKey(value) {
    return compactText(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function getValue(row, ...names) {
    if (!row) return '';
    const keys = Object.keys(row);
    for (const name of names) {
      const wanted = plainKey(name);
      const found = keys.find(key => plainKey(key) === wanted);
      if (found !== undefined) return cleanText(row[found]);
    }
    return '';
  }

  function parseCSV(csvText) {
    let text = String(csvText || '');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const matrix = [];
    let row = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          value += '"';
          index++;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        row.push(value);
        value = '';
      } else if ((char === '\r' || char === '\n') && !quoted) {
        if (char === '\r' && next === '\n') index++;
        row.push(value);
        if (row.some(cell => cell !== '')) matrix.push(row);
        row = [];
        value = '';
      } else {
        value += char;
      }
    }

    if (value !== '' || row.length) {
      row.push(value);
      if (row.some(cell => cell !== '')) matrix.push(row);
    }
    if (!matrix.length) return [];

    const headers = matrix[0].map(header => cleanText(header));
    return matrix.slice(1).map(values => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index] === undefined ? '' : values[index];
      });
      return item;
    });
  }

  function isNinetyExport(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    const keys = Object.keys(rows[0]).map(plainKey);
    return ['codigo', 'planificador', 'dia planificado', 'texto facebook 1', 'texto whatsapp', 'imagenes']
      .every(name => keys.includes(plainKey(name)));
  }

  function normalizeDay(value) {
    return DAY_LABELS[plainKey(value)] || compactText(value);
  }

  function normalizeType(value) {
    const compact = compactText(value);
    return TYPE_LABELS[compact.toLowerCase()] || compact;
  }

  function splitPrice(value) {
    const raw = compactText(value);
    const match = raw.match(/(\$us\.?|bs\.?)\s*$/i);
    if (!match) return { amount: raw, currency: '' };
    const currency = /^\$us/i.test(match[1]) ? '$us.' : 'Bs.';
    return { amount: raw.slice(0, match.index).trim(), currency };
  }

  function normalizeNinetyRow(row) {
    const code = compactText(getValue(row, 'codigo')).toUpperCase().replace(/\s+/g, '');
    const codeMatch = code.match(/^([A-Z]+)(\d+)$/);
    const prefix = codeMatch ? codeMatch[1] : '';
    const number = codeMatch ? Number(codeMatch[2]) : '';
    const operation = OPERATION_BY_PREFIX[prefix] || '';
    const plannerRaw = compactText(getValue(row, 'planificador'));
    const plannerMatch = plannerRaw.match(/(\d+)/);
    const planner = plannerMatch ? Number(plannerMatch[1]) : '';
    const day = normalizeDay(getValue(row, 'dia planificado'));
    const type = normalizeType(getValue(row, 'tipo'));
    const address = compactText(getValue(row, 'direccion'));
    const zone = compactText(getValue(row, 'zona'));
    const consignador = compactText(getValue(row, 'consignador'));
    const imagesRaw = cleanText(getValue(row, 'imagenes'));
    const images = imagesRaw.split(',').map(compactText).filter(Boolean);
    const price = splitPrice(getValue(row, 'precio'));
    const facebook1 = cleanText(getValue(row, 'texto facebook 1'));
    const facebook2 = cleanText(getValue(row, 'texto facebook 2'));
    const facebook3 = cleanText(getValue(row, 'texto facebook 3'));
    const whatsapp = cleanText(getValue(row, 'texto whatsapp'));
    const title = type && address ? `${type} en ${address}` : (address || type || code || 'Inmueble');
    const isPublishable = Boolean(code && operation && images.length);

    return {
      data: {
        codigo: code,
        mERYr: operation,
        oHoAu: type,
        WIoeb: zone,
        '5kIsO': title,
        direccion: address,
        GRkSW: price.amount,
        UOFib: price.currency,
        lak0f: number,
        '0C9DE': images[0] || '',
        '7fYNu': images.slice(1).join(', '),
        imagenes: imagesRaw,
        '34Af3': isPublishable ? 'si' : 'no',
        vDBia: whatsapp,
        abzcW: facebook1 || facebook2 || facebook3,
        textoWhatsapp: whatsapp,
        textoFacebook1: facebook1,
        textoFacebook2: facebook2,
        textoFacebook3: facebook3,
        planificador: planner,
        UZGXo: planner,
        planificadorOrigen: plannerRaw,
        diaPlanificador: day,
        a6X7r: day,
        consignador,
        reservado: 'no',
        Reservado: 'no',
        actualizacionPrecio: 'no',
        'Actualizacion precio': 'no',
        PJe5x: '',
        Cargo: '',
        ofiBroker: '',
        equipoBroker: ''
      }
    };
  }

  function normalizeNinetyRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(normalizeNinetyRow);
  }

  return {
    OPERATION_BY_PREFIX,
    parseCSV,
    isNinetyExport,
    normalizeDay,
    normalizeType,
    normalizeNinetyRow,
    normalizeNinetyRows
  };
});
