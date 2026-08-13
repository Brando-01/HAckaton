/**
 * Detección de consultas que exponen datos personales de facturación.
 *
 * Es el portero del principio Zero Trust del reto: si el mensaje pide algo
 * propio del cliente y la conversación no tiene una identidad autenticada
 * detrás, se corta antes de tocar la data.
 *
 * Antes esto era un regex de cuatro palabras (`deuda|debo pagar|mi recibo|
 * recibo`) que no cubría las formas en que la gente pregunta de verdad:
 * "¿cuánto me toca este mes?", "¿por qué me cobraron más?", "¿cuándo vence?".
 *
 * Criterio para agregar un patrón: la respuesta correcta a esa pregunta
 * necesita mirar los datos de UNA persona. Si se puede responder con el
 * catálogo público, no va acá.
 */

/** Quita tildes y baja a minúsculas para que "cuánto" y "cuanto" empaten. */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const PATRONES_SENSIBLES = [
  // Deuda y estado de cuenta
  /\bdeuda\b/,
  /\b(debo|adeudo)\b/,
  /\bestoy al dia\b/,
  /\bme (van a |vas a )?cortar\b/,
  /\bcorte del servicio\b/,

  // El recibo del cliente (posesivo o referido a un periodo suyo)
  /\bmi (recibo|factura|boleta|cuenta|plan|linea|saldo|consumo|tarifa)\b/,
  /\b(el|este|ese|mi) (recibo|factura|boleta) (de|del)\b/,
  /\b(ultimo|anterior|pasado) recibo\b/,
  /\brecibo (anterior|pasado|del mes)\b/,

  // Cuánto se paga / se cobró
  /\bcuanto (debo|pago|pague|me toca|me sale|salio|sale|me cobraron|me llego|me cobran)\b/,
  /\bcuanto (es|fue) (mi|el) (recibo|pago|monto|total)\b/,
  /\bme cobraron\b/,
  /\bme cobraron de mas\b/,
  /\bque me estan cobrando\b/,

  // Variación del monto: el corazón del Desafío 1
  /\bpor que (subio|aumento|bajo|cambio|vino|salio|me cobran|me cobraron|pago)\b/,
  /\b(subio|aumento|bajo) (mi|el) (recibo|monto|pago|factura)\b/,
  /\bvino mas (caro|alto)\b/,
  /\bno me cuadra\b/,
  /\besta mal (mi|el) (recibo|cobro|monto)\b/,

  // Vencimiento y pago
  /\b(cuando|que dia) (vence|se vence|debo pagar|tengo que pagar)\b/,
  /\bfecha (de|del) (vencimiento|pago)\b/,
  /\bvencimiento\b/,

  // Datos del servicio contratado
  /\bmis (datos|recibos|facturas|pagos|cargos|consumos)\b/,
  /\bque plan tengo\b/,
  /\bmi historial\b/
];

/**
 * `true` si responder la consulta requiere mirar datos de una persona.
 *
 * Preguntas de catálogo ("¿qué planes de fibra tienen?") devuelven `false`:
 * se responden con información pública y bloquearlas sería hostil.
 *
 * @param {string} mensaje
 * @returns {boolean}
 */
function esConsultaSensible(mensaje) {
  const texto = normalizar(mensaje);

  if (!texto.trim()) {
    return false;
  }

  return PATRONES_SENSIBLES.some((patron) => patron.test(texto));
}

module.exports = {
  esConsultaSensible,
  normalizar
};
