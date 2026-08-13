/**
 * Estos tests existen porque el bug era invisible: dbService apuntaba a
 * Diccionario_de_datos.db, que tiene las tablas de negocio creadas pero
 * VACÍAS, así que no lanzaba error — solo devolvía null para todo el mundo.
 *
 * Por eso las aserciones son sobre datos que tienen que estar, no sobre que
 * "la consulta no falle": una consulta a la base equivocada tampoco falla.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  getFichaCliente,
  getDiccionario,
  RUTA_APP,
  RUTA_DICCIONARIO
} = require('../services/dbService');

const HAY_APP_DB = fs.existsSync(RUTA_APP);
const HAY_DICCIONARIO = fs.existsSync(RUTA_DICCIONARIO);

test('apunta a app.db para los datos de negocio, no al diccionario', () => {
  assert.match(RUTA_APP, /app\.db$/);
  assert.match(RUTA_DICCIONARIO, /Diccionario_de_datos\.db$/);
  assert.notEqual(RUTA_APP, RUTA_DICCIONARIO);
});

test('un identificador vacío devuelve una ficha vacía sin consultar', async () => {
  for (const vacio of ['', '   ', null, undefined]) {
    const ficha = await getFichaCliente(vacio);

    assert.equal(ficha.cliente, null);
    assert.equal(ficha.perfil, null);
    assert.deepEqual(ficha.recibos, []);
    assert.deepEqual(ficha.campanias, []);
  }
});

test('trae el perfil NBO de un cliente real', { skip: !HAY_APP_DB && 'falta data/app.db' }, async () => {
  const ficha = await getFichaCliente('CLI000001');

  assert.ok(ficha.perfil, 'dataset_clientes tiene 100K filas: CLI000001 debe estar');
  assert.equal(ficha.perfil.cliente_id, 'CLI000001');
  assert.ok(ficha.perfil.tipo_cliente, 'el perfil debe traer sus campos, no un objeto vacío');
});

test('trae el historial de campañas de un cliente real', { skip: !HAY_APP_DB && 'falta data/app.db' }, async () => {
  const ficha = await getFichaCliente('CLI000001');

  assert.ok(ficha.campanias.length > 0, 'historial_campanias tiene 300K filas: CLI000001 debe tener alguna');
  assert.equal(ficha.campanias[0].cliente_id, 'CLI000001');
  assert.ok(ficha.campanias[0].oferta_id);
});

test('trae el cliente y sus recibos por DNI', { skip: !HAY_APP_DB && 'falta data/app.db' }, async () => {
  // La consulta anterior pedía `clientes.cliente_id`, columna que no existe:
  // reventaba siempre y el catch mudo lo convertía en null.
  const ficha = await getFichaCliente('10293847');

  assert.ok(ficha.cliente, 'el DNI sembrado debe existir en la tabla clientes');
  assert.equal(ficha.cliente.dni, '10293847');
  assert.ok(ficha.cliente.nombre);

  assert.ok(ficha.recibos.length > 0, 'ese DNI debe tener recibos anteriores');
  assert.equal(ficha.recibos[0].dni, '10293847');
});

test('un cliente inexistente devuelve nulos, no datos de otro', { skip: !HAY_APP_DB && 'falta data/app.db' }, async () => {
  const ficha = await getFichaCliente('CLI_QUE_NO_EXISTE');

  assert.equal(ficha.cliente, null);
  assert.equal(ficha.perfil, null);
  assert.deepEqual(ficha.recibos, []);
  assert.deepEqual(ficha.campanias, []);
});

test('el diccionario se lee de su propia base', { skip: !HAY_DICCIONARIO && 'falta Diccionario_de_datos.db' }, async () => {
  const diccionario = await getDiccionario();

  assert.equal(diccionario.planta.length, 16);
  assert.equal(diccionario.facturacion.length, 34);
  assert.equal(diccionario.catalogo.length, 6);
});
