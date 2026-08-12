const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'Diccionario_de_datos.db');

const defaultXlsx = path.join(dataDir, 'Diccionario_de_datos.xlsx');
const xlsxPath = process.argv[2] || defaultXlsx;

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(xlsxPath)) {
  console.error(`Archivo .xlsx no encontrado en: ${xlsxPath}`);
  console.error('Coloca tu archivo Diccionario_de_datos.xlsx dentro de backend/data o pasa la ruta como argumento.');
  process.exit(1);
}

console.log('Leyendo workbook:', xlsxPath);
const workbook = XLSX.readFile(xlsxPath, { cellDates: true });

function sheetToJsonByNames(names) {
  for (const name of names) {
    if (workbook.Sheets[name]) {
      return XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null });
    }
  }
  return [];
}

const clientesRows = sheetToJsonByNames(['clientes', 'Clientes', 'CLIENTES']);
const recibosRows = sheetToJsonByNames(['recibos_anteriores', 'recibos anteriores', 'Recibos_anteriores', 'RECIBOS_ANTERIORES']);
const datasetRows = sheetToJsonByNames(['dataset_clientes', 'dataset clientes', 'Dataset_clientes', 'DATASET_CLIENTES']);
const campaniasRows = sheetToJsonByNames(['historial_campanias', 'historial campanias', 'Historial_campanias', 'HISTORIAL_CAMPANIAS']);

// Hojas de diccionario / metadatos (nombres detectados en tu workbook)
const plantaRows = sheetToJsonByNames(['PLANTA-CLIENTES', 'PLANTA CLIENTES', 'PLANTA_CLIENTES']);
const facturacionRows = sheetToJsonByNames(['FACTURACION-CLIENTES ', 'FACTURACION-CLIENTES', 'FACTURACION_CLIENTES']);
const catalogoRows = sheetToJsonByNames(['CATALOGO-OFERTAS', 'CATALOGO OFERTAS', 'CATALOGO_OFERTAS']);

const db = new sqlite3.Database(dbPath);

function run(sql) {
  return new Promise((resolve, reject) => db.run(sql, (err) => (err ? reject(err) : resolve())));
}

async function main() {
  try {
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

    // Tablas para diccionario/metadatos (hojas descriptivas)
    await run(`CREATE TABLE IF NOT EXISTS diccionario_planta_clientes (
      campo TEXT,
      tipo_de_dato TEXT,
      longitud TEXT,
      descripcion TEXT,
      observacion TEXT
    );`);

    await run(`CREATE TABLE IF NOT EXISTS diccionario_facturacion (
      campo TEXT,
      tipo_de_dato TEXT,
      longitud TEXT,
      descripcion TEXT,
      observacion TEXT
    );`);

    await run(`CREATE TABLE IF NOT EXISTS diccionario_catalogo_ofertas (
      campo TEXT,
      tipo_de_dato TEXT,
      longitud TEXT,
      descripcion TEXT
    );`);

    const insertCliente = db.prepare('INSERT OR REPLACE INTO clientes (dni,nombre,plan,recibo_actual_monto,recibo_actual_vencimiento,variacion_motivo) VALUES (?,?,?,?,?,?)');
    const insertRecibo = db.prepare('INSERT INTO recibos_anteriores (dni,periodo,monto) VALUES (?,?,?)');
    const insertDataset = db.prepare('INSERT OR REPLACE INTO dataset_clientes (cliente_id,antiguedad_meses,es_movistar_total,elegible_mt,consumo_datos_gb_prom,dias_mora_prom) VALUES (?,?,?,?,?,?)');
    const insertCamp = db.prepare('INSERT OR REPLACE INTO historial_campanias (ofrecimiento_id,cliente_id,oferta_id,resultado,motivo_rechazo) VALUES (?,?,?,?,?)');
    const insertPlanta = db.prepare('INSERT INTO diccionario_planta_clientes (campo,tipo_de_dato,longitud,descripcion,observacion) VALUES (?,?,?,?,?)');
    const insertFact = db.prepare('INSERT INTO diccionario_facturacion (campo,tipo_de_dato,longitud,descripcion,observacion) VALUES (?,?,?,?,?)');
    const insertCatalog = db.prepare('INSERT INTO diccionario_catalogo_ofertas (campo,tipo_de_dato,longitud,descripcion) VALUES (?,?,?,?)');

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      for (const r of clientesRows) {
        insertCliente.run([
          r.dni || r.DNI || r.Dni || null,
          r.nombre || r.Nombre || null,
          r.plan || null,
          r.recibo_actual_monto || r.recibo_monto || null,
          r.recibo_actual_vencimiento || r.vencimiento || null,
          r.variacion_motivo || r.motivo || null
        ]);
      }

      for (const r of recibosRows) {
        insertRecibo.run([
          r.dni || r.DNI || null,
          r.periodo || null,
          r.monto || null
        ]);
      }

      for (const r of datasetRows) {
        insertDataset.run([
          r.cliente_id || r.CLIENTE_ID || r.ClienteId || null,
          r.antiguedad_meses || r.antiguedad || null,
          r.es_movistar_total ? (r.es_movistar_total === '1' || r.es_movistar_total === 1 ? 1 : 0) : 0,
          r.elegible_mt ? (r.elegible_mt === '1' || r.elegible_mt === 1 ? 1 : 0) : 0,
          r.consumo_datos_gb_prom || r.consumo || null,
          r.dias_mora_prom || null
        ]);
      }

      for (const r of campaniasRows) {
        insertCamp.run([
          r.ofrecimiento_id || r.OFRECIMIENTO_ID || null,
          r.cliente_id || null,
          r.oferta_id || r.OFERTA_ID || null,
          r.resultado || null,
          r.motivo_rechazo || null
        ]);
      }

      // Importar hojas de diccionario / metadatos
      for (const r of plantaRows) {
        insertPlanta.run([
          r.CAMPOS || r.campo || null,
          r['TIPO DE DATO'] || r.tipo_de_dato || null,
          r.LONGITUD || r.longitud || null,
          r.DESCRIPCION || r.descripcion || null,
          r.OBSERVACION || r.observacion || null
        ]);
      }

      for (const r of facturacionRows) {
        insertFact.run([
          r.CAMPOS || r.campo || null,
          r['TIPO DE DATO'] || r.tipo_de_dato || null,
          r.LONGITUD || r.longitud || null,
          r.DESCRIPCION || r.descripcion || null,
          r.OBSERVACION || r.observacion || null
        ]);
      }

      for (const r of catalogoRows) {
        insertCatalog.run([
          r.CAMPOS || r.campo || null,
          r['TIPO DE DATO'] || r.tipo_de_dato || null,
          r.LONGITUD || r.longitud || null,
          r.DESCRIPCION || r.descripcion || null
        ]);
      }

      db.run('COMMIT', (err) => {
        if (err) {
          console.error('Error finalizando transacción:', err);
        } else {
          console.log('Importación desde .xlsx completada. Archivo SQLite en:', dbPath);
        }
        insertCliente.finalize();
        insertRecibo.finalize();
        insertDataset.finalize();
        insertCamp.finalize();
        insertPlanta.finalize();
        insertFact.finalize();
        insertCatalog.finalize();
        db.close();
      });
    });

  } catch (err) {
    console.error('Error durante importación .xlsx:', err);
    db.close();
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { main };
