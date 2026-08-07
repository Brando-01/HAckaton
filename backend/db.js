const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbPath = path.join(__dirname, 'data', 'app.db');
const jsonSeedPath = path.join(__dirname, 'data', 'recibos_demo.json');

let SQL;
let db;

async function createDatabase() {
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    db = new SQL.Database();
    createTables();
    seedFromJson();
    saveDatabaseFile();
  }
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      dni TEXT PRIMARY KEY,
      nombre TEXT,
      plan TEXT,
      recibo_actual_periodo TEXT,
      recibo_actual_monto REAL,
      recibo_actual_vencimiento TEXT,
      variacion_diferencia TEXT,
      variacion_motivo TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recibos_anteriores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dni TEXT,
      periodo TEXT,
      monto REAL,
      FOREIGN KEY(dni) REFERENCES clientes(dni)
    );
  `);
}

function seedFromJson() {
  if (!fs.existsSync(jsonSeedPath)) {
    return;
  }

  const result = db.exec('SELECT count(*) AS count FROM clientes;');
  if (result.length && result[0].values[0][0] > 0) {
    return;
  }

  const rawData = fs.readFileSync(jsonSeedPath, 'utf-8');
  const dataset = JSON.parse(rawData);

  const insertCliente = db.prepare(`
    INSERT INTO clientes (
      dni,
      nombre,
      plan,
      recibo_actual_periodo,
      recibo_actual_monto,
      recibo_actual_vencimiento,
      variacion_diferencia,
      variacion_motivo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRecibo = db.prepare(`
    INSERT INTO recibos_anteriores (dni, periodo, monto) VALUES (?, ?, ?)
  `);

  db.run('BEGIN TRANSACTION;');
  for (const [dni, cliente] of Object.entries(dataset)) {
    const data = [
      cliente.dni || dni,
      cliente.nombre || '',
      cliente.plan || '',
      cliente.recibo_actual?.periodo || '',
      cliente.recibo_actual?.monto || 0,
      cliente.recibo_actual?.vencimiento || '',
      cliente.variacion?.diferencia || '',
      cliente.variacion?.motivo || ''
    ];

    insertCliente.run(data);

    if (Array.isArray(cliente.recibos_anteriores)) {
      for (const recibo of cliente.recibos_anteriores) {
        insertRecibo.run([
          cliente.dni || dni,
          recibo.periodo || '',
          recibo.monto || 0
        ]);
      }
    }
  }
  db.run('COMMIT;');
}

function saveDatabaseFile() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function ensureDb() {
  if (!db) {
    throw new Error('Base de datos no inicializada');
  }
  return db;
}

function getClienteByDni(dni) {
  const dbInstance = ensureDb();
  const stmt = dbInstance.prepare('SELECT * FROM clientes WHERE dni = ?');
  const clienteRow = stmt.getAsObject([dni]);
  if (!clienteRow || !clienteRow.dni) {
    return null;
  }

  const recibosStmt = dbInstance.prepare('SELECT periodo, monto FROM recibos_anteriores WHERE dni = ? ORDER BY id DESC');
  const recibos = [];
  recibosStmt.bind([dni]);
  while (recibosStmt.step()) {
    const row = recibosStmt.getAsObject();
    recibos.push({ periodo: row.periodo, monto: row.monto });
  }
  recibosStmt.free();
  stmt.free();

  return {
    nombre: clienteRow.nombre,
    dni: clienteRow.dni,
    plan: clienteRow.plan,
    recibo_actual: {
      periodo: clienteRow.recibo_actual_periodo,
      monto: clienteRow.recibo_actual_monto,
      vencimiento: clienteRow.recibo_actual_vencimiento
    },
    recibos_anteriores: recibos,
    variacion: {
      diferencia: clienteRow.variacion_diferencia,
      motivo: clienteRow.variacion_motivo
    }
  };
}

async function initDatabase() {
  SQL = await initSqlJs();
  await createDatabase();
}

const dbReady = initDatabase();

module.exports = {
  dbReady,
  getClienteByDni
};
