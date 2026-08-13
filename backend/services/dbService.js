/**
 * Acceso a las bases SQLite del proyecto.
 *
 * Hay dos archivos distintos y antes se confundían:
 *
 *   data/app.db                 datos de negocio: clientes, recibos_anteriores,
 *                               dataset_clientes (100K), historial_campanias (300K)
 *   data/Diccionario_de_datos.db  solo el diccionario de campos (diccionario_*)
 *
 * Este módulo apuntaba entero al diccionario y consultaba ahí las cuatro
 * tablas de negocio. Como el diccionario tiene esas tablas creadas pero
 * VACÍAS, no saltaba ningún error: `getFichaCliente` devolvía null siempre y
 * el endpoint /api/dictionary/cliente/:dni respondía una ficha vacía para
 * cualquier DNI. Fallaba en silencio.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const RUTA_APP = path.join(__dirname, '..', 'data', 'app.db');
const RUTA_DICCIONARIO = path.join(__dirname, '..', 'data', 'Diccionario_de_datos.db');

const conexiones = new Map();

/** Abre (una vez) la base indicada en modo lectura. */
function abrir(ruta) {
  if (!conexiones.has(ruta)) {
    if (!fs.existsSync(ruta)) {
      throw new Error(`No se encontró la base de datos en ${ruta}.`);
    }
    conexiones.set(ruta, new sqlite3.Database(ruta, sqlite3.OPEN_READONLY));
  }
  return conexiones.get(ruta);
}

function allAsync(ruta, sql, params = []) {
  return new Promise((resolve, reject) => {
    abrir(ruta).all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getAsync(ruta, sql, params = []) {
  return new Promise((resolve, reject) => {
    abrir(ruta).get(sql, params, (err, row) => {
      if (err) return reject(err);
      // sqlite3 entrega `undefined` cuando no hay fila; se normaliza a `null`
      // para que "no encontrado" sea un solo valor en toda la ficha.
      resolve(row === undefined ? null : row);
    });
  });
}

/**
 * Registra el fallo antes de devolver el valor por defecto.
 *
 * Los `.catch(() => null)` mudos que había acá son los que dejaron el bug
 * invisible durante todo el desarrollo.
 */
function alFallar(etiqueta, porDefecto) {
  return (error) => {
    console.warn(`⚠️ Consulta "${etiqueta}" falló: ${error.message}`);
    return porDefecto;
  };
}

/**
 * Ficha completa de un cliente.
 *
 * Acepta el DNI (tablas `clientes` / `recibos_anteriores`) o el id de cliente
 * (`dataset_clientes` / `historial_campanias`), porque las cuatro tablas no
 * comparten la misma clave.
 *
 * @param {string} dniOrClienteId
 */
async function getFichaCliente(dniOrClienteId) {
  const clave = dniOrClienteId === null || dniOrClienteId === undefined
    ? ''
    : String(dniOrClienteId).trim();

  if (!clave) {
    return { cliente: null, recibos: [], perfil: null, campanias: [] };
  }

  // `clientes` se indexa por dni y no tiene columna cliente_id: la consulta
  // anterior la pedía igual y reventaba en silencio.
  const cliente = await getAsync(RUTA_APP, 'SELECT * FROM clientes WHERE dni = ?', [clave])
    .catch(alFallar('clientes', null));

  const recibos = await allAsync(
    RUTA_APP,
    'SELECT * FROM recibos_anteriores WHERE dni = ? ORDER BY id DESC',
    [clave]
  ).catch(alFallar('recibos_anteriores', []));

  const perfil = await getAsync(RUTA_APP, 'SELECT * FROM dataset_clientes WHERE cliente_id = ?', [clave])
    .catch(alFallar('dataset_clientes', null));

  const campanias = await allAsync(
    RUTA_APP,
    'SELECT * FROM historial_campanias WHERE cliente_id = ?',
    [clave]
  ).catch(alFallar('historial_campanias', []));

  return { cliente, recibos, perfil, campanias };
}

/** Definiciones de campo del diccionario de datos. */
async function getDiccionario() {
  const consultar = (tabla) =>
    allAsync(RUTA_DICCIONARIO, `SELECT * FROM ${tabla}`).catch(alFallar(tabla, []));

  const [planta, facturacion, catalogo] = await Promise.all([
    consultar('diccionario_planta_clientes'),
    consultar('diccionario_facturacion'),
    consultar('diccionario_catalogo_ofertas')
  ]);

  return { planta, facturacion, catalogo };
}

/**
 * Cuenta las filas de cada tabla al arrancar.
 *
 * No es decorativo: si `dataset_clientes` o `historial_campanias` salen en 0,
 * es que se está leyendo la base equivocada. Por eso ahora avisa fuerte en vez
 * de imprimir ceros como si fueran normales.
 */
async function initDiccionario() {
  const contar = (ruta, tabla) =>
    getAsync(ruta, `SELECT count(*) AS c FROM ${tabla}`)
      .then((fila) => (fila ? fila.c : 0))
      .catch(() => -1);

  try {
    const [clientes, recibos, perfiles, campanias] = await Promise.all([
      contar(RUTA_APP, 'clientes'),
      contar(RUTA_APP, 'recibos_anteriores'),
      contar(RUTA_APP, 'dataset_clientes'),
      contar(RUTA_APP, 'historial_campanias')
    ]);

    const [planta, facturacion, catalogo] = await Promise.all([
      contar(RUTA_DICCIONARIO, 'diccionario_planta_clientes'),
      contar(RUTA_DICCIONARIO, 'diccionario_facturacion'),
      contar(RUTA_DICCIONARIO, 'diccionario_catalogo_ofertas')
    ]);

    console.log(`🔗 Datos de negocio desde: ${RUTA_APP}`);
    console.log(`  - clientes: ${clientes}`);
    console.log(`  - recibos_anteriores: ${recibos}`);
    console.log(`  - dataset_clientes: ${perfiles}`);
    console.log(`  - historial_campanias: ${campanias}`);
    console.log(`🔗 Diccionario desde: ${RUTA_DICCIONARIO}`);
    console.log(`  - diccionario_planta_clientes: ${planta}`);
    console.log(`  - diccionario_facturacion: ${facturacion}`);
    console.log(`  - diccionario_catalogo_ofertas: ${catalogo}`);

    if (perfiles <= 0 || campanias <= 0) {
      console.warn('⚠️ dataset_clientes o historial_campanias están vacías. Casi seguro se está');
      console.warn('   leyendo la base equivocada: los datos viven en data/app.db, no en el diccionario.');
    }
  } catch (err) {
    console.warn('⚠️ No se pudieron contar las tablas:', err.message);
  }
}

module.exports = {
  getFichaCliente,
  getDiccionario,
  initDiccionario,
  RUTA_APP,
  RUTA_DICCIONARIO
};
