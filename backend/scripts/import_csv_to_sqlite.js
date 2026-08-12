const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'Diccionario_de_datos.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function importCsvToTable(csvFile, insertSql, columns) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(dataDir, csvFile);
    if (!fs.existsSync(filePath)) {
      console.log(`Archivo no encontrado: ${filePath} — se omitirá.`);
      return resolve();
    }

    const stmt = db.prepare(insertSql);
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          const vals = columns.map((c) => (row[c] === undefined || row[c] === '' ? null : row[c]));
          stmt.run(vals);
        })
        .on('end', () => {
          db.run('COMMIT');
          stmt.finalize();
          console.log(`Importado: ${csvFile}`);
          resolve();
        })
        .on('error', (err) => reject(err));
    });
  });
}

async function main() {
  try {
    // Crear tablas (si no existen)
    await run(`CREATE TABLE IF NOT EXISTS clientes (
      dni TEXT PRIMARY KEY,
      nombre TEXT,
      plan TEXT,
      recibo_actual_monto REAL,
      recibo_actual_vencimiento TEXT,
      variacion_motivo TEXT
    );`);

    await run(`CREATE TABLE IF NOT EXISTS recibos_anteriores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dni TEXT,
      periodo TEXT,
      monto REAL
    );`);

    await run(`CREATE TABLE IF NOT EXISTS dataset_clientes (
      cliente_id TEXT PRIMARY KEY,
      antiguedad_meses INTEGER,
      es_movistar_total INTEGER,
      elegible_mt INTEGER,
      consumo_datos_gb_prom REAL,
      dias_mora_prom REAL
    );`);

    await run(`CREATE TABLE IF NOT EXISTS historial_campanias (
      ofrecimiento_id TEXT PRIMARY KEY,
      cliente_id TEXT,
      oferta_id TEXT,
      resultado TEXT,
      motivo_rechazo TEXT
    );`);

    // Importar CSVs (exporta cada hoja del Excel como CSV con estos nombres)
    await importCsvToTable('clientes.csv', 'INSERT OR REPLACE INTO clientes (dni,nombre,plan,recibo_actual_monto,recibo_actual_vencimiento,variacion_motivo) VALUES (?,?,?,?,?,?)', ['dni','nombre','plan','recibo_actual_monto','recibo_actual_vencimiento','variacion_motivo']);

    await importCsvToTable('recibos_anteriores.csv', 'INSERT INTO recibos_anteriores (dni,periodo,monto) VALUES (?,?,?)', ['dni','periodo','monto']);

    await importCsvToTable('dataset_clientes.csv', 'INSERT OR REPLACE INTO dataset_clientes (cliente_id,antiguedad_meses,es_movistar_total,elegible_mt,consumo_datos_gb_prom,dias_mora_prom) VALUES (?,?,?,?,?,?)', ['cliente_id','antiguedad_meses','es_movistar_total','elegible_mt','consumo_datos_gb_prom','dias_mora_prom']);

    await importCsvToTable('historial_campanias.csv', 'INSERT OR REPLACE INTO historial_campanias (ofrecimiento_id,cliente_id,oferta_id,resultado,motivo_rechazo) VALUES (?,?,?,?,?)', ['ofrecimiento_id','cliente_id','oferta_id','resultado','motivo_rechazo']);

    console.log('Importación completada. Archivo SQLite en:', dbPath);
    db.close();
  } catch (err) {
    console.error('Error durante importación:', err);
    db.close();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
