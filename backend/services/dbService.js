const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'Diccionario_de_datos.db');
let db;

function ensureDb() {
  if (!db) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found at ${dbPath}. Coloque 'Diccionario_de_datos.db' en la carpeta 'backend/data' o convierta su Excel a SQLite.`);
    }
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  }
  return db;
}

function allAsync(sql, params = []) {
  const dbi = ensureDb();
  return new Promise((resolve, reject) => {
    dbi.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getAsync(sql, params = []) {
  const dbi = ensureDb();
  return new Promise((resolve, reject) => {
    dbi.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function getFichaCliente(dniOrClienteId) {
  const cliente = await getAsync('SELECT * FROM clientes WHERE dni = ? OR cliente_id = ?', [dniOrClienteId, dniOrClienteId]).catch(() => null);
  const recibos = await allAsync('SELECT * FROM recibos_anteriores WHERE dni = ? ORDER BY id DESC', [dniOrClienteId]).catch(() => []);
  const perfil = await getAsync('SELECT * FROM dataset_clientes WHERE cliente_id = ?', [dniOrClienteId]).catch(() => null);
  const campanias = await allAsync('SELECT * FROM historial_campanias WHERE cliente_id = ?', [dniOrClienteId]).catch(() => []);

  return { cliente, recibos, perfil, campanias };
}

module.exports = { getFichaCliente };
// Inicializar y verificar existencia del diccionario al inicio
async function initDiccionario() {
  try {
    ensureDb();
    const clientes = await allAsync('SELECT count(*) as c FROM clientes');
    const recibos = await allAsync('SELECT count(*) as c FROM recibos_anteriores');
    const perfiles = await allAsync('SELECT count(*) as c FROM dataset_clientes');
    const camp = await allAsync('SELECT count(*) as c FROM historial_campanias');
    const planta = await allAsync('SELECT count(*) as c FROM diccionario_planta_clientes').catch(() => [{ c: 0 }]);
    const fact = await allAsync('SELECT count(*) as c FROM diccionario_facturacion').catch(() => [{ c: 0 }]);
    const cat = await allAsync('SELECT count(*) as c FROM diccionario_catalogo_ofertas').catch(() => [{ c: 0 }]);

    console.log(`🔗 Diccionario cargado desde: ${dbPath}`);
    console.log(`  - clientes: ${clientes[0] ? clientes[0].c : 0}`);
    console.log(`  - recibos_anteriores: ${recibos[0] ? recibos[0].c : 0}`);
    console.log(`  - dataset_clientes: ${perfiles[0] ? perfiles[0].c : 0}`);
    console.log(`  - historial_campanias: ${camp[0] ? camp[0].c : 0}`);
    console.log(`  - diccionario_planta_clientes: ${planta[0] ? planta[0].c : 0}`);
    console.log(`  - diccionario_facturacion: ${fact[0] ? fact[0].c : 0}`);
    console.log(`  - diccionario_catalogo_ofertas: ${cat[0] ? cat[0].c : 0}`);
  } catch (err) {
    console.warn('⚠️ No se pudo inicializar el Diccionario de datos:', err.message);
  }
}

module.exports.initDiccionario = initDiccionario;