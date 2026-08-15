/**
 * Pulido de redacción.
 *
 * El valor de este módulo no está en lo que deja pasar, sino en lo que
 * rechaza: el modelo reescribe, y si al reescribir toca una cifra o un mes,
 * su versión se tira a la basura y sale el texto determinista.
 *
 * Es más estricto que `blindarConFuentes` a propósito. Aquel acepta cualquier
 * monto que exista en el bloque, y por eso deja pasar la atribución
 * equivocada ("en mayo pagaste S/ 42.95" cuando eran de junio). Acá se exige
 * que los montos sean EXACTAMENTE los mismos, con sus repeticiones.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pulirRedaccion,
  conservaLosHechos,
  firmaDeMontos,
  mesesDe
} = require('../services/pulidorRespuesta');

const BASE = 'El de julio subió S/ 42.95: pasaste de S/ 42.95 en junio a S/ 85.90.';

/** Redactor falso: devuelve lo que se le indique, sin tocar la red. */
function redactorQueDevuelve(texto) {
  return async () => texto;
}

test('firmaDeMontos cuenta las repeticiones, no solo los valores', () => {
  assert.equal(firmaDeMontos('S/ 10.00 y S/ 10.00'), '10|10');
  assert.notEqual(firmaDeMontos('S/ 10.00 y S/ 10.00'), firmaDeMontos('S/ 10.00'));
  assert.equal(firmaDeMontos('S/ 20.00 y S/ 10.00'), firmaDeMontos('S/ 10.00 y S/ 20.00'));
});

test('mesesDe detecta los meses nombrados', () => {
  assert.equal(mesesDe('de junio a julio'), 'julio|junio');
  assert.equal(mesesDe('sin meses acá'), '');
});

test('acepta una reescritura que solo cambia la forma', () => {
  const natural = 'Este mes de julio te subió S/ 42.95: en junio pagabas S/ 42.95 y ahora son S/ 85.90.';

  assert.equal(conservaLosHechos(BASE, natural).valido, true);
});

test('RECHAZA si cambia un monto', () => {
  const conCifraMovida = 'El de julio subió S/ 43.00: pasaste de S/ 42.95 en junio a S/ 85.90.';

  const resultado = conservaLosHechos(BASE, conCifraMovida);
  assert.equal(resultado.valido, false);
  assert.equal(resultado.motivo, 'cambiaron los montos');
});

test('RECHAZA si agrega un monto que no estaba', () => {
  const conExtra = `${BASE} Eso equivale a S/ 1.43 por día.`;

  assert.equal(conservaLosHechos(BASE, conExtra).valido, false);
});

test('RECHAZA si omite un monto', () => {
  const incompleto = 'El de julio subió S/ 42.95 respecto a junio.';

  assert.equal(conservaLosHechos(BASE, incompleto).valido, false);
});

test('RECHAZA si cambia el mes al que pertenece una cifra', () => {
  // Este es el hueco que blindarConFuentes no ve: la cifra existe, pero
  // colgada del mes equivocado.
  const mesCambiado = 'El de julio subió S/ 42.95: pasaste de S/ 42.95 en mayo a S/ 85.90.';

  const resultado = conservaLosHechos(BASE, mesCambiado);
  assert.equal(resultado.valido, false);
  assert.equal(resultado.motivo, 'cambiaron los meses');
});

test('RECHAZA una reescritura que se va de largo', () => {
  const inflado = `${BASE} ${'Y además te cuento que el servicio incluye muchas cosas más. '.repeat(6)}`;

  assert.equal(conservaLosHechos(BASE, inflado).valido, false);
});

test('RECHAZA una respuesta vacía', () => {
  assert.equal(conservaLosHechos(BASE, '').valido, false);
  assert.equal(conservaLosHechos(BASE, '   ').valido, false);
});

test('pulirRedaccion devuelve el texto pulido cuando conserva los hechos', async () => {
  const natural = 'Mira, el de julio te subió S/ 42.95: en junio eran S/ 42.95 y este salió S/ 85.90.';

  const resultado = await pulirRedaccion(BASE, { redactar: redactorQueDevuelve(natural) });

  assert.equal(resultado.pulido, true);
  assert.equal(resultado.texto, natural);
});

test('pulirRedaccion cae al determinista si el modelo altera una cifra', async () => {
  const alterado = 'El de julio subió S/ 99.99: pasaste de S/ 42.95 en junio a S/ 85.90.';

  const resultado = await pulirRedaccion(BASE, { redactar: redactorQueDevuelve(alterado) });

  assert.equal(resultado.pulido, false);
  assert.equal(resultado.texto, BASE, 'debe salir el texto original intacto');
});

test('pulirRedaccion sobrevive a un fallo del modelo', async () => {
  const resultado = await pulirRedaccion(BASE, {
    redactar: async () => { throw new Error('429 rate limit'); }
  });

  assert.equal(resultado.pulido, false);
  assert.equal(resultado.texto, BASE);
  assert.equal(resultado.motivo, 'error del modelo');
});

test('sin redactor disponible devuelve el texto tal cual', async () => {
  const resultado = await pulirRedaccion(BASE, {});

  assert.equal(resultado.pulido, false);
  assert.equal(resultado.texto, BASE);
});

test('quita las comillas con las que el modelo suele envolver su respuesta', async () => {
  const entrecomillado = `"${BASE}"`;

  const resultado = await pulirRedaccion(BASE, { redactar: redactorQueDevuelve(entrecomillado) });

  assert.equal(resultado.pulido, true);
  assert.equal(resultado.texto, BASE);
});

test('un texto sin cifras también se puede pulir', async () => {
  const original = 'No encuentro recibos asociados a tu cuenta.';
  const natural = 'No veo recibos en tu cuenta.';

  const resultado = await pulirRedaccion(original, { redactar: redactorQueDevuelve(natural) });

  assert.equal(resultado.pulido, true);
  assert.equal(resultado.texto, natural);
});
