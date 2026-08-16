const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');

function checkDb(dbPath, label) {
  return new Promise((resolve) => {
    console.log('\n=== ' + label + ' ===');
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) { console.error('  Error opening:', err.message); resolve(); return; }
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err2, tables) => {
        if (err2) { console.error('  Error listing tables:', err2.message); db.close(); resolve(); return; }
        if (!tables || tables.length === 0) { console.log('  (no tables)'); db.close(); resolve(); return; }
        let pending = tables.length;
        tables.forEach(t => {
          db.get('SELECT COUNT(*) as c FROM [' + t.name + ']', (err3, row) => {
            console.log('  ' + t.name + ': ' + (row ? row.c : 0) + ' rows');
            if (row && row.c > 0) {
              db.get('SELECT * FROM [' + t.name + '] LIMIT 1', (err4, sample) => {
                if (sample) console.log('    columns: ' + Object.keys(sample).join(', '));
                pending--;
                if (pending === 0) { db.close(); resolve(); }
              });
            } else {
              pending--;
              if (pending === 0) { db.close(); resolve(); }
            }
          });
        });
      });
    });
  });
}

async function main() {
  await checkDb(path.join(dataDir, 'app.db'), 'app.db');
  await checkDb(path.join(dataDir, 'Diccionario_de_datos.db'), 'Diccionario_de_datos.db');

  console.log('\n=== CSV files in data/ ===');
  const csvFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));
  csvFiles.forEach(f => {
    const content = fs.readFileSync(path.join(dataDir, f), 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    console.log('  ' + f + ': ' + (lines.length - 1) + ' data rows');
    console.log('    header: ' + lines[0].substring(0, 150));
  });

  console.log('\n=== XLSX files in data/ ===');
  const xlsxFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.xlsx'));
  xlsxFiles.forEach(f => {
    const stats = fs.statSync(path.join(dataDir, f));
    console.log('  ' + f + ' (' + Math.round(stats.size/1024) + ' KB)');
  });
}

main().catch(e => console.error(e));
