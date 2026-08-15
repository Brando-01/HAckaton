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
 * Fechas concretas del texto (D/M/AAAA).
 *
 * Se comprueban aparte de los montos y los meses porque el modelo las
 * eliminaba: ante "¿cuándo vence?" devolvía "ya está pagado" sin ninguna
 * fecha, que es justo lo que el cliente preguntó.
 */
function fechasDe(texto) {
  const encontradas = String(texto || '').match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || [];
  return [...encontradas].sort().join('|');
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

  if (fechasDe(original) !== fechasDe(reescrito)) {
    return { valido: false, motivo: 'cambiaron o se perdieron las fechas' };
  }

  // Una reescritura que triplica el largo dejó de ser una reescritura: el
  // modelo se puso a agregar cosas.
  if (reescrito.length > original.length * 2.2 + 120) {
    return { valido: false, motivo: 'se alargó demasiado' };
  }

  // El gancho final es lo que invita al cliente a seguir preguntando. Si el
  // original cerraba con una pregunta y la reescritura la perdió, la
  // conversación se corta ahí: se descarta.
  if (original.trim().endsWith('?') && !reescrito.trim().endsWith('?')) {
    return { valido: false, motivo: 'perdió la pregunta final' };
  }

  return { valido: true };
}

/**
 * Recorta la coletilla con la que el modelo abre casi todas sus respuestas.
 *
 * Se le pidió variar y no lo hace: arranca con "Mira, te cuento que..." una y
 * otra vez, que cansa igual que la plantilla que veníamos a arreglar. Se
 * quita acá, que es determinista, en vez de seguir insistiendo en el prompt.
 */
function quitarMuletillaInicial(texto) {
  const sinMuletilla = texto
    .replace(/^(mira|oye|ya|bueno)[,:]?\s*(te cuento|te explico|te comento)?\s*(que)?\s*/i, '')
    // "Mira, te cuento que, cuando..." deja una coma huérfana al inicio.
    .replace(/^[,;:.\s]+/, '');

  if (!sinMuletilla || sinMuletilla === texto) {
    return texto;
  }

  // Al cortar el arranque la frase queda en minúscula: se recupera.
  return sinMuletilla.charAt(0).toUpperCase() + sinMuletilla.slice(1);
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

ESTILO — habla como un amigo peruano que trabaja en Movistar y te está
explicando tu recibo en la mesa de un café:
- Tutea siempre. Nada de "estimado cliente" ni "le informamos que".
- Frases cortas, español peruano natural: "mira", "te cuento", "nada que
  ver", "tranquilo", "ojo que", "nomás". Con moderación: UNO por mensaje
  como mucho, y no siempre el mismo. Abrir cada respuesta con "Mira, te
  cuento" cansa igual que una plantilla; muchas veces lo mejor es entrar
  directo al dato.
- NUNCA quites una fecha, una hora ni un plazo. Si el cliente pregunta
  "¿cuándo vence?", la respuesta sin la fecha no sirve de nada.
- Nada de tecnicismos. Si el texto ya tradujo la jerga, no la devuelvas.
- Sin emojis. Sin "¡Claro que sí!". Sin disculpas largas.
- MÁS CORTO que el original, nunca más largo. Si puedes decirlo en dos
  frases en vez de tres, hazlo.
- Si el original termina con una pregunta al cliente, la tuya TAMBIÉN
  termina con una pregunta. Ese cierre es lo que lo invita a seguir
  preguntando: no lo conviertas en una despedida ni lo elimines.

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

  const limpio = quitarMuletillaInicial(
    String(reescrito || '').trim().replace(/^["'`]|["'`]$/g, '')
  );
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
