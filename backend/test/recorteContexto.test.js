/**
 * Truncado del contexto que va al prompt.
 *
 * `slice(0, 1500)` cortaba en cualquier carácter, así que podía dejar dentro
 * del prompt un "S/ 129" que en realidad era "S/ 129.90". El modelo lee ese
 * resto como un dato bueno: una truncación se convertía en una cifra
 * inventada, que es justo lo que el reto penaliza.
 */

process.env.GROQ_FALLBACK_MODE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const { recortarPorRegistros } = require('../services/ragService');
const { extraerMontos } = require('../services/narradorRecibos');

const CATALOGO = [
  'OF001;Plan Movil Basico 10GB;39.9',
  'OF002;Plan Movil Plus 25GB;59.9',
  'OF004;Plan Movil Ilimitado;99.9',
  'OF005;Internet Hogar 100Mb;89.9',
  'OF006;Internet Hogar 200Mb;109.9',
  'OF008;Internet + Fijo Hogar;119.9',
  'OF010;Internet + TV Hogar;129.9'
].join('\n');

test('no recorta cuando el texto ya cabe', () => {
  assert.equal(recortarPorRegistros('corto', 100), 'corto');
  assert.equal(recortarPorRegistros(CATALOGO, 10000), CATALOGO);
});

test('corta en el límite de línea, nunca a mitad de registro', () => {
  const recortado = recortarPorRegistros(CATALOGO, 120);
  const lineas = recortado.split('\n').filter((l) => !l.startsWith('('));

  for (const linea of lineas) {
    assert.ok(
      CATALOGO.split('\n').includes(linea),
      `"${linea}" no es un registro completo del original`
    );
  }
});

test('NO deja ningún monto partido dentro del contexto', () => {
  const montosOriginales = new Set(extraerMontos(CATALOGO.replace(/;(\d)/g, ';S/ $1')));

  // Se prueba en cada longitud posible: alguna cae justo dentro de un número.
  for (let limite = 20; limite < CATALOGO.length; limite += 1) {
    const recortado = recortarPorRegistros(CATALOGO, limite);
    const montos = extraerMontos(recortado.replace(/;(\d)/g, ';S/ $1'));

    for (const monto of montos) {
      assert.ok(
        montosOriginales.has(monto),
        `con límite ${limite} apareció S/ ${monto}, que no existe en el catálogo`
      );
    }
  }
});

test('con slice el monto SÍ se parte: por eso existe esta función', () => {
  // Documenta el bug original. "109.9" cortado en "109." o "109" pasaría al
  // prompt como un precio distinto del real.
  const cortadoAPelo = CATALOGO.slice(0, 155);

  assert.ok(
    !CATALOGO.split('\n').includes(cortadoAPelo.split('\n').pop()),
    'el slice debería dejar una última línea incompleta'
  );
});

test('avisa cuántos registros se omitieron', () => {
  const recortado = recortarPorRegistros(CATALOGO, 120);

  assert.match(recortado, /se omitieron \d+ registros más por espacio/);
});

test('si no cabe ni un registro entero, no manda un trozo suelto', () => {
  const recortado = recortarPorRegistros(CATALOGO, 5);

  assert.match(recortado, /contexto omitido/);
  assert.deepEqual(extraerMontos(recortado), []);
});

test('tolera texto vacío o nulo', () => {
  assert.equal(recortarPorRegistros('', 100), '');
  assert.equal(recortarPorRegistros(null, 100), '');
  assert.equal(recortarPorRegistros(undefined, 100), '');
});
