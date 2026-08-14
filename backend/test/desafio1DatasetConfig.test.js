const test = require('node:test');
const assert = require('node:assert/strict');

const { DATASETS, INDEX_STATEMENTS } = require('../scripts/desafio1/datasets');

test('la Fase 1 contempla exactamente las ocho fuentes CSV actuales', () => {
  const fileNames = DATASETS.map((dataset) => dataset.fileName).sort();

  assert.deepEqual(fileNames, [
    'BRAINY_DESCUENTOS_CUOTAS.csv',
    'BRAINY_PRORRATEO_ALTASV3.csv',
    'BRAINY_RECONEXIONESV3.csv',
    'CATALOGO-OFERTAS.csv',
    'FACTURACION-CLIENTES.csv',
    'NOTAS_CREDITO.csv',
    'Ordenes.csv',
    'PLANTA CLIENTES.csv'
  ].sort());
});

test('cada dataset tiene claves, tabla y columnas de destino únicas', () => {
  const keys = DATASETS.map((dataset) => dataset.key);
  const tables = DATASETS.map((dataset) => dataset.tableName);

  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(tables).size, tables.length);

  for (const dataset of DATASETS) {
    const targets = dataset.columns.map((column) => column.target);
    assert.equal(
      new Set(targets).size,
      targets.length,
      `Targets duplicados en ${dataset.key}`
    );
    assert.ok(dataset.createTableSql.includes(dataset.tableName));
  }
});

test('se definen índices para las relaciones principales de la Fase 2', () => {
  const sql = INDEX_STATEMENTS.join('\n');

  assert.match(sql, /d1_facturacion\(subscriber_key, billing_cycle_date\)/);
  assert.match(sql, /d1_facturacion\(legal_invoice_number\)/);
  assert.match(sql, /d1_ordenes\(subscriber_key, completion_date\)/);
  assert.match(sql, /d1_prorrateos\(invoice_number\)/);
  assert.match(sql, /d1_reconexiones\(invoice_number\)/);
});

test('FACTURACION v2 usa el CSV corregido y conserva solo campos persistibles', () => {
  const dataset = DATASETS.find(
    (item) => item.key === 'facturacion_clientes'
  );

  assert.ok(dataset);
  assert.equal(dataset.fileName, 'FACTURACION-CLIENTES.csv');
  assert.equal(dataset.delimiter, ',');

  const sources = dataset.columns.map(
    (column) => column.source
  );
  const targets = dataset.columns.map(
    (column) => column.target
  );

  assert.ok(sources.includes('PERIOD_START_DATE'));
  assert.ok(sources.includes('PERIOD_END_DATE'));
  assert.ok(!sources.includes('FECHA-VENCIMIENTO'));
  assert.ok(!sources.includes('DEUDA'));
  assert.ok(!targets.includes('due_date'));
  assert.ok(!targets.includes('debt_status'));

  assert.deepEqual(
    dataset.ignoredHeaders,
    [
      'PRIMARY_RESOURCE_VALUE',
      'SUBSCRIBER_KEY_1'
    ]
  );

  assert.deepEqual(
    dataset.consistencyChecks,
    [
      {
        left: 'SUBSCRIBER_KEY',
        right: 'SUBSCRIBER_KEY_1',
        required: true,
        label: 'SUBSCRIBER_KEY duplicado'
      }
    ]
  );

  assert.match(
    dataset.createTableSql,
    /period_start_date TEXT/
  );
  assert.match(
    dataset.createTableSql,
    /period_end_date TEXT/
  );
  assert.doesNotMatch(
    dataset.createTableSql,
    /due_date|debt_status/
  );
});
