/**
 * Narrador del bloque de hechos y verificador anti-alucinación.
 *
 * Dos responsabilidades, las dos al servicio de la misma regla: si un monto
 * aparece en la respuesta al cliente, tuvo que existir antes en el bloque de
 * hechos que calculó `motorDiff`.
 *
 *   1. `narrarBloqueDeHechos` arma la explicación sin pasar por el LLM. Es la
 *      respuesta que se usa cuando Groq no está disponible: antes ahí se
 *      devolvían precios escritos a mano en el código.
 *   2. `verificarMontos` toma cualquier texto (venga del LLM o de acá) y
 *      comprueba que cada cifra exista en el bloque. Eso es la evidencia de
 *      "0% de alucinación comprobable en logs" que pide el reto.
 */

const { montosDelBloque, aCentimos, CAUSAS } = require('./motorDiff');

/** Frases de causa, en el tono empático que pide el reto. */
const EXPLICACION_CAUSA = {
  [CAUSAS.FIN_DESCUENTO]: (c) => `terminó el descuento que venías teniendo (${describirConceptos(c)}), y por eso vuelves a pagar la tarifa normal`,
  [CAUSAS.NUEVO_DESCUENTO]: (c) => `se aplicó un descuento en tu recibo (${describirConceptos(c)})`,
  [CAUSAS.PRORRATEO]: (c) => `se cobraron solo los días que usaste el servicio en el ciclo, no el mes completo (${describirConceptos(c)})`,
  [CAUSAS.RECONEXION]: (c) => `se cobró la reconexión del servicio tras una suspensión (${describirConceptos(c)})`,
  [CAUSAS.CAMBIO_PLAN]: (c) => `cambiaste de plan a mitad de ciclo (${describirConceptos(c)})`,
  [CAUSAS.CONSUMO_ADICIONAL]: (c) => `hubo consumo por encima de lo que incluye tu plan (${describirConceptos(c)})`,
  [CAUSAS.CARGO_TERCEROS]: (c) => `se facturaron servicios de terceros usados desde tu línea (${describirConceptos(c)})`,
  [CAUSAS.PAQUETE]: (c) => `se cobraron paquetes contratados (${describirConceptos(c)})`,
  [CAUSAS.NOTA_CREDITO]: (c) => `se aplicó una nota de crédito a tu favor (${describirConceptos(c)})`,
  [CAUSAS.CUOTA_EQUIPO]: (c) => `se facturó la cuota de tu equipo (${describirConceptos(c)})`,
  [CAUSAS.AJUSTE_TARIFA]: (c) => `cambió la tarifa de un concepto que ya venías pagando (${describirConceptos(c)})`
};

function soles(monto) {
  const numero = Number(monto) || 0;
  const signo = numero < 0 ? '-' : '';
  return `${signo}S/ ${Math.abs(numero).toFixed(2)}`;
}

/**
 * Quita los precios que vienen embebidos en el nombre del cargo.
 *
 * `CHARGE_CODE_DESC` suele traer la tarifa de lista pegada al nombre
 * ("RV Plan Porta S/49.9", "Bono Ilim Linea Adic 39.9 (VR 60.30)") y esa cifra
 * **no** es la que se facturó: ese plan se cobró S/ 49.89. Mostrarla al lado
 * del monto real confunde al cliente y mete en la respuesta un número que el
 * bloque de hechos no respalda. El monto correcto se imprime aparte.
 */
function limpiarDescripcion(descripcion) {
  return String(descripcion || '')
    .replace(/\(\s*VR:?\s*S?\/?\s*[\d.,]+\s*\)/gi, '')  // (VR 60.30) / (VR: S/47.37)
    .replace(/S\s*\/\s*[\d.,]+/gi, '')                   // S/49.9 / S/ 77.9
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s_:;,-]+$/, '')
    .trim();
}

function describirConceptos(causa) {
  return causa.conceptos
    .slice(0, 3)
    .map((concepto) => `${limpiarDescripcion(concepto.descripcion) || concepto.codigo}: ${soles(concepto.delta)}`)
    .join('; ');
}

/**
 * Explica el recibo en lenguaje simple, usando exclusivamente los montos del
 * bloque. Nunca inventa: si falta un dato, lo dice.
 */
function narrarBloqueDeHechos(bloque) {
  if (!bloque || !bloque.encontrado) {
    if (bloque && bloque.motivo === 'CICLO_NO_ENCONTRADO') {
      return 'No encontré un recibo de ese periodo en tu cuenta. ¿Quieres que revisemos el último recibo emitido?';
    }
    return 'No encontré recibos asociados a esa cuenta en nuestra base. Si crees que es un error, puedo derivarte con un asesor para que lo revise contigo.';
  }

  const actual = bloque.reciboActual;
  const anterior = bloque.reciboAnterior;
  const partes = [];

  partes.push(`Tu recibo del ciclo que cerró el ${actual.periodo} es de ${soles(actual.total)}.`);

  if (!anterior) {
    partes.push('Es el primer recibo que tenemos registrado para tu cuenta, así que todavía no hay un mes anterior con el cual compararlo.');
  } else if (bloque.variacion.direccion === 'SIN_CAMBIO') {
    partes.push(`Es el mismo monto que el recibo anterior (${soles(anterior.total)}), así que no hubo ninguna variación.`);
  } else {
    const verbo = bloque.variacion.direccion === 'AUMENTO' ? 'subió' : 'bajó';
    partes.push(
      `Comparado con el recibo anterior, que fue de ${soles(anterior.total)}, ${verbo} ${soles(bloque.variacion.montoAbsoluto)}.`
    );

    if (bloque.causas.length === 1) {
      const causa = bloque.causas[0];
      const explicar = EXPLICACION_CAUSA[causa.codigo];
      partes.push(`El motivo es que ${explicar ? explicar(causa) : causa.titulo.toLowerCase()}.`);
    } else if (bloque.causas.length > 1) {
      partes.push(`Hay ${bloque.causas.length} motivos detrás de ese cambio:`);
      bloque.causas.forEach((causa) => {
        const explicar = EXPLICACION_CAUSA[causa.codigo];
        const detalle = explicar ? explicar(causa) : causa.titulo.toLowerCase();
        partes.push(`• ${causa.titulo} (${soles(causa.impacto)}): ${detalle}.`);
      });
    }
  }

  if (actual.deuda === 'CON DEUDA') {
    const vencimiento = actual.vencimiento ? ` Su vencimiento es el ${formatearVencimiento(actual.vencimiento)}.` : '';
    partes.push(`Este recibo figura pendiente de pago.${vencimiento}`);
  } else if (actual.deuda === 'SIN DEUDA') {
    partes.push('Este recibo ya figura pagado, no tienes nada pendiente.');
  }

  if (bloque.historial.length > 1) {
    const serie = bloque.historial
      .map((ciclo) => `${ciclo.periodo}: ${soles(ciclo.total)}`)
      .join(' · ');
    partes.push(`Tus últimos ${bloque.historial.length} recibos fueron — ${serie}.`);
  }

  const servicio = describirServicio(bloque.servicio);
  if (servicio) {
    partes.push(servicio);
  }

  return partes.join('\n\n');
}

/**
 * Frase con el servicio contratado y la antigüedad.
 *
 * Sale de PLANTA CLIENTES, no del recibo: da contexto sin tocar ningún monto.
 * Devuelve cadena vacía si no hay ficha, para no afirmar nada sin respaldo.
 */
function describirServicio(servicio) {
  if (!servicio || !Array.isArray(servicio.servicios) || servicio.servicios.length === 0) {
    return '';
  }

  const lista = servicio.servicios.length === 1
    ? servicio.servicios[0]
    : `${servicio.servicios.slice(0, -1).join(', ')} y ${servicio.servicios[servicio.servicios.length - 1]}`;

  const partes = [`En tu cuenta tienes ${lista}`];

  if (servicio.antiguedadMeses && servicio.antiguedadMeses >= 12) {
    const anios = Math.floor(servicio.antiguedadMeses / 12);
    partes.push(`, con nosotros desde hace ${anios} ${anios === 1 ? 'año' : 'años'}`);
  } else if (servicio.antiguedadMeses) {
    partes.push(`, activo desde hace ${servicio.antiguedadMeses} meses`);
  }

  return `${partes.join('')}.`;
}

/** `FECHA-VENCIMIENTO` viene como YYYYMMDD. */
function formatearVencimiento(valor) {
  const limpio = String(valor || '').trim();
  if (!/^\d{8}$/.test(limpio)) {
    return limpio;
  }
  return `${Number(limpio.slice(6, 8))}/${limpio.slice(4, 6)}/${limpio.slice(0, 4)}`;
}

/**
 * Serializa el bloque para inyectarlo en el prompt del LLM.
 *
 * Va como texto plano y explícito en lugar de JSON crudo: los modelos chicos
 * copian mejor un número que ven etiquetado que uno anidado en llaves.
 */
function construirBloqueParaPrompt(bloque) {
  if (!bloque || !bloque.encontrado) {
    return 'BLOQUE DE HECHOS: no hay recibos para este cliente. No inventes montos ni periodos; ofrece derivar con un asesor.';
  }

  const lineas = [
    'BLOQUE DE HECHOS (calculado por el sistema, NO recalcular).',
    'Usa SOLO estos montos. Cualquier cifra que no esté acá es una alucinación.',
    '',
    `Cliente: ${bloque.cliente}`,
    `Recibo actual (ciclo ${bloque.reciboActual.ciclo}, ${bloque.reciboActual.periodo}): ${soles(bloque.reciboActual.total)}`,
    `Estado: ${bloque.reciboActual.deuda || 'no informado'}`
  ];

  if (bloque.reciboActual.vencimiento) {
    lineas.push(`Vencimiento: ${formatearVencimiento(bloque.reciboActual.vencimiento)}`);
  }

  if (bloque.reciboAnterior) {
    lineas.push(`Recibo anterior (${bloque.reciboAnterior.periodo}): ${soles(bloque.reciboAnterior.total)}`);
    lineas.push(`Variación: ${soles(bloque.variacion.monto)} (${bloque.variacion.direccion})`);
  } else {
    lineas.push('Recibo anterior: no existe, es el primer recibo registrado.');
  }

  lineas.push('', 'Historial de recibos:');
  bloque.historial.forEach((ciclo) => {
    lineas.push(`- ${ciclo.periodo}: ${soles(ciclo.total)}`);
  });

  if (bloque.causas.length > 0) {
    lineas.push('', 'Causas de la variación (ya clasificadas, no inferir otras):');
    bloque.causas.forEach((causa) => {
      lineas.push(`- ${causa.titulo}: impacto ${soles(causa.impacto)}`);
      causa.conceptos.forEach((concepto) => {
        lineas.push(`    · ${limpiarDescripcion(concepto.descripcion) || concepto.codigo}: ${soles(concepto.montoAnterior)} -> ${soles(concepto.montoActual)} (${soles(concepto.delta)})`);
      });
    });
  } else if (bloque.reciboAnterior) {
    lineas.push('', 'No hubo variación respecto al recibo anterior: no expliques causas.');
  }

  const servicio = describirServicio(bloque.servicio);
  if (servicio) {
    lineas.push('', `Servicio contratado: ${servicio}`);
  }

  if (bloque.advertencias.length > 0) {
    lineas.push('', `Advertencias: ${bloque.advertencias.join(' ')}`);
  }

  return lineas.join('\n');
}

/**
 * Extrae los montos que un texto le presenta al cliente como dinero.
 *
 * Solo cuenta lo que va precedido de `S/`: los números sueltos de un texto en
 * español son fechas, cantidades de GB o números de ciclo, y tomarlos como
 * montos llenaría el informe de falsos positivos.
 */
function extraerMontos(texto) {
  const encontrados = [];
  const patron = /(-?)\s*S\/\s*(-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)/gi;
  let coincidencia = patron.exec(texto || '');

  while (coincidencia !== null) {
    const signo = coincidencia[1] === '-' ? -1 : 1;
    const numero = Number(String(coincidencia[2]).replace(/[,\s]/g, ''));
    if (Number.isFinite(numero)) {
      encontrados.push(aCentimos(signo * numero));
    }
    coincidencia = patron.exec(texto || '');
  }

  return encontrados;
}

/**
 * Comprueba que cada monto del texto exista en el bloque de hechos.
 *
 * Se acepta el monto tanto en positivo como en negativo: el bloque guarda una
 * variación de -20.01 y es correcto que el texto diga "bajó S/ 20.01".
 *
 * @returns {{valido: boolean, montos: number[], inventados: number[]}}
 */
function verificarMontos(texto, bloque) {
  const permitidos = montosDelBloque(bloque);
  const montos = extraerMontos(texto);
  const inventados = montos.filter((monto) => !permitidos.has(monto) && !permitidos.has(aCentimos(-monto)));

  return {
    valido: inventados.length === 0,
    montos,
    inventados: [...new Set(inventados)]
  };
}

/**
 * Verifica la respuesta y, si trae cifras inventadas, la reemplaza por la
 * narración determinista. Deja el registro en consola para poder auditarlo.
 */
function blindarRespuesta(respuesta, bloque, contexto = {}) {
  const verificacion = verificarMontos(respuesta, bloque);

  if (verificacion.valido) {
    return { texto: respuesta, verificacion, reemplazada: false };
  }

  console.warn('[ANTI-ALUCINACION] montos inventados %j (cliente %s, sesión %s). Se reemplazó la respuesta del modelo.',
    verificacion.inventados, bloque && bloque.cliente, contexto.sessionId || 'sin sesión');

  return { texto: narrarBloqueDeHechos(bloque), verificacion, reemplazada: true };
}

module.exports = {
  narrarBloqueDeHechos,
  construirBloqueParaPrompt,
  verificarMontos,
  extraerMontos,
  blindarRespuesta,
  limpiarDescripcion,
  describirServicio,
  soles,
  formatearVencimiento
};
