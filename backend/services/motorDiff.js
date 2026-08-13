/**
 * Motor determinista de comparación de recibos (Desafío 1).
 *
 * Regla de oro del proyecto: el LLM narra números ya resueltos, no los infiere.
 * Este módulo es el que los resuelve. Es PURO: no toca disco ni red, recibe las
 * filas de cargos ya leídas y devuelve un bloque de hechos en JSON.
 *
 * Todo monto que aparezca en una respuesta al cliente tiene que existir antes en
 * el bloque que devuelve `construirBloqueDeHechos`.
 */

const GRUPO_EXCLUIDO = 'NO CONSIDERAR';

/** Códigos de causa que puede emitir el motor. */
const CAUSAS = {
  FIN_DESCUENTO: 'FIN_DESCUENTO',
  NUEVO_DESCUENTO: 'NUEVO_DESCUENTO',
  PRORRATEO: 'PRORRATEO',
  RECONEXION: 'RECONEXION',
  CAMBIO_PLAN: 'CAMBIO_PLAN',
  CONSUMO_ADICIONAL: 'CONSUMO_ADICIONAL',
  CARGO_TERCEROS: 'CARGO_TERCEROS',
  PAQUETE: 'PAQUETE',
  NOTA_CREDITO: 'NOTA_CREDITO',
  CUOTA_EQUIPO: 'CUOTA_EQUIPO',
  AJUSTE_TARIFA: 'AJUSTE_TARIFA'
};

const TITULOS_CAUSA = {
  FIN_DESCUENTO: 'Terminó un descuento',
  NUEVO_DESCUENTO: 'Se aplicó un descuento',
  PRORRATEO: 'Cobro proporcional por días',
  RECONEXION: 'Cargo por reconexión del servicio',
  CAMBIO_PLAN: 'Cambio de plan',
  CONSUMO_ADICIONAL: 'Consumo adicional fuera del plan',
  CARGO_TERCEROS: 'Servicios de terceros',
  PAQUETE: 'Paquetes contratados',
  NOTA_CREDITO: 'Nota de crédito a favor',
  CUOTA_EQUIPO: 'Cuota de equipo',
  AJUSTE_TARIFA: 'Ajuste de tarifa del mismo concepto'
};

function texto(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  return String(valor).trim();
}

/**
 * Los CSV del proyecto usan punto decimal, pero llegan montos con coma o con el
 * símbolo de soles pegado. Devuelve 0 ante cualquier cosa no numérica: nunca
 * `NaN`, porque un NaN se propagaría hasta un monto mostrado al cliente.
 */
function aMonto(valor) {
  const limpio = texto(valor).replace(/[\sS/$]/g, '').replace(/,/g, '.');
  if (limpio === '') {
    return 0;
  }
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : 0;
}

/** Redondea a céntimos evitando el arrastre binario de sumar flotantes. */
function aCentimos(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function leerCampo(fila, nombres) {
  for (const nombre of nombres) {
    const valor = texto(fila ? fila[nombre] : '');
    if (valor !== '') {
      return valor;
    }
  }
  return '';
}

function normalizarFila(fila) {
  return {
    cliente: leerCampo(fila, ['CUSTOMER_KEY', 'customer_key']),
    cuentaFinanciera: leerCampo(fila, ['FINANCIAL_ACCOUNT_KEY', 'FINANCIAL_ACCOUNT']),
    billingArrangement: leerCampo(fila, ['BILLING_ARRANGEMENT_KEY']),
    suscriptor: leerCampo(fila, ['SUBSCRIBER_KEY']),
    factura: leerCampo(fila, ['LEGAL_INVOICE_NUMBER']),
    ciclo: leerCampo(fila, ['ciclo', 'CICLO', 'Ciclo']),
    codigo: leerCampo(fila, ['CHARGE_CODE_ID']),
    descripcion: leerCampo(fila, ['CHARGE_CODE_DESC']),
    clasificacion: leerCampo(fila, ['CHARGE_CODE_CLASSIFICATION']),
    grupo: leerCampo(fila, ['GRUPO']).toUpperCase(),
    subGrupo: leerCampo(fila, ['SUB_GRUPO']).toUpperCase(),
    // El header viene con un espacio final en el CSV original; el parser lo
    // recorta, pero aceptamos ambas formas por si se lee sin normalizar.
    vencimiento: leerCampo(fila, ['FECHA-VENCIMIENTO', 'FECHA-VENCIMIENTO ', 'FECHA_VENCIMIENTO']),
    deuda: leerCampo(fila, ['DEUDA']).toUpperCase(),
    // Al cliente se le habla en total con IGV; el neto solo se guarda de apoyo.
    total: aMonto(leerCampo(fila, ['CHARGE_TOTAL_AMOUNT'])),
    neto: aMonto(leerCampo(fila, ['CHARGE_NET_AMOUNT']))
  };
}

/**
 * `ciclo` viene como YYYYMMDD y es la fecha de cierre, no el mes calendario.
 * Se formatea solo para mostrar; el orden siempre usa el string crudo.
 */
function formatearCiclo(ciclo) {
  const limpio = texto(ciclo);
  if (!/^\d{8}$/.test(limpio)) {
    return limpio;
  }
  const anio = limpio.slice(0, 4);
  const mes = limpio.slice(4, 6);
  const dia = Number(limpio.slice(6, 8));
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = meses[Number(mes) - 1] || mes;
  return `${dia} de ${nombreMes} de ${anio}`;
}

/**
 * Agrupa por ciclo sumando solo las líneas explicables.
 *
 * `GRUPO = 'NO CONSIDERAR'` son bonos que normalmente vienen en pares que se
 * anulan (`RCD_PAQRE197 +47.37` con `RCD_BONPAQRE197 −47.37`), pero en el
 * dataset hay negativos huérfanos: sumarlos inventa recibos en negativo que el
 * cliente nunca vio. Se excluyen del total y se reportan aparte.
 */
function agruparPorCiclo(filas) {
  const ciclos = new Map();

  for (const cruda of filas) {
    const fila = normalizarFila(cruda);
    if (!fila.ciclo) {
      continue;
    }

    if (!ciclos.has(fila.ciclo)) {
      ciclos.set(fila.ciclo, {
        ciclo: fila.ciclo,
        periodo: formatearCiclo(fila.ciclo),
        factura: fila.factura,
        vencimiento: fila.vencimiento,
        deuda: fila.deuda,
        total: 0,
        lineas: new Map(),
        noConsideradas: []
      });
    }

    const acumulado = ciclos.get(fila.ciclo);
    if (!acumulado.factura) acumulado.factura = fila.factura;
    if (!acumulado.vencimiento) acumulado.vencimiento = fila.vencimiento;
    if (!acumulado.deuda) acumulado.deuda = fila.deuda;

    if (fila.grupo === GRUPO_EXCLUIDO) {
      acumulado.noConsideradas.push({
        codigo: fila.codigo,
        descripcion: fila.descripcion,
        monto: aCentimos(fila.total)
      });
      continue;
    }

    acumulado.total = aCentimos(acumulado.total + fila.total);

    // Un mismo CHARGE_CODE_ID puede repetirse dentro del ciclo (p. ej. dos
    // tramos proporcionales del mismo plan). Se suman: el diff compara
    // conceptos facturados, no líneas sueltas.
    if (!acumulado.lineas.has(fila.codigo)) {
      acumulado.lineas.set(fila.codigo, {
        codigo: fila.codigo,
        descripcion: fila.descripcion,
        grupo: fila.grupo,
        subGrupo: fila.subGrupo,
        clasificacion: fila.clasificacion,
        monto: 0,
        ocurrencias: 0
      });
    }
    const linea = acumulado.lineas.get(fila.codigo);
    linea.monto = aCentimos(linea.monto + fila.total);
    linea.ocurrencias += 1;
  }

  return [...ciclos.values()]
    .map((ciclo) => ({
      ...ciclo,
      lineas: [...ciclo.lineas.values()].sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))
    }))
    .sort((a, b) => b.ciclo.localeCompare(a.ciclo)); // más reciente primero
}

function esLineaDePlan(linea) {
  return /^RC_PLANRE/i.test(linea.codigo) || /CARGO RECURRENTE DE PLAN/i.test(linea.clasificacion || '');
}

/**
 * Clasifica un delta usando las señales que trae la propia línea (GRUPO,
 * SUB_GRUPO, prefijo del CHARGE_CODE_ID). No depende de los datasets
 * auxiliares: esos solo agregan evidencia después, en `enriquecerConAuxiliares`.
 */
function clasificarDelta(delta, contexto) {
  const grupo = delta.grupo || '';
  const codigo = (delta.codigo || '').toUpperCase();
  const descripcion = (delta.descripcion || '').toUpperCase();

  if (grupo === 'CARGO POR RECONEXION' || codigo.includes('RECONEXION')) {
    return CAUSAS.RECONEXION;
  }

  if (grupo.includes('PROPORCIONAL')) {
    return CAUSAS.PRORRATEO;
  }

  if (grupo === 'DESCUENTO CARGO RECURRENTE') {
    // Un descuento es un monto negativo: si se hizo menos negativo o
    // desapareció, el recibo sube y la causa es el fin del descuento.
    return delta.delta > 0 ? CAUSAS.FIN_DESCUENTO : CAUSAS.NUEVO_DESCUENTO;
  }

  if (grupo === 'TRAFICO ADICIONAL' || grupo === 'ROAMING') {
    return CAUSAS.CONSUMO_ADICIONAL;
  }

  if (grupo === 'PAQUETES') {
    return CAUSAS.PAQUETE;
  }

  if (grupo === 'CARGA EXTERNA' || grupo === 'OTROS' || codigo.startsWith('OLDI')) {
    return CAUSAS.CARGO_TERCEROS;
  }

  if (/CUOTA|EQUIPO|FINANCIAMIENTO/.test(descripcion)) {
    return CAUSAS.CUOTA_EQUIPO;
  }

  if (esLineaDePlan(delta)) {
    // Si en el mismo diff otro código de plan hizo el movimiento contrario, no
    // es un ajuste de tarifa: el cliente migró de plan.
    if (contexto.hayCambioDePlan) {
      return CAUSAS.CAMBIO_PLAN;
    }
    return CAUSAS.AJUSTE_TARIFA;
  }

  if (delta.delta < 0 && delta.montoActual < 0) {
    return CAUSAS.NOTA_CREDITO;
  }

  return CAUSAS.AJUSTE_TARIFA;
}

/**
 * Diff línea a línea entre dos ciclos. Todo concepto presente en cualquiera de
 * los dos aparece en el resultado, así la suma de deltas cuadra con la
 * variación total por construcción.
 */
function calcularDeltas(actual, anterior) {
  const codigos = new Set();
  const mapaActual = new Map();
  const mapaAnterior = new Map();

  (actual ? actual.lineas : []).forEach((linea) => {
    mapaActual.set(linea.codigo, linea);
    codigos.add(linea.codigo);
  });
  (anterior ? anterior.lineas : []).forEach((linea) => {
    mapaAnterior.set(linea.codigo, linea);
    codigos.add(linea.codigo);
  });

  const deltas = [];
  for (const codigo of codigos) {
    const enActual = mapaActual.get(codigo);
    const enAnterior = mapaAnterior.get(codigo);
    const montoActual = enActual ? enActual.monto : 0;
    const montoAnterior = enAnterior ? enAnterior.monto : 0;
    const diferencia = aCentimos(montoActual - montoAnterior);

    if (diferencia === 0) {
      continue;
    }

    const referencia = enActual || enAnterior;
    deltas.push({
      codigo,
      descripcion: referencia.descripcion,
      grupo: referencia.grupo,
      subGrupo: referencia.subGrupo,
      clasificacion: referencia.clasificacion,
      montoActual,
      montoAnterior,
      delta: diferencia,
      tipo: !enAnterior ? 'NUEVO' : (!enActual ? 'ELIMINADO' : 'CAMBIADO')
    });
  }

  return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Hay cambio de plan si un código de plan desaparece y otro distinto aparece. */
function detectarCambioDePlan(deltas) {
  const planesFuera = deltas.filter((d) => esLineaDePlan(d) && d.tipo === 'ELIMINADO');
  const planesDentro = deltas.filter((d) => esLineaDePlan(d) && d.tipo === 'NUEVO');
  return planesFuera.length > 0 && planesDentro.length > 0;
}

function agruparCausas(deltas, hayCambioDePlan) {
  const porCausa = new Map();

  for (const delta of deltas) {
    const causa = clasificarDelta(delta, { hayCambioDePlan });
    if (!porCausa.has(causa)) {
      porCausa.set(causa, {
        codigo: causa,
        titulo: TITULOS_CAUSA[causa] || causa,
        impacto: 0,
        conceptos: [],
        evidencia: []
      });
    }
    const acumulada = porCausa.get(causa);
    acumulada.impacto = aCentimos(acumulada.impacto + delta.delta);
    acumulada.conceptos.push({
      codigo: delta.codigo,
      descripcion: delta.descripcion,
      montoAnterior: delta.montoAnterior,
      montoActual: delta.montoActual,
      delta: delta.delta,
      tipo: delta.tipo
    });
  }

  return [...porCausa.values()].sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto));
}

function direccionDe(monto) {
  if (Math.abs(monto) < 0.01) {
    return 'SIN_CAMBIO';
  }
  return monto > 0 ? 'AUMENTO' : 'DISMINUCION';
}

function resumirCiclo(ciclo) {
  if (!ciclo) {
    return null;
  }
  const sumaNoConsideradas = aCentimos(
    ciclo.noConsideradas.reduce((suma, linea) => suma + linea.monto, 0)
  );
  return {
    ciclo: ciclo.ciclo,
    periodo: ciclo.periodo,
    factura: ciclo.factura,
    vencimiento: ciclo.vencimiento,
    deuda: ciclo.deuda,
    total: ciclo.total,
    lineas: ciclo.lineas,
    noConsideradas: {
      cantidad: ciclo.noConsideradas.length,
      sumaNeta: sumaNoConsideradas,
      // Los bonos deberían anularse entre sí; si no lo hacen, el dataset trae
      // negativos huérfanos y conviene dejar constancia.
      balanceadas: Math.abs(sumaNoConsideradas) < 0.01
    }
  };
}

/**
 * Construye el bloque de hechos del cliente.
 *
 * @param {object[]} filasCargos Filas crudas de Cargos_FacturadosV2 del cliente.
 * @param {object} [opciones]
 * @param {number} [opciones.maxCiclos=6] Recibo actual + 5 previos.
 * @param {string} [opciones.cicloObjetivo] Explica ese ciclo en vez del último.
 *   Sirve para "¿por qué mi recibo de marzo fue tan alto?": la variación se
 *   calcula igual, pero contra el ciclo previo al pedido.
 * @returns {object} Bloque de hechos con montos ya resueltos.
 */
function construirBloqueDeHechos(filasCargos, opciones = {}) {
  const maxCiclos = opciones.maxCiclos || 6;
  const filas = Array.isArray(filasCargos) ? filasCargos : [];

  if (filas.length === 0) {
    return {
      encontrado: false,
      motivo: 'SIN_CARGOS',
      cliente: texto(opciones.cliente),
      advertencias: ['No hay cargos facturados para este cliente en la base.']
    };
  }

  const todosLosCiclos = agruparPorCiclo(filas);
  const referencia = normalizarFila(filas[0]);
  const advertencias = [];

  // Por defecto se explica el último recibo. Con `cicloObjetivo` la ventana se
  // corre para que el ciclo pedido quede como "actual" y conserve sus previos.
  let desde = 0;
  const objetivo = texto(opciones.cicloObjetivo);
  if (objetivo) {
    const posicion = todosLosCiclos.findIndex((ciclo) => ciclo.ciclo === objetivo);
    if (posicion === -1) {
      return {
        encontrado: false,
        motivo: 'CICLO_NO_ENCONTRADO',
        cliente: referencia.cliente || texto(opciones.cliente),
        ciclosDisponibles: todosLosCiclos.map((ciclo) => ciclo.ciclo),
        advertencias: [`El cliente no tiene un recibo del ciclo ${objetivo}.`]
      };
    }
    desde = posicion;
  }

  const ciclos = todosLosCiclos.slice(desde, desde + maxCiclos);

  if (ciclos.length === 0) {
    return {
      encontrado: false,
      motivo: 'SIN_CICLOS',
      cliente: referencia.cliente || texto(opciones.cliente),
      advertencias: ['Los cargos del cliente no tienen ciclo de facturación asignado.']
    };
  }

  const actual = ciclos[0];
  const anterior = ciclos[1] || null;
  const deltas = anterior ? calcularDeltas(actual, anterior) : [];
  const hayCambioDePlan = detectarCambioDePlan(deltas);
  const causas = agruparCausas(deltas, hayCambioDePlan);

  const variacionMonto = anterior ? aCentimos(actual.total - anterior.total) : 0;
  const variacionPorcentaje = anterior && Math.abs(anterior.total) > 0.01
    ? aCentimos((variacionMonto / Math.abs(anterior.total)) * 100)
    : null;

  if (ciclos.length < maxCiclos) {
    advertencias.push(`Solo hay ${ciclos.length} ciclo(s) facturado(s); el reto pide comparar contra 5 previos.`);
  }
  if (!actual.noConsideradas.balanceadas && actual.noConsideradas.length > 0) {
    advertencias.push('El ciclo actual tiene bonos NO CONSIDERAR sin contraparte; se excluyeron del total.');
  }

  const totales = ciclos.map((ciclo) => ciclo.total);
  const promedio = aCentimos(totales.reduce((suma, valor) => suma + valor, 0) / totales.length);

  return {
    encontrado: true,
    cliente: referencia.cliente || texto(opciones.cliente),
    cuentaFinanciera: referencia.cuentaFinanciera,
    billingArrangement: referencia.billingArrangement,
    moneda: 'PEN',
    reciboActual: resumirCiclo(actual),
    reciboAnterior: resumirCiclo(anterior),
    historial: ciclos.map((ciclo) => ({
      ciclo: ciclo.ciclo,
      periodo: ciclo.periodo,
      factura: ciclo.factura,
      total: ciclo.total
    })),
    promedioHistorico: promedio,
    variacion: {
      monto: variacionMonto,
      montoAbsoluto: aCentimos(Math.abs(variacionMonto)),
      porcentaje: variacionPorcentaje,
      direccion: direccionDe(variacionMonto)
    },
    deltas,
    causas,
    advertencias
  };
}

/**
 * Devuelve todos los montos del bloque de hechos, en céntimos redondeados.
 * Es la lista blanca contra la que se valida que el LLM no inventó cifras.
 */
function montosDelBloque(bloque) {
  const montos = new Set();

  const agregar = (valor) => {
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      montos.add(aCentimos(valor));
    }
  };

  const recorrer = (nodo) => {
    if (Array.isArray(nodo)) {
      nodo.forEach(recorrer);
      return;
    }
    if (nodo && typeof nodo === 'object') {
      Object.values(nodo).forEach(recorrer);
      return;
    }
    agregar(nodo);
  };

  recorrer(bloque);
  return montos;
}

module.exports = {
  construirBloqueDeHechos,
  montosDelBloque,
  agruparPorCiclo,
  calcularDeltas,
  formatearCiclo,
  aMonto,
  aCentimos,
  CAUSAS,
  GRUPO_EXCLUIDO
};
