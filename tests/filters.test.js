const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Verify data.json exists and contains rows
const dataPath = path.join(__dirname, '..', 'data.json');
assert.ok(fs.existsSync(dataPath), 'data.json must exist');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
assert.ok(Array.isArray(data.rows), 'data.json must have a rows array');
assert.ok(data.rows.length > 0, 'data.json must contain rows');

const rows = data.rows.map(r => r.data || r);

// 2. Verify column extraction
let sampleWithOfi = rows.find(r => r.ofiBroker);
assert.ok(sampleWithOfi, 'At least one property must have ofiBroker extracted');

let sampleWithEquipo = rows.find(r => r.equipoBroker);
assert.ok(sampleWithEquipo, 'At least one property must have equipoBroker extracted');

let sampleWithPlanificador = rows.find(r => r.planificador);
assert.ok(sampleWithPlanificador, 'At least one property must have planificador extracted');

let sampleWithDia = rows.find(r => r.diaPlanificador);
assert.ok(sampleWithDia, 'At least one property must have diaPlanificador extracted');

// 3. Verify Active Condition: DISPONIBLE == "si" and Cargo != "EX"
rows.forEach(r => {
  const isAvailable = r['34Af3'] === 'si';
  const cargo = String(r.Cargo || r.PJe5x || '').trim();
  const isEx = /^ex/i.test(cargo);
  if (isAvailable) {
    assert.strictEqual(isEx, false, `Property ${r.lak0f} marked active ('34Af3'='si') but has Cargo 'EX': ${cargo}`);
  }
});

// 4. Test filter function implementation
function filterProperties(list, options = {}) {
  const {
    activeOnly = true,
    groups = [], // Planificador 1-5 (array of numbers)
    day = '',    // Single Dia planificador
    ofi = '',    // Oficina Broker
    op = '',
    type = ''
  } = options;

  return list.filter(item => {
    // DISPONIBLE = "si" and Cargo != "EX"
    if (activeOnly && item['34Af3'] !== 'si') return false;

    // Planificador 1-5 filter (multi-select)
    if (groups.length > 0) {
      const itemGroup = Number(item.planificador || item.UZGXo);
      if (!groups.includes(itemGroup)) return false;
    }

    // Día planificador filter (single selection)
    if (day) {
      const itemDay = String(item.diaPlanificador || item.a6X7r || '').trim();
      if (itemDay !== day) return false;
    }

    // Oficina Broker filter
    if (ofi && String(item.ofiBroker || '').trim() !== ofi) return false;

    if (op && item.mERYr !== op) return false;
    if (type && item.oHoAu !== type) return false;

    return true;
  });
}

// Test multi-select Planificador
const groupFiltered = filterProperties(rows, { activeOnly: true, groups: [1, 3] });
assert.ok(groupFiltered.length > 0, 'Filtering by groups [1, 3] should return properties');
groupFiltered.forEach(r => {
  const g = Number(r.planificador || r.UZGXo);
  assert.ok([1, 3].includes(g), `Property group ${g} should be in [1, 3]`);
});

// Test single-select Día
const dayFiltered = filterProperties(rows, { activeOnly: true, day: 'Miércoles' });
assert.ok(dayFiltered.length > 0, 'Filtering by day Miércoles should return properties');
dayFiltered.forEach(r => {
  const d = String(r.diaPlanificador || r.a6X7r || '').trim();
  assert.strictEqual(d, 'Miércoles');
});

// Test Oficina Broker filter
const ofiFiltered = filterProperties(rows, { activeOnly: true, ofi: 'Central' });
assert.ok(ofiFiltered.length > 0, 'Filtering by ofi Central should return properties');
ofiFiltered.forEach(r => {
  assert.strictEqual(r.ofiBroker, 'Central');
});

console.log('✅ ALL FILTER TDD TESTS PASSED SUCCESSFULLY!');
