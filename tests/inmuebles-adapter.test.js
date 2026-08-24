const fs = require('fs');
const path = require('path');
const assert = require('assert');
const adapter = require('../data-adapter.js');

const csvPath = path.join(__dirname, '..', 'inmuebles (2).csv');
assert.ok(fs.existsSync(csvPath), 'The exported inmuebles CSV must exist');

const rawRows = adapter.parseCSV(fs.readFileSync(csvPath, 'utf8'));
assert.strictEqual(rawRows.length, 278, 'The CSV parser must preserve all 278 records, including multiline text');
assert.ok(adapter.isNinetyExport(rawRows), 'The CSV schema must be detected as a 90 Bot export');

const normalizedRows = adapter.normalizeNinetyRows(rawRows).map(row => row.data);
const publishable = normalizedRows.filter(row => row['34Af3'] === 'si');
assert.strictEqual(publishable.length, 268, 'Only coded listings with images should be publishable');

const expectedOperations = {
  ALQUILER: 101,
  VENTA: 105,
  PREVENTA: 29,
  ANTICRETICO: 17,
  'ENTREGA INMEDIATA': 11,
  'ALQUILER TEMPORAL': 5
};
for (const [operation, count] of Object.entries(expectedOperations)) {
  assert.strictEqual(publishable.filter(row => row.mERYr === operation).length, count, `${operation} count must match the CSV`);
}

const al3Raw = rawRows.find(row => row.codigo === 'AL3');
const al3 = normalizedRows.find(row => row.codigo === 'AL3');
assert.ok(al3, 'AL3 must be normalized');
assert.strictEqual(al3.abzcW, al3Raw['texto facebook 1'].trim(), 'Facebook formatting must be preserved exactly');
assert.strictEqual(al3.vDBia, al3Raw['texto whatsapp'].trim(), 'WhatsApp formatting must be preserved exactly');
assert.ok(al3.abzcW.includes('\n\n'), 'Paragraph breaks must be preserved');
assert.ok(al3.vDBia.includes('📍'), 'Emoji must be preserved');
assert.strictEqual(al3.codigo, 'AL3');
assert.strictEqual(al3.planificador, 3);
assert.strictEqual(al3.diaPlanificador, 'Lunes');
assert.strictEqual(al3.UOFib, 'Bs.');
assert.strictEqual(al3.GRkSW, '2,800');

const wednesday = normalizedRows.find(row => row.diaPlanificador === 'Miércoles');
const saturday = normalizedRows.find(row => row.diaPlanificador === 'Sábado');
assert.ok(wednesday && saturday, 'Unaccented CSV days must be normalized for the planner filters');

const ax1 = normalizedRows.find(row => row.codigo === 'AX1');
const pe1 = normalizedRows.find(row => row.codigo === 'PE1');
assert.strictEqual(ax1.mERYr, 'ALQUILER TEMPORAL');
assert.strictEqual(pe1.mERYr, 'ENTREGA INMEDIATA');

console.log('✅ INMUEBLES CSV ADAPTER TESTS PASSED');
