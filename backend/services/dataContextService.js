const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseDelimitedRows(filePath, delimiter) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return [];
  }

  const headers = parseDelimitedLine(lines[0], delimiter).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseDelimitedLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = normalizeValue(values[index]);
    });
    return row;
  });
}

function listDataFiles(dataDir) {
  if (!fs.existsSync(dataDir)) {
    return [];
  }

  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => path.join(dataDir, entry.name))
    .sort();
}

function readTextFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const shortPath = path.basename(filePath);
    return `--- ${shortPath} ---\n${content.slice(0, 3000)}`;
  } catch (error) {
    return null;
  }
}

function readExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheets = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows && rows.length > 0) {
        sheets.push(`Hoja ${sheetName}: ${JSON.stringify(rows.slice(0, 8))}`);
      }
    });

    if (sheets.length === 0) {
      return null;
    }

    return `--- ${path.basename(filePath)} ---\n${sheets.join('\n')}`;
  } catch (error) {
    return null;
  }
}

function readRowsFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return parseDelimitedRows(filePath, ';');
  }

  if (ext === '.tsv') {
    return parseDelimitedRows(filePath, '\t');
  }

  if (['.xlsx', '.xls'].includes(ext)) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } catch (error) {
      return [];
    }
  }

  if (ext === '.json') {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return raw.includes('"') ? [JSON.parse(raw)] : [];
    } catch (error) {
      return [];
    }
  }

  return [];
}

function readSqliteFile(filePath) {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(filePath, (openErr) => {
      if (openErr) {
        resolve(null);
        return;
      }

      db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
        if (err) {
          db.close();
          resolve(null);
          return;
        }

        const tableNames = (tables || []).map((table) => table.name);

        if (tableNames.length === 0) {
          db.close();
          resolve(`--- ${path.basename(filePath)} ---\nTablas: ninguna`);
          return;
        }

        const summaries = [];
        let pending = tableNames.length;

        tableNames.forEach((tableName) => {
          db.get(`SELECT COUNT(*) AS count FROM \"${tableName}\"`, (countErr, row) => {
            if (!countErr && row) {
              summaries.push(`Tabla ${tableName}: ${row.count} filas`);
            }
            pending -= 1;
            if (pending === 0) {
              db.close();
              resolve(`--- ${path.basename(filePath)} ---\n${summaries.join('\n')}`);
            }
          });
        });
      });
    });
  });
}

function getRowValue(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && normalizeValue(row[key]) !== '') {
      return normalizeValue(row[key]);
    }
  }
  return '';
}

function rowMatchesCustomer(row, customerId, relatedKeys = []) {
  const normalizedCustomerId = String(customerId).trim();
  if (!normalizedCustomerId) {
    return false;
  }

  const values = Object.values(row || {}).map((value) => normalizeValue(value));
  const directMatch = values.some((value) => value.includes(normalizedCustomerId));

  if (directMatch) {
    return true;
  }

  if (relatedKeys.length === 0) {
    return false;
  }

  return values.some((value) => relatedKeys.includes(value));
}

function collectRelatedKeys(row) {
  return [
    getRowValue(row, ['FINANCIAL_ACCOUNT', 'FINANCIAL_ACCOUNT_KEY', 'financial_account', 'financial_account_key']),
    getRowValue(row, ['COD_CLIENTE', 'CUSTOMER_KEY', 'CUSTOMER_ID', 'customer_id', 'cliente_id']),
    getRowValue(row, ['SUBSCRIBER_KEY', 'BILLING_ARRANGEMENT_KEY'])
  ].filter(Boolean);
}

async function buildDataContext(dataDir) {
  const files = listDataFiles(dataDir);
  const sections = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
      const sqliteSummary = await readSqliteFile(filePath);
      if (sqliteSummary) {
        sections.push(sqliteSummary);
      }
      continue;
    }

    if (['.xlsx', '.xls'].includes(ext)) {
      const excelContent = readExcelFile(filePath);
      if (excelContent) {
        sections.push(excelContent);
      }
      continue;
    }

    if (['.txt', '.md', '.json', '.csv', '.tsv', '.log', '.xml', '.yaml', '.yml', '.docx', '.pdf'].includes(ext)) {
      const textContent = readTextFile(filePath);
      if (textContent) {
        sections.push(textContent);
      }
    }
  }

  return sections.join('\n\n');
}

async function buildCustomerDataContext(dataDir, customerId) {
  if (!customerId) {
    return '';
  }

  const files = listDataFiles(dataDir);
  const normalizedId = String(customerId).trim();
  const matches = [];
  const allMatchedRows = [];
  const relatedKeys = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.tsv', '.txt', '.json', '.xlsx', '.xls'].includes(ext)) {
      continue;
    }

    const rows = readRowsFromFile(filePath);
    if (rows.length === 0) {
      continue;
    }

    const directMatches = rows.filter((row) => rowMatchesCustomer(row, normalizedId));
    if (directMatches.length > 0) {
      allMatchedRows.push(...directMatches);
      directMatches.forEach((row) => {
        collectRelatedKeys(row).forEach((key) => {
          if (key && !relatedKeys.includes(key)) {
            relatedKeys.push(key);
          }
        });
      });
    }
  }

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.tsv', '.txt', '.json', '.xlsx', '.xls'].includes(ext)) {
      continue;
    }

    const rows = readRowsFromFile(filePath);
    if (rows.length === 0) {
      continue;
    }

    const candidateRows = rows.filter((row) => rowMatchesCustomer(row, normalizedId, relatedKeys));
    if (candidateRows.length > 0) {
      const joinedRows = candidateRows.slice(0, 8).map((row) => JSON.stringify(row));
      matches.push(`--- ${path.basename(filePath)} ---\n${joinedRows.join('\n')}`);
    }
  }

  return matches.join('\n\n');
}

function parseAmount(value) {
  const cleaned = normalizeValue(value).replace(/[\sS$]/g, '').replace(/,/g, '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCustomerBillingSummary(dataDir, customerId) {
  if (!customerId || !fs.existsSync(dataDir)) {
    return '';
  }

  const files = listDataFiles(dataDir);
  const normalizedId = String(customerId).trim();
  const customerRows = [];
  const billingRows = [];
  const relatedKeys = [];

  files.forEach((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.tsv', '.xlsx', '.xls', '.json'].includes(ext)) {
      return;
    }

    const rows = readRowsFromFile(filePath);
    const directMatches = rows.filter((row) => rowMatchesCustomer(row, normalizedId));

    if (directMatches.length === 0) {
      return;
    }

    const baseName = path.basename(filePath).toLowerCase();
    if (baseName.includes('registro') || baseName.includes('cliente')) {
      customerRows.push(...directMatches);
    }

    if (baseName.includes('cargo') || baseName.includes('factur')) {
      billingRows.push(...directMatches);
    }

    directMatches.forEach((row) => {
      collectRelatedKeys(row).forEach((key) => {
        if (key && !relatedKeys.includes(key)) {
          relatedKeys.push(key);
        }
      });
    });
  });

  files.forEach((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.tsv', '.xlsx', '.xls', '.json'].includes(ext)) {
      return;
    }

    const rows = readRowsFromFile(filePath);
    const sharedMatches = rows.filter((row) => rowMatchesCustomer(row, normalizedId, relatedKeys));
    if (sharedMatches.length === 0) {
      return;
    }

    const baseName = path.basename(filePath).toLowerCase();
    if (baseName.includes('cargo') || baseName.includes('factur')) {
      billingRows.push(...sharedMatches.filter((row) => !billingRows.some((existing) => JSON.stringify(existing) === JSON.stringify(row))));
    }
  });

  if (billingRows.length === 0) {
    return '';
  }

  const financialAccount = [
    getRowValue(customerRows[0] || {}, ['FINANCIAL_ACCOUNT', 'FINANCIAL_ACCOUNT_KEY', 'financial_account', 'financial_account_key']),
    getRowValue(customerRows[0] || {}, ['SUBSCRIBER_KEY'])
  ].find(Boolean);

  const debtValues = billingRows
    .map((row) => getRowValue(row, ['DEUDA', 'deuda']))
    .filter(Boolean);
  const debtLabel = debtValues.find((value) => /deuda/i.test(value)) || '';

  const chargeAmounts = billingRows
    .map((row) => parseAmount(getRowValue(row, ['CHARGE_NET_AMOUNT', 'CHARGE_TOTAL_AMOUNT', 'monto', 'amount'])))
    .filter((value) => value !== 0);
  const netBalance = chargeAmounts.reduce((sum, value) => sum + value, 0);

  const dueDate = billingRows
    .map((row) => getRowValue(row, ['FECHA-VENCIMIENTO', 'FECHA_VENCIMIENTO', 'fecha_vencimiento', 'vencimiento']))
    .find(Boolean) || '';

  const descriptions = billingRows
    .slice(0, 5)
    .map((row) => {
      const description = getRowValue(row, ['CHARGE_CODE_DESC', 'CHARGE_CODE_DESCRIPTION', 'description', 'descripcion']);
      const amount = parseAmount(getRowValue(row, ['CHARGE_NET_AMOUNT', 'CHARGE_TOTAL_AMOUNT', 'monto', 'amount']));
      return `${description || 'Cargo sin descripción'} · S/ ${amount.toFixed(2)}`;
    });

  const hasDebt = /deuda/i.test(debtLabel) || netBalance > 0.01;
  const statusText = hasDebt ? 'CON DEUDA' : 'SIN DEUDA';

  return [
    'RESUMEN ESTRUCTURADO DE FACTURACIÓN',
    `- Cliente: ${customerId}`,
    financialAccount ? `- Cuenta financiera relacionada: ${financialAccount}` : '',
    `- Estado de deuda: ${statusText}`,
    `- Monto neto estimado: S/ ${netBalance.toFixed(2)}`,
    dueDate ? `- Fecha de vencimiento: ${dueDate}` : '',
    descriptions.length > 0 ? '- Cargos principales:' : '',
    ...descriptions.map((item) => `  • ${item}`)
  ].filter(Boolean).join('\n');
}

module.exports = {
  buildDataContext,
  buildCustomerDataContext,
  buildCustomerBillingSummary
};
