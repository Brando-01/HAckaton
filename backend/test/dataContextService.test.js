const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');

const { buildDataContext, buildCustomerDataContext, buildCustomerBillingSummary } = require('../services/dataContextService');

test('buildDataContext loads text and sqlite files from a data folder', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-context-'));

  fs.writeFileSync(path.join(tempDir, 'clientes.csv'), 'dni,nombre\n123,Carlos\n');
  fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ plan: 'Movistar Total' }));

  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(tempDir, 'demo.db');
  const db = new sqlite3.Database(dbPath);

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)', (err) => {
        if (err) {
          reject(err);
          return;
        }
        db.run("INSERT INTO sample (value) VALUES ('ok')", (insertErr) => {
          if (insertErr) {
            reject(insertErr);
            return;
          }
          db.close((closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }
            resolve();
          });
        });
      });
    });
  });

  const context = await buildDataContext(tempDir);

  assert.match(context, /clientes.csv/);
  assert.match(context, /Carlos/);
  assert.match(context, /config.json/);
  assert.match(context, /Movistar Total/);
  assert.match(context, /demo.db/);
  assert.match(context, /sample/);
});

test('buildDataContext reads xlsx files from a data folder', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-context-xlsx-'));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['producto', 'monto'],
    ['internet', 50]
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Resumen');

  const xlsxPath = path.join(tempDir, 'ventas.xlsx');
  XLSX.writeFile(workbook, xlsxPath);

  const context = await buildDataContext(tempDir);

  assert.match(context, /ventas.xlsx/);
  assert.match(context, /internet/);
  assert.match(context, /50/);
});

test('buildCustomerDataContext joins shared financial account keys across CSV files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-context-customer-'));
  fs.writeFileSync(path.join(tempDir, 'REGISTROS_CLIENTES_20MIL.csv'), 'COD_CLIENTE;FINANCIAL_ACCOUNT;NUM_ANEXO\n52115748;742756279;145916087\n');
  fs.writeFileSync(path.join(tempDir, 'Cargos_FacturadosV2.csv'), 'FINANCIAL_ACCOUNT_KEY;CUSTOMER_KEY;DEUDA;CHARGE_TOTAL_AMOUNT\n742756279;55072607;SIN DEUDA;60.3\n');

  const context = await buildCustomerDataContext(tempDir, '52115748');

  assert.match(context, /52115748/);
  assert.match(context, /742756279/);
  assert.match(context, /SIN DEUDA/);
  assert.match(context, /60.3/);
});

test('buildCustomerBillingSummary produces a structured billing outcome', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-summary-'));
  fs.writeFileSync(path.join(tempDir, 'REGISTROS_CLIENTES_20MIL.csv'), 'COD_CLIENTE;FINANCIAL_ACCOUNT;NUM_ANEXO\n52115748;742756279;145916087\n');
  fs.writeFileSync(path.join(tempDir, 'Cargos_FacturadosV2.csv'), 'FINANCIAL_ACCOUNT_KEY;CUSTOMER_KEY;DEUDA;CHARGE_TOTAL_AMOUNT;FECHA_VENCIMIENTO;CHARGE_CODE_DESC\n742756279;55072607;CON DEUDA;120.5;2026-09-15;Recarga adicional\n');

  const summary = buildCustomerBillingSummary(tempDir, '52115748');

  assert.match(summary, /CON DEUDA/);
  assert.match(summary, /120.50/);
  assert.match(summary, /2026-09-15/);
  assert.match(summary, /Recarga adicional/);
});
