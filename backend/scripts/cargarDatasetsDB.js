// scripts/cargarDatasetsDB.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

// Asegurar que la carpeta 'data' exista
const dataFolder = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
}

// Ruta a app.db en la carpeta data/
const dbPath = path.resolve(dataFolder, 'app.db');
const db = new sqlite3.Database(dbPath);

console.log(`📁 Usando base de datos en: ${dbPath}`);

// Buscar CSV tanto en /data como en la raíz del proyecto
function obtenerRutaCSV(nombreArchivo) {
  const rutaData = path.resolve(__dirname, '../data', nombreArchivo);
  if (fs.existsSync(rutaData)) return rutaData;

  const rutaRaiz = path.resolve(__dirname, '..', nombreArchivo);
  if (fs.existsSync(rutaRaiz)) return rutaRaiz;

  return rutaData;
}

function ejecutarQuery(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function inicializarTablas() {
  console.log('🛠️ Creando/Verificando tablas en SQLite...');
  await ejecutarQuery(`CREATE TABLE IF NOT EXISTS dataset_clientes (
    cliente_id TEXT PRIMARY KEY,
    tipo_cliente TEXT,
    antiguedad_meses INTEGER,
    tiene_movil TEXT,
    tiene_hogar TEXT,
    oferta_hogar_id TEXT,
    tiene_internet_hogar TEXT,
    es_movistar_total TEXT,
    elegible_mt TEXT,
    plan_actual_id TEXT,
    monto_facturado_prom REAL,
    edad_rango TEXT,
    ubicacion_departamento TEXT,
    es_usuario_app TEXT,
    consumo_datos_gb_prom REAL,
    consumo_voz_min_prom REAL,
    consumo_sms_prom REAL,
    uso_app_movistar_prom REAL,
    monto_facturado_prom_6m REAL,
    dias_mora_prom REAL,
    meses_moroso INTEGER,
    n_reclamos INTEGER,
    n_actividad_canal INTEGER,
    canal_mas_usado TEXT
  )`);

  await ejecutarQuery(`CREATE TABLE IF NOT EXISTS historial_campanias (
    ofrecimiento_id TEXT PRIMARY KEY,
    cliente_id TEXT,
    oferta_id TEXT,
    fecha TEXT,
    canal TEXT,
    resultado TEXT,
    motivo_rechazo TEXT,
    es_rebate TEXT,
    contactabilidad TEXT,
    nombre_oferta TEXT,
    tipo_oferta TEXT,
    oferta_es_mt TEXT
  )`);
}

function cargarCSVAProceso(nombreArchivo, sqlInsert, mapper) {
  return new Promise((resolve, reject) => {
    const ruta = obtenerRutaCSV(nombreArchivo);
    if (!fs.existsSync(ruta)) {
      console.warn(`⚠️ No se encontró el archivo: ${nombreArchivo}`);
      return resolve();
    }

    console.log(`⏳ Cargando ${nombreArchivo} desde: ${ruta}`);
    
    let contador = 0;
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(sqlInsert);

      fs.createReadStream(ruta)
        .pipe(csv())
        .on('data', (row) => {
          stmt.run(mapper(row));
          contador++;
        })
        .on('end', () => {
          stmt.finalize();
          db.run('COMMIT', (err) => {
            if (err) return reject(err);
            console.log(`✅ ${nombreArchivo} indexado con éxito. Total filas: ${contador}`);
            resolve();
          });
        })
        .on('error', (err) => reject(err));
    });
  });
}

async function procesarTodo() {
  try {
    await inicializarTablas();

    // 1. Dataset Clientes
    const sqlClientes = `INSERT OR REPLACE INTO dataset_clientes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    await cargarCSVAProceso('dataset_clientes.csv', sqlClientes, (row) => [
      row.cliente_id, row.tipo_cliente, row.antiguedad_meses, row.tiene_movil, row.tiene_hogar,
      row.oferta_hogar_id, row.tiene_internet_hogar, row.es_movistar_total, row.elegible_mt,
      row.plan_actual_id, row.monto_facturado_prom, row.edad_rango, row.ubicacion_departamento,
      row.es_usuario_app, row.consumo_datos_gb_prom, row.consumo_voz_min_prom, row.consumo_sms_prom,
      row.uso_app_movistar_prom, row.monto_facturado_prom_6m, row.dias_mora_prom, row.meses_moroso,
      row.n_reclamos, row.n_actividad_canal, row.canal_mas_usado
    ]);

    // 2. Historial Campañas
    const sqlHistorial = `INSERT OR REPLACE INTO historial_campanias VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
    await cargarCSVAProceso('historial_campanias.csv', sqlHistorial, (row) => [
      row.ofrecimiento_id, row.cliente_id, row.oferta_id, row.fecha, row.canal,
      row.resultado, row.motivo_rechazo, row.es_rebate, row.contactabilidad,
      row.nombre_oferta, row.tipo_oferta, row.oferta_es_mt
    ]);

    console.log('🎉 ¡Carga completa finalizada exitosamente en data/app.db!');
    db.close();
  } catch (error) {
    console.error('❌ Error durante el proceso de carga:', error);
  }
}

procesarTodo();