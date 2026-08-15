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
    corta: 'se te acabó un descuento que tenías, nada más',
    ampliada: 'Tenías una promo con fecha de fin. Mientras corría pagabas menos que tu tarifa; al vencerse, el plan se cobra completo. No te agregaron nada: es el mismo plan, sin el descuento encima.',
    accion: '¿Te reviso si hay alguna promo vigente para tu línea?'
  },
  [CAUSAS.NUEVO_DESCUENTO]: {
    corta: 'te entró un descuento',
    ampliada: 'Se activó una promo sobre tu plan, así que este mes pagas menos que la tarifa normal. Estas promos suelen tener una duración definida.',
    accion: '¿Quieres que te diga hasta cuándo te dura?'
  },
  [CAUSAS.PRORRATEO]: {
    corta: 'te cobraron solo los días que usaste, no el mes completo',
    ampliada: 'Cuando un servicio se activa o cambia a mitad de mes, no te cobran el mes entero: calculan la parte de los días que estuvo activo. Por eso el monto te sale "raro" y no cuadra con la tarifa redonda.',
    accion: 'El próximo mes ya se cobra completo y vuelve a ser parejo. ¿Te muestro el detalle?'
  },
  [CAUSAS.RECONEXION]: {
    corta: 'te cobraron la reconexión del servicio',
    ampliada: 'Cuando un recibo queda impago cortan el servicio, y al ponerte al día cobran un cargo único por reactivarlo. Es de una sola vez: el próximo mes ya no aparece.',
    accion: '¿Quieres que revisemos tu fecha de pago para que no se repita?'
  },
  [CAUSAS.CAMBIO_PLAN]: {
    corta: 'cambiaste de plan y la tarifa se ajustó',
    ampliada: 'Al migrar de plan dejan de cobrarte el anterior y empiezan con el nuevo. Si el cambio cayó a mitad de mes, puedes ver los dos en el mismo recibo, cada uno por los días que estuvo activo.',
    accion: '¿Te muestro cómo quedaron los dos planes en este recibo?'
  },
  [CAUSAS.CONSUMO_ADICIONAL]: {
    corta: 'usaste más de lo que incluye tu plan',
    ampliada: 'Tu plan trae una bolsa de datos, minutos o mensajes. Lo que pasa de ahí se cobra aparte, con su propia tarifa. Por eso este cargo te varía de un mes a otro.',
    accion: '¿Te muestro qué fue lo que más consumiste?'
  },
  [CAUSAS.CARGO_TERCEROS]: {
    corta: 'te facturaron servicios de terceros usados desde tu línea',
    ampliada: 'Hay servicios que no son de Movistar pero se cobran en tu recibo: llamadas de larga distancia por otro operador, suscripciones o contenidos. Movistar los cobra y después le pasa esa plata al proveedor.',
    accion: '¿No reconoces el cargo? Te paso con un asesor para revisarlo.'
  },
  [CAUSAS.PAQUETE]: {
    corta: 'se cobraron paquetes que contrataste',
    ampliada: 'Son bolsas que se compran aparte del plan: gigas extra, minutos o contenidos. Se cobran en el recibo del mes en que los contrataste.',
    accion: '¿Te muestro qué paquetes entraron este mes?'
  },
  [CAUSAS.NOTA_CREDITO]: {
    corta: 'te aplicaron una nota de crédito a favor',
    ampliada: 'Una nota de crédito te devuelve un monto que te habían cobrado de más. Se descuenta directo del recibo, por eso el total te baja.',
    accion: 'No tienes que hacer nada, ya está aplicada. ¿Te muestro el detalle?'
  },
  [CAUSAS.CUOTA_EQUIPO]: {
    corta: 'se facturó la cuota de tu equipo',
    ampliada: 'Cuando el equipo se compra financiado, su precio se reparte en cuotas mensuales que van junto al plan. Cuando terminan las cuotas, el recibo te baja solo.',
    accion: '¿Quieres que veamos el detalle de la cuota?'
  },
  [CAUSAS.AJUSTE_TARIFA]: {
    corta: 'cambió la tarifa de algo que ya venías pagando',
    ampliada: 'El mismo concepto se sigue cobrando, pero con otro importe que el mes pasado. Suele ser un ajuste de tarifa o un cambio en las condiciones del servicio.',
    accion: '¿Te muestro el detalle línea por línea?'
  }
};

/**
 * Glosario de facturación, para responder "¿qué es X?" sin pasar por el LLM.
 *
 * Estos términos son intrínsecamente numéricos, y el modelo tiende a
 * explicarlos con cifras de ejemplo ("si pagas S/ 100 y usas 10 días..."). En
 * un chat de facturación esa cifra se lee como el cargo propio, así que el
 * verificador la rechaza y el cliente se queda sin respuesta.
 *
 * Los conceptos que coinciden con una causa reutilizan su explicación
 * `ampliada`: así el bot dice lo mismo cuando explica el término suelto y
 * cuando explica por qué cambió el recibo.
 */
const TERMINO_A_CAUSA = [
  { patron: /\bprorrate/, causa: CAUSAS.PRORRATEO },
  { patron: /\breconexi/, causa: CAUSAS.RECONEXION },
  { patron: /\bnota de credito\b/, causa: CAUSAS.NOTA_CREDITO },
  { patron: /\b(cuota|financiamiento)\b/, causa: CAUSAS.CUOTA_EQUIPO },
  { patron: /\bpaquete/, causa: CAUSAS.PAQUETE },
  { patron: /\b(consumo adicional|roaming|trafico adicional)\b/, causa: CAUSAS.CONSUMO_ADICIONAL },
  { patron: /\bcambio de plan\b/, causa: CAUSAS.CAMBIO_PLAN },
  { patron: /\bdescuento\b/, causa: CAUSAS.FIN_DESCUENTO }
];

/** Conceptos que no corresponden a ninguna causa del motor. */
const GLOSARIO = [
  {
    patron: /\bigv\b/,
    texto: 'El IGV es el Impuesto General a las Ventas: un impuesto que el Estado aplica a casi todos los bienes y servicios en Perú. En tu recibo ya viene incluido dentro del total, así que el monto que ves es lo que pagas, sin sorpresas encima.'
  },
  {
    patron: /\bciclo( de facturacion)?\b/,
    texto: 'El ciclo de facturación es el periodo que cubre cada recibo. No va del 1 al 30: tiene su propia fecha de corte, y todo lo que consumas entre un corte y el siguiente entra en ese recibo. Por eso la fecha de cierre no coincide con el fin de mes.'
  },
  {
    patron: /\bcargo (fijo|recurrente)\b/,
    texto: 'El cargo fijo es la tarifa de tu plan: lo que pagas todos los meses por el servicio contratado, independientemente de cuánto lo uses. Es la parte estable de tu recibo.'
  },
  {
    patron: /\b(larga distancia|oldi|americatel)\b/,
    texto: 'Son llamadas cursadas por otro operador desde tu línea. Movistar las cobra en tu recibo y luego le transfiere ese dinero al proveedor que dio el servicio, por eso aparecen como un concepto aparte.'
  },
  {
    patron: /\brenta (adelantada|vencida)\b/,
    texto: 'Indica cuándo se cobra el servicio. En renta adelantada pagas el mes que viene a usar; en renta vencida, el mes que ya usaste. Cambia el momento del cobro, no el precio.'
  }
];

/**
 * Responde "¿qué es X?" desde el glosario.
 *
 * @returns {object|null} La explicación, o `null` si el término no está y
 *   conviene que lo redacte el modelo.
 */
function responderConcepto(texto) {
  const coincidencia = TERMINO_A_CAUSA.find((entrada) => entrada.patron.test(texto));
  if (coincidencia) {
    return {
      texto: explicacionDe(coincidencia.causa).ampliada,
      sugerencias: [CHIPS.VARIACION, CHIPS.DETALLE]
    };
  }

  const delGlosario = GLOSARIO.find((entrada) => entrada.patron.test(texto));
  if (delGlosario) {
    return {
      texto: delGlosario.texto,
      sugerencias: [CHIPS.VARIACION, CHIPS.DETALLE]
    };
  }

  return null;
}

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

/**
 * "15 de julio de 2026" → "julio".
 *
 * El periodo completo es la fecha de cierre del ciclo y decirlo entero en
 * cada frase suena a máquina. El dato exacto sigue estando en la tarjeta.
 */
function mesDelPeriodo(periodo) {
  const encontrado = String(periodo || '').match(/de ([a-záéíóúñ]+) de \d{4}/i);
  return encontrado ? encontrado[1] : String(periodo || '');
}

/**
 * Cómo nombrar el recibo del que se está hablando.
 *
 * Si el cliente pidió un ciclo concreto ("el de junio"), se le llama por su
 * mes; si no, es simplemente el último.
 */
function nombrarRecibo(bloque, contexto) {
  const mes = mesDelPeriodo(bloque.reciboActual.periodo);
  return contexto.cicloPedido ? `tu recibo de ${mes}` : `tu último recibo, el de ${mes},`;
}

/**
 * Frase de estado de pago.
 *
 * Se omite en los seguimientos: repetir "ya figura pagado, no tienes nada
 * pendiente" en cada respuesta es lo que hace que suene a plantilla.
 */
function fraseEstado(bloque, contexto) {
  if (contexto.esSeguimiento) {
    return '';
  }

  const actual = bloque.reciboActual;

  if (actual.deuda === 'CON DEUDA') {
    return actual.vencimiento
      ? ` Ojo que sigue pendiente: vence el ${formatearVencimiento(actual.vencimiento)}.`
      : ' Ese sigue pendiente de pago.';
  }

  if (actual.deuda === 'SIN DEUDA') {
    return ' Ese ya está pagado, así que tranquilo.';
  }

  return '';
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
    ? `¡Hola${nombre}! Te explico tu recibo en simple, sin vueltas. ¿Qué quieres saber?`
    : '¡Hola! Te puedo explicar tu recibo y resolverte dudas de facturación. Para ver tu cuenta necesito que inicies sesión primero.';

  return {
    texto,
    sugerencias: contexto.tieneCliente
      ? [CHIPS.MONTO, CHIPS.VARIACION, CHIPS.VENCIMIENTO]
      : []
  };
}

function responderAgradecimiento() {
  return {
    texto: '¡Un gusto! Cualquier otra duda de tu recibo, me escribes nomás.',
    sugerencias: []
  };
}

function responderDespedida() {
  return {
    texto: 'Gracias a ti. ¡Que estés bien!',
    sugerencias: [],
    cerrarInteraccion: true
  };
}

function responderFueraDeAlcance() {
  return {
    texto: 'Uy, de eso no manejo. Yo veo tu recibo y tus cargos. ¿Te ayudo con algo de tu cuenta?',
    sugerencias: [CHIPS.MONTO, CHIPS.VARIACION]
  };
}

// ── Respuestas con datos ────────────────────────────────────────────────

function responderMonto(bloque, contexto) {
  const actual = bloque.reciboActual;
  const mes = mesDelPeriodo(actual.periodo);

  // Si vuelve a preguntar por lo mismo, se confirma en vez de repetir la
  // frase palabra por palabra: eso es lo que delata a una plantilla.
  let encabezado;
  if (contexto.esRepeticion) {
    encabezado = `Sí, ese mismo: el de ${mes} fueron ${soles(actual.total)}.`;
  } else if (contexto.cicloPedido) {
    encabezado = `El de ${mes} te salió ${soles(actual.total)}.`;
  } else {
    encabezado = `Tu recibo de ${mes} es de ${soles(actual.total)}.`;
  }

  const sugerencias = [CHIPS.DETALLE, CHIPS.HISTORIAL];
  if (bloque.causas.length > 0) {
    sugerencias.unshift(CHIPS.VARIACION);
  }

  // Gancho: se ofrece el siguiente paso en vez de esperar a que lo adivine.
  const gancho = bloque.causas.length > 0
    ? ' ¿Te cuento por qué cambió?'
    : ' ¿Quieres ver el detalle?';

  return {
    texto: `${encabezado}${fraseEstado(bloque, contexto)}${gancho}`,
    sugerencias,
    tarjeta: construirTarjeta(bloque)
  };
}

/** Los tres pasos: qué pasó, por qué, qué hacer. */
function responderVariacion(bloque, contexto) {
  const { variacion, reciboActual, reciboAnterior } = bloque;
  const mes = mesDelPeriodo(reciboActual.periodo);

  if (!reciboAnterior) {
    return {
      texto: `El de ${mes} salió ${soles(reciboActual.total)}, pero es el primero que tenemos registrado. Todavía no hay un mes anterior con el cual compararlo.`,
      sugerencias: [CHIPS.DETALLE]
    };
  }

  const mesAnterior = mesDelPeriodo(reciboAnterior.periodo);

  if (variacion.direccion === 'SIN_CAMBIO') {
    return {
      texto: `Nada que ver, no cambió: el de ${mes} salió ${soles(reciboActual.total)}, igualito que el de ${mesAnterior}. ¿Te muestro el detalle?`,
      sugerencias: [CHIPS.DETALLE, CHIPS.HISTORIAL],
      tarjeta: construirTarjeta(bloque)
    };
  }

  const pasos = [];

  // 1. QUÉ PASÓ.
  //
  // El recorrido va primero y la diferencia después, en su propia frase. Con
  // "subió S/ 42.95: pasaste de..." una reescritura puede convertirlo en
  // "subió A S/ 42.95", que cambia el sentido sin tocar ninguna cifra: dice
  // que el recibo llegó a ese monto en vez de que aumentó en esa cantidad.
  const direccion = variacion.direccion === 'AUMENTO' ? 'más' : 'menos';
  pasos.push(`En ${mesAnterior} pagaste ${soles(reciboAnterior.total)} y en ${mes}, ${soles(reciboActual.total)}. Son ${soles(variacion.montoAbsoluto)} ${direccion}.`);

  // 2. POR QUÉ — una línea. Lo largo va detrás de "no entendí".
  if (bloque.causas.length === 1) {
    pasos.push(`Fue porque ${explicacionDe(bloque.causas[0].codigo).corta}.`);
  } else if (bloque.causas.length > 1) {
    const lista = bloque.causas
      .map((causa) => `• ${causa.titulo} (${soles(causa.impacto)}): ${explicacionDe(causa.codigo).corta}`)
      .join('\n');
    pasos.push(`Fueron ${bloque.causas.length} cosas a la vez:\n${lista}`);
  }

  // 3. EL GANCHO — se ofrece el siguiente paso, no se cierra la conversación.
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
    texto: `Los ${soles(bloque.reciboActual.total)} de ${mesDelPeriodo(bloque.reciboActual.periodo)} se reparten así:\n\n${detalle}${cierre}\n\n¿Hay alguno que no reconozcas?`,
    sugerencias: [CHIPS.VARIACION, CHIPS.HISTORIAL],
    tarjeta: construirTarjeta(bloque)
  };
}

function responderVencimiento(bloque) {
  const actual = bloque.reciboActual;

  if (!actual.vencimiento) {
    return {
      texto: `No tengo registrada la fecha de vencimiento de ese recibo. Lo que sí te puedo decir es que salió ${soles(actual.total)}.`,
      sugerencias: [CHIPS.ASESOR]
    };
  }

  const estado = actual.deuda === 'CON DEUDA'
    ? `Vence el ${formatearVencimiento(actual.vencimiento)} y son ${soles(actual.total)}. Todavía está pendiente.`
    : `Venció el ${formatearVencimiento(actual.vencimiento)}, pero tranquilo: esos ${soles(actual.total)} ya los pagaste.`;

  return {
    texto: `${estado} ¿Te cuento algo más de este recibo?`,
    sugerencias: [CHIPS.DETALLE, CHIPS.VARIACION],
    tarjeta: construirTarjeta(bloque)
  };
}

function responderHistorial(bloque) {
  const serie = bloque.historial
    .map((ciclo) => `• ${mesDelPeriodo(ciclo.periodo)}: ${soles(ciclo.total)}`)
    .join('\n');

  return {
    texto: `Mira cómo vienes pagando:\n\n${serie}\n\nEn promedio te sale ${soles(bloque.promedioHistorico)} al mes. ¿Quieres que veamos algún mes en particular?`,
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
    texto: `Va de nuevo, más simple.\n\n${explicacion.ampliada}\n\nEn tu caso fueron ${soles(causa.impacto)} de diferencia. ¿Se entiende mejor así?`,
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

  const partes = [`Ya, vamos a revisarlo. El de ${mesDelPeriodo(bloque.reciboActual.periodo)} salió ${soles(bloque.reciboActual.total)}.`];

  if (bloque.causas.length > 0) {
    const causa = bloque.causas[0];
    partes.push(`La diferencia con el mes pasado es que ${explicacionDe(causa.codigo).corta}, por ${soles(causa.impacto)}.`);
  } else if (bloque.reciboAnterior) {
    partes.push(`Es el mismo monto que el mes pasado (${soles(bloque.reciboAnterior.total)}), así que no te agregaron ningún cargo nuevo.`);
  }

  partes.push('Si aun así no te cuadra, te paso con un asesor que lo revisa a fondo. ¿Te lo derivo?');

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

  // Glosario: se responde con conocimiento del dominio, sin datos de nadie.
  if (intencion === INTENCIONES.CONSULTA_CONCEPTO) {
    return responderConcepto(clasificacion.textoNormalizado || '');
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
      return responderMonto(bloque, contexto);
    case INTENCIONES.CONSULTA_VARIACION:
      return responderVariacion(bloque, contexto);
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
