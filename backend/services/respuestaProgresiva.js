/**
 * Respuestas por capas, según la intención ya clasificada.
 *
 * El problema que resuelve: antes todo mensaje entraba al mismo pipeline y la
 * única variable que decidía la respuesta era *si había datos*, no *qué
 * preguntó el cliente*. Un "hola" devolvía el recibo completo, la comparación,
 * la causa, el estado de deuda, los seis últimos recibos y la antigüedad.
 *
 * Acá cada intención tiene su propia forma de respuesta, y la explicación de
 * una variación sigue tres pasos:
 *
 *     1. QUÉ PASÓ   — el hecho, en una línea
 *     2. POR QUÉ    — la causa, en lenguaje de cliente
 *     3. QUÉ HACER  — la siguiente acción concreta
 *
 * Máximo tres párrafos cortos. El historial, el desglose y la antigüedad van
 * detrás de un chip de seguimiento, nunca en la primera respuesta.
 *
 * Todos los montos salen del bloque de hechos, así que estas respuestas
 * heredan la garantía anti-alucinación sin pasar por el LLM.
 */

const { CAUSAS } = require('./motorDiff');
const { soles, limpiarDescripcion, formatearVencimiento } = require('./narradorRecibos');
const { INTENCIONES } = require('./intencionService');

/**
 * Jerga de facturación traducida a lenguaje de cliente.
 *
 * `ampliada` no repite lo mismo con sinónimos: cambia de registro y explica el
 * mecanismo. Es lo que se usa cuando el cliente dice "no entendí".
 */
const EXPLICACION = {
  [CAUSAS.FIN_DESCUENTO]: {
    corta: 'se terminó un descuento que tenías y volviste a la tarifa normal',
    ampliada: 'Tenías una promoción con fecha de fin. Mientras estuvo activa pagabas menos que la tarifa de tu plan; al vencer, el plan se cobra completo. No es un cargo nuevo: es el mismo plan sin el descuento encima.',
    accion: 'Puedo revisar si hay alguna promoción vigente para tu línea.'
  },
  [CAUSAS.NUEVO_DESCUENTO]: {
    corta: 'se aplicó un descuento a tu recibo',
    ampliada: 'Se activó una promoción sobre tu plan, así que este ciclo pagas menos que la tarifa normal. Suele tener una duración definida.',
    accion: 'Si quieres, te confirmo hasta cuándo aplica.'
  },
  [CAUSAS.PRORRATEO]: {
    corta: 'se cobraron solo los días que usaste el servicio, no el mes completo',
    ampliada: 'Cuando un servicio se activa o cambia a mitad de ciclo, no se cobra el mes entero: se calcula la parte proporcional a los días que estuvo activo. Por eso el monto no coincide con la tarifa redonda de tu plan.',
    accion: 'El próximo ciclo ya se cobra completo y vuelve a ser parejo.'
  },
  [CAUSAS.RECONEXION]: {
    corta: 'se cobró la reconexión del servicio tras una suspensión',
    ampliada: 'Cuando un recibo queda impago el servicio se suspende, y al regularizar el pago se cobra un cargo único por reactivarlo. Es un cargo de una sola vez, no se repite el próximo mes.',
    accion: 'Para que no vuelva a pasar, puedo ayudarte a revisar tu fecha de vencimiento.'
  },
  [CAUSAS.CAMBIO_PLAN]: {
    corta: 'cambiaste de plan y la tarifa se ajustó',
    ampliada: 'Al migrar de plan se deja de cobrar el anterior y empieza a cobrarse el nuevo. Si el cambio ocurrió a mitad de ciclo, puedes ver ambos en el mismo recibo, cada uno por los días que estuvo activo.',
    accion: 'Puedo mostrarte el detalle de los dos planes en este recibo.'
  },
  [CAUSAS.CONSUMO_ADICIONAL]: {
    corta: 'hubo consumo por encima de lo que incluye tu plan',
    ampliada: 'Tu plan incluye una bolsa de datos, minutos o mensajes. Lo que se usa por encima de esa bolsa se factura aparte, según la tarifa de consumo adicional. Por eso este cargo varía cada mes.',
    accion: 'Si se repite, quizá te convenga un plan con más incluido.'
  },
  [CAUSAS.CARGO_TERCEROS]: {
    corta: 'se facturaron servicios de terceros usados desde tu línea',
    ampliada: 'Hay servicios que no son de Movistar pero se cobran en tu recibo: llamadas de larga distancia por otro operador, suscripciones o contenidos. Movistar los factura y luego los transfiere a ese proveedor.',
    accion: 'Si no reconoces el cargo, te derivo con un asesor para revisarlo.'
  },
  [CAUSAS.PAQUETE]: {
    corta: 'se cobraron paquetes que contrataste',
    ampliada: 'Son bolsas adicionales que se compran aparte del plan: gigas extra, minutos o contenidos. Se cobran en el recibo del ciclo en que se contrataron.',
    accion: 'Puedo mostrarte qué paquetes se cobraron este mes.'
  },
  [CAUSAS.NOTA_CREDITO]: {
    corta: 'se aplicó una nota de crédito a tu favor',
    ampliada: 'Una nota de crédito devuelve un monto que se había cobrado de más o que correspondía anular. Se descuenta directamente del recibo, por eso el total baja.',
    accion: 'No tienes que hacer nada: ya está aplicada.'
  },
  [CAUSAS.CUOTA_EQUIPO]: {
    corta: 'se facturó la cuota de tu equipo',
    ampliada: 'Cuando el equipo se compra financiado, su precio se reparte en cuotas mensuales que se cobran junto al plan. Al terminar las cuotas, el recibo baja.',
    accion: 'Puedo decirte cuántas cuotas te quedan.'
  },
  [CAUSAS.AJUSTE_TARIFA]: {
    corta: 'cambió la tarifa de un concepto que ya venías pagando',
    ampliada: 'El mismo concepto se sigue cobrando, pero con un importe distinto al del mes pasado. Suele deberse a un ajuste de tarifa o a un cambio en las condiciones del servicio.',
    accion: 'Puedo mostrarte el detalle línea por línea.'
  }
};

/** Chips de seguimiento. Cada texto tiene que clasificar donde se espera. */
const CHIPS = {
  VARIACION: '¿Por qué cambió mi recibo?',
  DETALLE: 'Ver el detalle de cargos',
  HISTORIAL: 'Ver mis últimos recibos',
  VENCIMIENTO: '¿Cuándo vence?',
  MONTO: '¿Cuánto debo pagar?',
  NO_ENTIENDE: 'No entendí, explícamelo más fácil',
  ASESOR: 'Hablar con un asesor'
};

function hayBloque(bloque) {
  return Boolean(bloque && bloque.encontrado);
}

function explicacionDe(codigoCausa) {
  return EXPLICACION[codigoCausa] || {
    corta: 'hubo un movimiento en tus cargos',
    ampliada: 'El detalle de este cambio está en las líneas de tu recibo.',
    accion: 'Puedo mostrarte el detalle línea por línea.'
  };
}

/** Los datos estructurados para la vista visual. Todo sale del bloque. */
function construirTarjeta(bloque) {
  if (!hayBloque(bloque)) {
    return null;
  }

  return {
    periodo: bloque.reciboActual.periodo,
    total: bloque.reciboActual.total,
    estado: bloque.reciboActual.deuda || null,
    vencimiento: bloque.reciboActual.vencimiento
      ? formatearVencimiento(bloque.reciboActual.vencimiento)
      : null,
    totalAnterior: bloque.reciboAnterior ? bloque.reciboAnterior.total : null,
    variacion: bloque.variacion,
    causas: bloque.causas.map((causa) => ({
      codigo: causa.codigo,
      titulo: causa.titulo,
      impacto: causa.impacto,
      explicacion: explicacionDe(causa.codigo).corta
    })),
    historial: bloque.historial.map((ciclo) => ({
      periodo: ciclo.periodo,
      total: ciclo.total
    }))
  };
}

// ── Respuestas conversacionales (no tocan datos) ────────────────────────

function responderSaludo(contexto) {
  const nombre = contexto.nombreCliente ? ` ${contexto.nombreCliente}` : '';

  const texto = contexto.tieneCliente
    ? `¡Hola${nombre}! Soy tu asistente de Movistar. Puedo explicarte tu recibo, decirte cuánto debes o por qué cambió el monto. ¿Qué necesitas?`
    : '¡Hola! Soy tu asistente de Movistar. Puedo resolver dudas sobre tu recibo, tus cargos y los planes disponibles. Para ver información de tu cuenta necesito que inicies sesión.';

  return {
    texto,
    sugerencias: contexto.tieneCliente
      ? [CHIPS.MONTO, CHIPS.VARIACION, CHIPS.VENCIMIENTO]
      : []
  };
}

function responderAgradecimiento() {
  return {
    texto: '¡Con gusto! Si te queda alguna duda sobre tu recibo, acá estoy.',
    sugerencias: []
  };
}

function responderDespedida() {
  return {
    texto: 'Gracias a ti. Que tengas un buen día.',
    sugerencias: [],
    cerrarInteraccion: true
  };
}

function responderFueraDeAlcance() {
  return {
    texto: 'Sobre eso no te puedo ayudar; me dedico a tu servicio Movistar. Si quieres, revisamos tu recibo, tus cargos o los planes disponibles.',
    sugerencias: [CHIPS.MONTO, CHIPS.VARIACION]
  };
}

// ── Respuestas con datos ────────────────────────────────────────────────

function responderMonto(bloque) {
  const actual = bloque.reciboActual;
  const partes = [`Tu recibo del ciclo que cerró el ${actual.periodo} es de ${soles(actual.total)}.`];

  if (actual.deuda === 'CON DEUDA') {
    partes.push(actual.vencimiento
      ? `Está pendiente de pago y vence el ${formatearVencimiento(actual.vencimiento)}.`
      : 'Está pendiente de pago.');
  } else if (actual.deuda === 'SIN DEUDA') {
    partes.push('Ya figura pagado, no tienes nada pendiente.');
  }

  const sugerencias = [CHIPS.DETALLE, CHIPS.HISTORIAL];
  if (bloque.causas.length > 0) {
    sugerencias.unshift(CHIPS.VARIACION);
  }

  return { texto: partes.join(' '), sugerencias, tarjeta: construirTarjeta(bloque) };
}

/** Los tres pasos: qué pasó, por qué, qué hacer. */
function responderVariacion(bloque) {
  const { variacion, reciboActual, reciboAnterior } = bloque;

  if (!reciboAnterior) {
    return {
      texto: `Tu recibo del ${reciboActual.periodo} es de ${soles(reciboActual.total)}. Es el primero que tenemos registrado, así que todavía no hay un mes anterior con el cual compararlo.`,
      sugerencias: [CHIPS.DETALLE]
    };
  }

  if (variacion.direccion === 'SIN_CAMBIO') {
    return {
      texto: `Tu recibo del ${reciboActual.periodo} es de ${soles(reciboActual.total)}, el mismo monto que el mes anterior. No hubo ninguna variación.`,
      sugerencias: [CHIPS.DETALLE, CHIPS.HISTORIAL],
      tarjeta: construirTarjeta(bloque)
    };
  }

  const verbo = variacion.direccion === 'AUMENTO' ? 'subió' : 'bajó';
  const pasos = [];

  // 1. QUÉ PASÓ
  pasos.push(`Tu recibo del ${reciboActual.periodo} es de ${soles(reciboActual.total)}: ${verbo} ${soles(variacion.montoAbsoluto)} frente a los ${soles(reciboAnterior.total)} del mes anterior.`);

  // 2. POR QUÉ
  if (bloque.causas.length === 1) {
    const causa = bloque.causas[0];
    pasos.push(`El motivo es que ${explicacionDe(causa.codigo).corta}.`);
  } else if (bloque.causas.length > 1) {
    const lista = bloque.causas
      .map((causa) => `• ${causa.titulo} (${soles(causa.impacto)}): ${explicacionDe(causa.codigo).corta}`)
      .join('\n');
    pasos.push(`Hay ${bloque.causas.length} motivos detrás:\n${lista}`);
  }

  // 3. QUÉ HACER
  if (bloque.causas.length > 0) {
    pasos.push(explicacionDe(bloque.causas[0].codigo).accion);
  }

  return {
    texto: pasos.join('\n\n'),
    sugerencias: [CHIPS.NO_ENTIENDE, CHIPS.DETALLE, CHIPS.HISTORIAL],
    tarjeta: construirTarjeta(bloque)
  };
}

function responderDetalle(bloque) {
  const lineas = bloque.reciboActual.lineas.slice(0, 6);

  if (lineas.length === 0) {
    return {
      texto: `No tengo el desglose de tu recibo del ${bloque.reciboActual.periodo}, solo su total de ${soles(bloque.reciboActual.total)}.`,
      sugerencias: [CHIPS.ASESOR]
    };
  }

  const detalle = lineas
    .map((linea) => `• ${limpiarDescripcion(linea.descripcion) || linea.codigo}: ${soles(linea.monto)}`)
    .join('\n');

  const omitidas = bloque.reciboActual.lineas.length - lineas.length;
  const cierre = omitidas > 0 ? `\n\nY ${omitidas} concepto(s) más de menor monto.` : '';

  return {
    texto: `Tu recibo del ${bloque.reciboActual.periodo} suma ${soles(bloque.reciboActual.total)} y se compone así:\n\n${detalle}${cierre}`,
    sugerencias: [CHIPS.VARIACION, CHIPS.HISTORIAL],
    tarjeta: construirTarjeta(bloque)
  };
}

function responderVencimiento(bloque) {
  const actual = bloque.reciboActual;

  if (!actual.vencimiento) {
    return {
      texto: `No tengo registrada la fecha de vencimiento de tu recibo del ${actual.periodo}. Su monto es ${soles(actual.total)}.`,
      sugerencias: [CHIPS.ASESOR]
    };
  }

  const estado = actual.deuda === 'CON DEUDA'
    ? 'Todavía figura pendiente de pago.'
    : 'Ya figura pagado, así que no tienes nada pendiente.';

  return {
    texto: `Tu recibo de ${soles(actual.total)} vence el ${formatearVencimiento(actual.vencimiento)}. ${estado}`,
    sugerencias: [CHIPS.DETALLE, CHIPS.VARIACION],
    tarjeta: construirTarjeta(bloque)
  };
}

function responderHistorial(bloque) {
  const serie = bloque.historial
    .map((ciclo) => `• ${ciclo.periodo}: ${soles(ciclo.total)}`)
    .join('\n');

  return {
    texto: `Estos son tus últimos ${bloque.historial.length} recibos:\n\n${serie}\n\nEn promedio, ${soles(bloque.promedioHistorico)} por ciclo.`,
    sugerencias: [CHIPS.VARIACION, CHIPS.DETALLE],
    tarjeta: construirTarjeta(bloque)
  };
}

/** Cambia de registro, no repite lo mismo con sinónimos. */
function responderNoEntiende(bloque) {
  if (!hayBloque(bloque) || bloque.causas.length === 0) {
    return {
      texto: 'Déjame intentarlo de otra forma. ¿Qué parte te gustaría que aclare: el monto, la fecha de pago o el detalle de los cargos?',
      sugerencias: [CHIPS.MONTO, CHIPS.VENCIMIENTO, CHIPS.DETALLE, CHIPS.ASESOR]
    };
  }

  const causa = bloque.causas[0];
  const explicacion = explicacionDe(causa.codigo);

  return {
    texto: `Te lo cuento de otra manera.\n\n${explicacion.ampliada}\n\nEn tu caso eso significó ${soles(causa.impacto)} de diferencia.`,
    sugerencias: [CHIPS.DETALLE, CHIPS.ASESOR],
    tarjeta: construirTarjeta(bloque)
  };
}

/**
 * Disputa de cobro: se explica primero y se ofrece el asesor.
 *
 * No se deriva de entrada. El reto pide derivar por umbrales de
 * incomprensión, no por palabra clave: si el cliente insiste tras la
 * explicación, ahí sí corresponde el hand-off.
 */
function responderDisputa(bloque) {
  if (!hayBloque(bloque)) {
    return {
      texto: 'Entiendo que el cobro no te cuadra. Para revisarlo necesito ver tu cuenta: inicia sesión y lo miramos juntos, o te derivo con un asesor.',
      sugerencias: [CHIPS.ASESOR],
      sugerirHandoff: true
    };
  }

  const partes = [`Vamos a revisarlo. Tu recibo del ${bloque.reciboActual.periodo} es de ${soles(bloque.reciboActual.total)}.`];

  if (bloque.causas.length > 0) {
    const causa = bloque.causas[0];
    partes.push(`La diferencia frente al mes anterior viene de que ${explicacionDe(causa.codigo).corta}, por ${soles(causa.impacto)}.`);
  } else if (bloque.reciboAnterior) {
    partes.push(`Es el mismo monto que el mes anterior (${soles(bloque.reciboAnterior.total)}), así que no hubo ningún cargo nuevo.`);
  }

  partes.push('Si aun así no te cuadra, te derivo con un asesor que puede revisarlo a fondo con tu cuenta a la vista.');

  return {
    texto: partes.join('\n\n'),
    sugerencias: [CHIPS.DETALLE, CHIPS.ASESOR],
    tarjeta: construirTarjeta(bloque),
    sugerirHandoff: true
  };
}

/** Pide iniciar sesión, sin soltar ni un dato. */
function pedirAutenticacion() {
  return {
    texto: 'Para ver información de tu recibo necesito confirmar tu identidad. Pulsa "Iniciar sesión" e ingresa tu número y contraseña, y lo revisamos enseguida.',
    sugerencias: []
  };
}

/** Cliente autenticado pero sin recibos en la base. */
function sinRecibos() {
  return {
    texto: 'No encuentro recibos asociados a tu cuenta en nuestra base, así que prefiero no darte cifras que no pueda confirmar. ¿Quieres que te derive con un asesor para revisarlo?',
    sugerencias: [CHIPS.ASESOR],
    sugerirHandoff: true
  };
}

/**
 * Construye la respuesta para la intención ya clasificada.
 *
 * @param {object} clasificacion Salida de `clasificarIntencion`.
 * @param {object|null} bloque Bloque de hechos del motor.
 * @param {object} [contexto] `{ tieneCliente, nombreCliente }`.
 * @returns {object|null} La respuesta, o `null` si esta intención necesita
 *   redacción libre y hay que delegarla al LLM.
 */
function construirRespuesta(clasificacion, bloque, contexto = {}) {
  const intencion = clasificacion && clasificacion.intencion;

  if (!intencion) {
    return null;
  }

  // Conversacionales: no miran datos.
  switch (intencion) {
    case INTENCIONES.SALUDO:
      return responderSaludo(contexto);
    case INTENCIONES.AGRADECIMIENTO:
      return responderAgradecimiento();
    case INTENCIONES.DESPEDIDA:
      return responderDespedida();
    case INTENCIONES.FUERA_DE_ALCANCE:
      return responderFueraDeAlcance();
    default:
      break;
  }

  // A partir de acá hace falta identidad y datos.
  if (clasificacion.requiereIdentidad && !contexto.tieneCliente) {
    return pedirAutenticacion();
  }

  if (clasificacion.requiereIdentidad && !hayBloque(bloque)) {
    return sinRecibos();
  }

  switch (intencion) {
    case INTENCIONES.CONSULTA_MONTO:
      return responderMonto(bloque);
    case INTENCIONES.CONSULTA_VARIACION:
      return responderVariacion(bloque);
    case INTENCIONES.CONSULTA_DETALLE:
      return responderDetalle(bloque);
    case INTENCIONES.CONSULTA_VENCIMIENTO:
      return responderVencimiento(bloque);
    case INTENCIONES.CONSULTA_HISTORIAL:
      return responderHistorial(bloque);
    case INTENCIONES.DISPUTA_COBRO:
      return responderDisputa(bloque);
    case INTENCIONES.NO_ENTIENDE:
      return responderNoEntiende(bloque);
    default:
      // CONSULTA_CONCEPTO, CATALOGO_PLANES, SOPORTE_TECNICO, CONFIRMACION,
      // NEGACION y DESCONOCIDA necesitan redacción libre: las toma el LLM.
      return null;
  }
}

module.exports = {
  construirRespuesta,
  construirTarjeta,
  explicacionDe,
  EXPLICACION,
  CHIPS
};
