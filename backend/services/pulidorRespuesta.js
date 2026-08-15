/**
 * Pulido de redacción: el LLM reescribe, no inventa.
 *
 * El motor determinista ya produjo una respuesta correcta pero algo rígida.
 * En vez de dejar que el modelo redacte desde cero (donde puede inventar) o
 * de quedarnos con la plantilla (que suena a plantilla), se le pide que
 * REESCRIBA el texto ya hecho.
 *
 * La verificación es más dura que la del blindaje general, y esa es la idea:
 *
 *   - blindarConFuentes acepta cualquier monto que exista en el bloque. Eso
 *     deja pasar la atribución equivocada: decir "en mayo pagaste S/ 42.95"
 *     cuando esos 42.95 eran de junio pasa el filtro, porque la cifra existe.
 *
 *   - acá se exige que el texto reescrito tenga EXACTAMENTE los mismos
 *     montos que el original, con las mismas repeticiones, y que no aparezca
 *     ningún mes que el original no nombrara. El modelo no puede sustituir
 *     una cifra por otra igualmente real, que era el hueco.
 *
 * Si algo no cuadra, se devuelve el texto determinista sin tocar. El pulido
 * es una mejora oportunista: nunca un riesgo.
 */

const { extraerMontos } = require('./narradorRecibos');

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/** Multiconjunto de montos, para comparar incluyendo repeticiones. */
function firmaDeMontos(texto) {
  return extraerMontos(texto).sort((a, b) => a - b).join('|');
}

/** Meses nombrados en el texto, sin repetir. */
function mesesDe(texto) {
  const minusculas = String(texto || '').toLowerCase();
  return MESES.filter((mes) => minusculas.includes(mes)).sort().join('|');
}

/**
 * Comprueba que la reescritura conserve los hechos.
 *
 * @returns {{valido: boolean, motivo?: string}}
 */
function conservaLosHechos(original, reescrito) {
  if (!reescrito || reescrito.trim().length === 0) {
    return { valido: false, motivo: 'respuesta vacía' };
  }

  if (firmaDeMontos(original) !== firmaDeMontos(reescrito)) {
    return { valido: false, motivo: 'cambiaron los montos' };
  }

  if (mesesDe(original) !== mesesDe(reescrito)) {
    return { valido: false, motivo: 'cambiaron los meses' };
  }

  // Una reescritura que triplica el largo dejó de ser una reescritura: el
  // modelo se puso a agregar cosas.
  if (reescrito.length > original.length * 2.2 + 120) {
    return { valido: false, motivo: 'se alargó demasiado' };
  }

  return { valido: true };
}

const INSTRUCCIONES = `Eres el asistente de Movistar Perú. Vas a REESCRIBIR un mensaje ya redactado
para que suene natural y cercano, como hablaría una persona de atención al
cliente en Perú.

REGLAS ABSOLUTAS:
- NO cambies ninguna cifra. Ni una. Ni el formato "S/ 00.00".
- NO cambies a qué mes pertenece cada cifra.
- NO agregues datos, cifras, fechas ni promesas que no estén en el texto.
- NO quites información: si el texto dice tres cosas, tu versión dice tres.
- NO menciones que estás reescribiendo nada.

CUIDADO CON EL SENTIDO, no solo con los números:
- "son S/ 40 más" significa que AUMENTÓ EN 40, no que llegó a 40. No lo
  conviertas en "subió a S/ 40".
- Si el texto ofrece algo ("puedo revisar si..."), sigue siendo un
  ofrecimiento al cliente. No lo vuelvas una frase sobre ti mismo
  ("quiero saber si..."), ni una promesa de que ya lo hiciste.
- Si el texto dice que algo está pagado o pendiente, tu versión dice lo
  mismo. Nunca lo inviertas.

ESTILO:
- Tutea, cercano pero profesional. Nada de "estimado cliente".
- Frases cortas. Como se habla, no como se redacta un oficio.
- Sin emojis, sin exclamaciones de más, sin "¡Claro que sí!".
- Mismo largo o más corto que el original.

Devuelve SOLO el mensaje reescrito, sin comillas ni comentarios.`;

/**
 * Pule la redacción de un texto determinista.
 *
 * @param {string} textoBase Respuesta ya correcta del motor.
 * @param {object} opciones
 * @param {(sistema: string, usuario: string) => Promise<string>} opciones.redactar
 *   Llama al modelo. Se inyecta para poder testear sin red.
 * @param {object} [opciones.registro] Para dejar constancia de los descartes.
 * @returns {Promise<{texto: string, pulido: boolean, motivo?: string}>}
 */
async function pulirRedaccion(textoBase, opciones = {}) {
  const { redactar } = opciones;

  if (typeof redactar !== 'function' || !textoBase) {
    return { texto: textoBase, pulido: false, motivo: 'sin redactor' };
  }

  let reescrito;
  try {
    reescrito = await redactar(INSTRUCCIONES, textoBase);
  } catch (error) {
    // Que el modelo falle no puede romper la respuesta: ya la teníamos.
    console.warn('[PULIDO] el modelo falló, se usa el texto determinista:', error.message);
    return { texto: textoBase, pulido: false, motivo: 'error del modelo' };
  }

  const limpio = String(reescrito || '').trim().replace(/^["'`]|["'`]$/g, '');
  const verificacion = conservaLosHechos(textoBase, limpio);

  if (!verificacion.valido) {
    console.warn('[PULIDO] descartado (%s). Se usa el texto determinista.', verificacion.motivo);
    return { texto: textoBase, pulido: false, motivo: verificacion.motivo };
  }

  return { texto: limpio, pulido: true };
}

module.exports = {
  pulirRedaccion,
  conservaLosHechos,
  firmaDeMontos,
  mesesDe,
  INSTRUCCIONES
};
