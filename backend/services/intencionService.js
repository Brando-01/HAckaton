/**
 * Clasificador de intención determinista.
 *
 * Determinista por las mismas razones que `motorDiff`: la decisión "esto
 * requiere identidad verificada" no puede depender de un modelo probabilístico,
 * tiene que quedar auditable en los logs, y no vale gastar cuota de LLM para
 * clasificar un "gracias".
 *
 * Antes no existía esta capa: todo mensaje entraba al mismo pipeline y la única
 * variable que decidía la respuesta era *si había datos disponibles*, no *qué
 * preguntó el cliente*. Por eso un "hola" devolvía el recibo completo.
 */

/** Intenciones que el sistema sabe distinguir. */
const INTENCIONES = {
  SALUDO: 'SALUDO',
  DESPEDIDA: 'DESPEDIDA',
  AGRADECIMIENTO: 'AGRADECIMIENTO',
  CONFIRMACION: 'CONFIRMACION',
  NEGACION: 'NEGACION',
  CONSULTA_MONTO: 'CONSULTA_MONTO',
  CONSULTA_VARIACION: 'CONSULTA_VARIACION',
  CONSULTA_DETALLE: 'CONSULTA_DETALLE',
  CONSULTA_VENCIMIENTO: 'CONSULTA_VENCIMIENTO',
  CONSULTA_HISTORIAL: 'CONSULTA_HISTORIAL',
  CONSULTA_CONCEPTO: 'CONSULTA_CONCEPTO',
  DISPUTA_COBRO: 'DISPUTA_COBRO',
  NO_ENTIENDE: 'NO_ENTIENDE',
  SOLICITUD_ASESOR: 'SOLICITUD_ASESOR',
  CATALOGO_PLANES: 'CATALOGO_PLANES',
  SOPORTE_TECNICO: 'SOPORTE_TECNICO',
  FUERA_DE_ALCANCE: 'FUERA_DE_ALCANCE',
  DESCONOCIDA: 'DESCONOCIDA'
};

/**
 * Intenciones cuya respuesta correcta exige mirar los datos de UNA persona.
 * Si se puede responder con información pública, no va acá.
 */
const REQUIEREN_IDENTIDAD = new Set([
  INTENCIONES.CONSULTA_MONTO,
  INTENCIONES.CONSULTA_VARIACION,
  INTENCIONES.CONSULTA_DETALLE,
  INTENCIONES.CONSULTA_VENCIMIENTO,
  INTENCIONES.CONSULTA_HISTORIAL,
  INTENCIONES.DISPUTA_COBRO
]);

/**
 * Intenciones que el motor determinista puede responder solo, sin LLM.
 * Las demás necesitan redacción libre y se delegan a `ragService`.
 */
const RESUELVE_MOTOR = new Set([
  INTENCIONES.SALUDO,
  INTENCIONES.DESPEDIDA,
  INTENCIONES.AGRADECIMIENTO,
  INTENCIONES.CONFIRMACION,
  INTENCIONES.NEGACION,
  INTENCIONES.CONSULTA_MONTO,
  INTENCIONES.CONSULTA_VARIACION,
  INTENCIONES.CONSULTA_DETALLE,
  INTENCIONES.CONSULTA_VENCIMIENTO,
  INTENCIONES.CONSULTA_HISTORIAL,
  INTENCIONES.DISPUTA_COBRO,
  INTENCIONES.NO_ENTIENDE,
  INTENCIONES.SOLICITUD_ASESOR
]);

const MESES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12'
};

const NUMEROS_EN_LETRA = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
  cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10
};

/** Quita tildes, signos y mayúsculas: "¿Cuánto?" y "cuanto" tienen que empatar. */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:()"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vocabulario de saludo.
 *
 * Ojo con `buenas`: es parte del saludo, no una muletilla. Meterla en la lista
 * de relleno hace que "buenas tardes" caiga en DESCONOCIDA.
 */
const TOKENS_SALUDO_FUERTE = new Set([
  'hola', 'holi', 'ola', 'buenas', 'buenos', 'buen', 'hey', 'alo', 'aloh',
  'saludos', 'hi', 'hello', 'kiubo'
]);

const TOKENS_SALUDO_ACOMPANANTE = new Set([
  'dias', 'dia', 'tardes', 'tarde', 'noches', 'noche', 'que', 'tal', 'como',
  'estas', 'esta', 'va', 'todo', 'bien', 'ahi', 'y', 'muy', 'senor', 'senora',
  'lucia', 'asistente', 'bot', 'movistar', 'amigo', 'amiga', 'chatbot'
]);

/** Un mensaje es saludo puro solo si TODO él es saludo. */
function esSaludoPuro(texto) {
  const tokens = texto.split(' ').filter(Boolean);

  if (tokens.length === 0 || tokens.length > 5) {
    return false;
  }

  const tieneSaludoFuerte = tokens.some((token) => TOKENS_SALUDO_FUERTE.has(token));
  if (!tieneSaludoFuerte) {
    return false;
  }

  return tokens.every(
    (token) => TOKENS_SALUDO_FUERTE.has(token) || TOKENS_SALUDO_ACOMPANANTE.has(token)
  );
}

/** Sustantivos que anclan la conversación a la facturación del cliente. */
const SUSTANTIVO_RECIBO = /\b(recibo|factura|boleta|cobro|cobros|monto|pago|deuda|saldo|cuenta|tarifa|cargo|cargos|consumo|facturacion)\b/;

const REGLAS = [
  {
    intencion: INTENCIONES.SOLICITUD_ASESOR,
    patrones: [
      /\basesor\b/, /\bhumano\b/, /\bpersona real\b/, /\batencion humana\b/,
      /\bhablar con (alguien|una persona|un ejecutivo|un representante)\b/,
      /\bpasame con\b/, /\bejecutivo\b/, /\brepresentante\b/,
      /\bagente (humano|real)\b/, /\bno estoy de acuerdo\b/,
      /\bno resolvio mi (problema|duda)\b/, /\besto no me ayudo\b/
    ]
  },
  {
    intencion: INTENCIONES.NO_ENTIENDE,
    // Solo si el mensaje NO nombra el objeto de la consulta: "no entiendo mi
    // recibo" es una petición de explicación del recibo, no una queja de que la
    // respuesta anterior fue confusa.
    excluirSi: SUSTANTIVO_RECIBO,
    patrones: [
      /\bno (entiendo|entendi|comprendo|comprendi)\b/,
      /\bsigo sin entender\b/, /\bno me queda claro\b/, /\bno quedo claro\b/,
      /\bexplicame(lo)?\b/, /\bmas (facil|simple|sencillo|claro)\b/,
      /\bpuedes explicar\b/, /\bno capto\b/, /\ben cristiano\b/,
      /\bno te entiendo\b/, /\bcomo asi\b/
    ]
  },
  {
    intencion: INTENCIONES.DISPUTA_COBRO,
    patrones: [
      /\bno me cuadra\b/, /\besta mal\b/, /\bme cobraron de mas\b/,
      /\bme estan cobrando de mas\b/, /\bcobro indebido\b/, /\bno reconozco\b/,
      /\bno deberia pagar\b/, /\bes un error\b/, /\bhay un error\b/,
      /\breclamo\b/, /\breclamar\b/, /\bme estan estafando\b/,
      /\bno corresponde\b/, /\bnunca (contrate|pedi)\b/, /\bno pedi\b/
    ]
  },
  {
    intencion: INTENCIONES.CONSULTA_VENCIMIENTO,
    patrones: [
      /\b(cuando|que dia|hasta cuando) (vence|se vence|debo pagar|tengo que pagar|puedo pagar)\b/,
      /\bfecha (de|del) (vencimiento|pago)\b/,
      /\bvencimiento\b/, /\bvence mi (recibo|factura)\b/,
      /\bultimo dia para pagar\b/
    ]
  },
  {
    intencion: INTENCIONES.CONSULTA_VARIACION,
    patrones: [
      /\bpor que (subio|aumento|bajo|cambio|vino|salio|me cobran|me cobraron|pago|es mas|esta mas)\b/,
      // "por que me estan cobrando mas": el `mas` señala comparación, así que
      // es variación y no desglose. Sin esto caía en CONSULTA_DETALLE por el
      // patrón /\bque me estan cobrando\b/ y devolvía la lista de cargos.
      /\bpor que .{0,15}(cobrando|cobran|cobraron|pagando|pago) (mas|menos)\b/,
      /\b(subio|aumento|bajo|disminuyo|cambio) (mi|el) (recibo|monto|pago|factura|cobro)\b/,
      /\bvino mas (caro|alto|barato)\b/, /\bmas caro\b/,
      /\b(por que|porque) (mi|el) (recibo|factura|monto)\b/,
      /\bvariacion\b/, /\bdiferencia (con|del|de) (el|mi)? ?(mes|recibo)\b/,
      /\bque paso con mi (recibo|factura)\b/,
      /\bpor que pago (mas|menos)\b/,
      /\bcambio mi (recibo|factura|monto)\b/
    ]
  },
  {
    intencion: INTENCIONES.CONSULTA_MONTO,
    patrones: [
      /\bcuanto (debo|pago|tengo que pagar|me toca|me sale|salio|sale|me cobraron|me llego|me cobran|es)\b/,
      /\bcuanto (fue|era) (mi|el)\b/,
      /\bmonto (de mi|del) (recibo|factura)\b/,
      /\btotal a pagar\b/, /\bmi deuda\b/, /\btengo deuda\b/,
      /\bestoy al dia\b/, /\bdebo algo\b/, /\bcuanto sale\b/
    ]
  },
  {
    intencion: INTENCIONES.CONSULTA_HISTORIAL,
    patrones: [
      /\bhistorial\b/, /\bultimos recibos\b/, /\brecibos anteriores\b/,
      /\bmeses anteriores\b/, /\bcomo venia pagando\b/,
      /\bevolucion\b/, /\bultimos meses\b/, /\bmis recibos\b/
    ]
  },
  {
    intencion: INTENCIONES.CONSULTA_DETALLE,
    patrones: [
      /\bdetalle\b/, /\bdesglose\b/, /\bque incluye\b/, /\bde que se compone\b/,
      /\bconceptos\b/, /\bque cargos\b/, /\bque me estan cobrando\b/,
      /\bque me cobraron\b/, /\bque plan tengo\b/, /\bmi plan\b/,
      /\bque tengo contratado\b/, /\bque servicios tengo\b/,
      /\bno entiendo mi (recibo|factura)\b/, /\bexplicame mi (recibo|factura)\b/
    ]
  },
  {
    intencion: INTENCIONES.CONSULTA_CONCEPTO,
    // Glosario: se responde con información pública, sin tocar datos personales.
    patrones: [
      /\bque (es|son|significa|significan|quiere decir) (un|una|el|la|los|las)?\s*(prorrateo|igv|reconexion|renta|ciclo|nota de credito|cuota|financiamiento|cargo fijo|cargo recurrente|paquete|roaming|descuento)\b/,
      /\bque significa\b/, /\bque es eso de\b/, /\bcomo funciona (el|la) (prorrateo|facturacion|ciclo)\b/
    ]
  },
  {
    intencion: INTENCIONES.CATALOGO_PLANES,
    patrones: [
      /\bfibra optica\b/, /\bplanes? de (fibra|internet|movil)\b/,
      /\bque planes (tienen|hay|ofrecen)\b/, /\binternet hogar\b/,
      /\bofertas\b/, /\bpromociones\b/, /\bquiero contratar\b/,
      /\bmigrar de plan\b/, /\bcambiar de plan\b/, /\bcatalogo\b/,
      /\bplanes disponibles\b/, /\bmovistar total\b/
    ]
  },
  {
    intencion: INTENCIONES.SOPORTE_TECNICO,
    patrones: [
      /\binternet (lento|no funciona|no anda|se cae)\b/,
      /\bsin (senal|servicio|internet|cobertura)\b/,
      /\bvelocidad\b/, /\brouter\b/, /\bmodem\b/, /\bno tengo internet\b/,
      /\bno me funciona\b/, /\baveria\b/, /\bfalla\b/, /\bse corta\b/,
      /\bno navega\b/, /\bsoporte tecnico\b/
    ]
  },
  {
    intencion: INTENCIONES.FUERA_DE_ALCANCE,
    patrones: [
      /\bclima\b/, /\bfutbol\b/, /\breceta\b/, /\bchiste\b/, /\bpoema\b/,
      /\bquien gano\b/, /\bpresidente\b/, /\bcuentame algo\b/
    ]
  },
  {
    intencion: INTENCIONES.AGRADECIMIENTO,
    patrones: [/\bgracias\b/, /\bte pasaste\b/, /\bmuy amable\b/, /\bagradecido\b/]
  },
  {
    intencion: INTENCIONES.DESPEDIDA,
    patrones: [
      /\badios\b/, /\bchau\b/, /\bhasta luego\b/, /\bnos vemos\b/, /\bbye\b/,
      /\beso es todo\b/, /\bya esta todo\b/, /\bnada mas\b/
    ]
  }
];

const PATRON_CONFIRMACION = /^(si+|sip|claro|dale|ok|okay|oka|de acuerdo|por favor|si por favor|ya|correcto|asi es|obvio|bueno|listo|hagalo|hazlo|acepto|conforme)( .{0,20})?$/;
const PATRON_NEGACION = /^(no+|nop|nel|no gracias|para nada|negativo|mejor no|asi esta bien|no por ahora)( .{0,20})?$/;

/** El cliente da por resuelta la explicación: resetea contadores aguas arriba. */
const PATRON_COMPRENDIO = /\b(ahora si (entendi|entiendo)|ya entendi|entendido|clarisimo|ahora si me quedo claro|perfecto ya entendi)\b/;

/** Extrae mes nombrado y referencias relativas, para `resolverCicloPedido`. */
function extraerSlots(texto) {
  const slots = {};

  const mesNombrado = Object.keys(MESES).find((mes) => texto.includes(mes));
  if (mesNombrado) {
    slots.mes = mesNombrado;
    slots.numeroMes = MESES[mesNombrado];
  }

  const conDigito = texto.match(/hace (\d+) mes/);
  if (conDigito) {
    slots.mesesAtras = Number(conDigito[1]);
  } else {
    const conLetra = texto.match(/hace ([a-z]+) mes/);
    if (conLetra && NUMEROS_EN_LETRA[conLetra[1]]) {
      slots.mesesAtras = NUMEROS_EN_LETRA[conLetra[1]];
    } else if (/\b(mes|recibo|factura)( |el )?(pasado|anterior)\b/.test(texto)
      || /\bel (pasado|anterior)\b/.test(texto)
      || /\bmes pasado\b/.test(texto)) {
      slots.mesesAtras = 1;
    } else if (/\bantepasado\b/.test(texto)) {
      slots.mesesAtras = 2;
    }
  }

  return slots;
}

/**
 * Seguimiento elíptico: "¿y el mes pasado?", "¿y por qué?", "¿el anterior?".
 *
 * Sin esto el cliente tiene que repetir la pregunta completa, que es
 * exactamente el contacto repetido que el reto penaliza.
 */
function esSeguimientoEliptico(texto, slots) {
  // Si el mensaje nombra un periodo, es un seguimiento sin importar lo largo
  // que sea. "me refiero al del mes pasado, el de junio" son 8 tokens y antes
  // se descartaba por el límite: caía en DESCONOCIDA y el chat volvía a
  // volcarle el recibo entero.
  if (slots.mes || slots.mesesAtras) {
    return true;
  }

  const tokens = texto.split(' ').filter(Boolean);

  if (tokens.length > 6) {
    return false;
  }

  // Aclaraciones cortas que solo tienen sentido sobre lo ya dicho.
  return /^y\b/.test(texto)
    || /\b(me refiero|hablo de|digo el|el otro|ese mismo)\b/.test(texto);
}

function aplicarRegla(regla, texto) {
  if (regla.excluirSi && regla.excluirSi.test(texto)) {
    return false;
  }
  return regla.patrones.some((patron) => patron.test(texto));
}

/**
 * Clasifica el mensaje del cliente.
 *
 * @param {string} mensaje Texto crudo.
 * @param {object} [opciones]
 * @param {string} [opciones.intencionAnterior] Intención del turno previo, para
 *   resolver seguimientos elípticos.
 * @returns {{intencion: string, confianza: number, requiereIdentidad: boolean,
 *   resuelveMotor: boolean, esSeguimiento: boolean, slots: object,
 *   textoNormalizado: string, comprendio: boolean}}
 */
function clasificarIntencion(mensaje, opciones = {}) {
  const texto = normalizar(mensaje);
  const slots = extraerSlots(texto);
  const intencionAnterior = opciones.intencionAnterior || null;

  const base = {
    slots,
    textoNormalizado: texto,
    esSeguimiento: false,
    comprendio: PATRON_COMPRENDIO.test(texto)
  };

  if (!texto) {
    return decorar({ ...base, intencion: INTENCIONES.DESCONOCIDA, confianza: 0 }, intencionAnterior);
  }

  for (const regla of REGLAS) {
    if (aplicarRegla(regla, texto)) {
      return decorar({ ...base, intencion: regla.intencion, confianza: 0.9 }, intencionAnterior);
    }
  }

  if (PATRON_CONFIRMACION.test(texto)) {
    return decorar({ ...base, intencion: INTENCIONES.CONFIRMACION, confianza: 0.85 }, intencionAnterior);
  }

  if (PATRON_NEGACION.test(texto)) {
    return decorar({ ...base, intencion: INTENCIONES.NEGACION, confianza: 0.85 }, intencionAnterior);
  }

  // El saludo puro va al final: solo gana si no quedó nada más por interpretar.
  if (esSaludoPuro(texto)) {
    return decorar({ ...base, intencion: INTENCIONES.SALUDO, confianza: 0.95 }, intencionAnterior);
  }

  if (intencionAnterior && esSeguimientoEliptico(texto, slots)) {
    return decorar(
      { ...base, intencion: intencionAnterior, confianza: 0.6, esSeguimiento: true },
      intencionAnterior
    );
  }

  return decorar({ ...base, intencion: INTENCIONES.DESCONOCIDA, confianza: 0.2 }, intencionAnterior);
}

/**
 * Completa `requiereIdentidad` y `resuelveMotor` sobre la intención YA resuelta.
 *
 * Se calcula acá, y no sobre el texto crudo, para que un seguimiento herede la
 * sensibilidad del hilo aunque su propio texto no traiga ninguna palabra
 * sensible ("¿y el mes pasado?" después de "¿cuánto debo?").
 */
function decorar(clasificacion, intencionAnterior) {
  let requiereIdentidad = REQUIEREN_IDENTIDAD.has(clasificacion.intencion);

  // "No entendí" hereda la sensibilidad del tema que se estaba explicando.
  if (clasificacion.intencion === INTENCIONES.NO_ENTIENDE
    && intencionAnterior
    && REQUIEREN_IDENTIDAD.has(intencionAnterior)) {
    requiereIdentidad = true;
  }

  return {
    ...clasificacion,
    requiereIdentidad,
    resuelveMotor: RESUELVE_MOTOR.has(clasificacion.intencion)
  };
}

module.exports = {
  clasificarIntencion,
  normalizar,
  INTENCIONES,
  REQUIEREN_IDENTIDAD,
  RESUELVE_MOTOR
};
