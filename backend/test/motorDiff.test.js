const test = require('node:test');
const assert = require('node:assert/strict');

const {
  construirBloqueDeHechos,
  montosDelBloque,
  agruparPorCiclo,
  calcularDeltas,
  formatearCiclo,
  aMonto,
  aCentimos,
  CAUSAS
} = require('../services/motorDiff');

/** Construye una fila de Cargos_FacturadosV2 con los campos que usa el motor. */
function cargo(campos) {
  return {
    CUSTOMER_KEY: '12345678',
    FINANCIAL_ACCOUNT_KEY: '900000001',
    BILLING_ARRANGEMENT_KEY: '900000001',
    LEGAL_INVOICE_NUMBER: 'S1AA-0000000001',
    SUBSCRIBER_KEY: '900000001',
    ciclo: '20260705',
    CHARGE_CODE_ID: 'RC_PLANRE500',
    CHARGE_CODE_DESC: 'RV Plan Mi Movistar S/39.9',
    CHARGE_CODE_CLASSIFICATION: 'Cargo Recurrente De Plan',
    GRUPO: 'CARGO FIJO VENCIDO',
    SUB_GRUPO: 'CARGO FIJO VENCIDO MOVIL',
    'FECHA-VENCIMIENTO': '20260721',
    DEUDA: 'SIN DEUDA',
    CHARGE_TOTAL_AMOUNT: '39.90',
    CHARGE_NET_AMOUNT: '33.81',
    ...campos
  };
}

/** Serie estable de N ciclos con el mismo plan, para colgarle variaciones. */
function serieEstable(ciclos, monto = 39.9) {
  return ciclos.map((ciclo) => cargo({ ciclo, CHARGE_TOTAL_AMOUNT: String(monto) }));
}

const CICLOS = ['20260205', '20260305', '20260405', '20260505', '20260605', '20260705'];

test('aMonto tolera comas, soles y basura sin devolver NaN', () => {
  assert.equal(aMonto('39.90'), 39.9);
  assert.equal(aMonto('39,90'), 39.9);
  assert.equal(aMonto('S/ 39.90'), 39.9);
  assert.equal(aMonto('-163.28'), -163.28);
  assert.equal(aMonto(''), 0);
  assert.equal(aMonto('no es un monto'), 0);
  assert.equal(aMonto(null), 0);
});

test('aCentimos elimina el arrastre binario de sumar flotantes', () => {
  assert.equal(aCentimos(0.1 + 0.2), 0.3);
  assert.equal(aCentimos(39.9 * 3), 119.7);
});

test('formatearCiclo traduce YYYYMMDD a fecha legible', () => {
  assert.equal(formatearCiclo('20260705'), '5 de julio de 2026');
  assert.equal(formatearCiclo('20260227'), '27 de febrero de 2026');
  assert.equal(formatearCiclo('sin formato'), 'sin formato');
});

test('excluye GRUPO NO CONSIDERAR del total del ciclo', () => {
  // Par balanceado: bonificación Disney+ que se anula sola.
  const filas = [
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '85.90' }),
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'RCD_PAQRE197', GRUPO: 'NO CONSIDERAR', CHARGE_TOTAL_AMOUNT: '47.37' }),
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'RCD_BONPAQRE197', GRUPO: 'NO CONSIDERAR', CHARGE_TOTAL_AMOUNT: '-47.37' })
  ];

  const [ciclo] = agruparPorCiclo(filas);

  assert.equal(ciclo.total, 85.9);
  assert.equal(ciclo.noConsideradas.length, 2);
  assert.equal(ciclo.lineas.length, 1);
});

test('un bono NO CONSIDERAR huérfano no arrastra el recibo a negativo', () => {
  // Caso real de 128757351/20260605: dos bonos negativos sin contraparte.
  // Sumarlos ingenuamente da -163.28; el recibo que vio el cliente fue 39.98.
  const filas = [
    cargo({ ciclo: '20260605', CHARGE_CODE_ID: 'RC_PLANRE192', GRUPO: 'CARGO FIJO PROPORCIONAL VENCIDO', CHARGE_TOTAL_AMOUNT: '37.41' }),
    cargo({ ciclo: '20260605', CHARGE_CODE_ID: 'RC_PLANRE577', GRUPO: 'CARGO FIJO PROPORCIONAL VENCIDO', CHARGE_TOTAL_AMOUNT: '2.57' }),
    cargo({ ciclo: '20260605', CHARGE_CODE_ID: 'RCD_BONPAQRE219', GRUPO: 'NO CONSIDERAR', CHARGE_TOTAL_AMOUNT: '-105.02' }),
    cargo({ ciclo: '20260605', CHARGE_CODE_ID: 'RCD_BONPAQRE219', GRUPO: 'NO CONSIDERAR', CHARGE_TOTAL_AMOUNT: '-98.24' }),
    cargo({ ciclo: '20260605', CHARGE_CODE_ID: 'RCD_PAQRE183', GRUPO: 'NO CONSIDERAR', CHARGE_TOTAL_AMOUNT: '60.30' }),
    cargo({ ciclo: '20260605', CHARGE_CODE_ID: 'RCD_BONPAQRE183', GRUPO: 'NO CONSIDERAR', CHARGE_TOTAL_AMOUNT: '-60.30' })
  ];

  const [ciclo] = agruparPorCiclo(filas);

  assert.equal(ciclo.total, 39.98);
  assert.equal(ciclo.noConsideradas.length, 4);
});

test('suma las ocurrencias repetidas del mismo CHARGE_CODE_ID en un ciclo', () => {
  // Dos tramos proporcionales del mismo plan dentro del mismo recibo.
  const filas = [
    cargo({ ciclo: '20260417', CHARGE_CODE_ID: 'RC_PLANRE435', GRUPO: 'CARGO FIJO PROPORCIONAL VENCIDO', CHARGE_TOTAL_AMOUNT: '12.56' }),
    cargo({ ciclo: '20260417', CHARGE_CODE_ID: 'RC_PLANRE435', GRUPO: 'CARGO FIJO PROPORCIONAL VENCIDO', CHARGE_TOTAL_AMOUNT: '57.80' })
  ];

  const [ciclo] = agruparPorCiclo(filas);

  assert.equal(ciclo.lineas.length, 1);
  assert.equal(ciclo.lineas[0].monto, 70.36);
  assert.equal(ciclo.lineas[0].ocurrencias, 2);
  assert.equal(ciclo.total, 70.36);
});

test('ordena los ciclos del más reciente al más antiguo', () => {
  const bloque = construirBloqueDeHechos(serieEstable(CICLOS));

  assert.equal(bloque.reciboActual.ciclo, '20260705');
  assert.equal(bloque.reciboAnterior.ciclo, '20260605');
  assert.deepEqual(bloque.historial.map((h) => h.ciclo), [...CICLOS].reverse());
});

test('devuelve el recibo actual y 5 previos, descartando los más viejos', () => {
  const ocho = ['20251205', '20260105', ...CICLOS];
  const bloque = construirBloqueDeHechos(serieEstable(ocho));

  assert.equal(bloque.historial.length, 6);
  assert.equal(bloque.historial[5].ciclo, '20260205');
  assert.ok(!bloque.historial.some((h) => h.ciclo === '20251205'));
  assert.equal(bloque.advertencias.length, 0);
});

test('advierte cuando el cliente no llega a 6 ciclos', () => {
  const bloque = construirBloqueDeHechos(serieEstable(['20260605', '20260705']));

  assert.equal(bloque.historial.length, 2);
  assert.match(bloque.advertencias.join(' '), /Solo hay 2 ciclo/);
});

test('una serie sin cambios reporta variación cero y ninguna causa', () => {
  const bloque = construirBloqueDeHechos(serieEstable(CICLOS));

  assert.equal(bloque.variacion.monto, 0);
  assert.equal(bloque.variacion.direccion, 'SIN_CAMBIO');
  assert.equal(bloque.causas.length, 0);
  assert.equal(bloque.deltas.length, 0);
});

test('clasifica el cargo por reconexión', () => {
  // Fixture real 125420001: 79.90 x5 y luego 84.48 (+4.58 de reconexión).
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5), 79.9),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '79.90' }),
    cargo({
      ciclo: '20260705',
      CHARGE_CODE_ID: 'OC1_RECONEXION',
      CHARGE_CODE_DESC: 'Cargo por Reconexión',
      GRUPO: 'CARGO POR RECONEXION',
      CHARGE_TOTAL_AMOUNT: '4.58'
    })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.reciboActual.total, 84.48);
  assert.equal(bloque.variacion.monto, 4.58);
  assert.equal(bloque.variacion.direccion, 'AUMENTO');
  assert.equal(bloque.causas.length, 1);
  assert.equal(bloque.causas[0].codigo, CAUSAS.RECONEXION);
  assert.equal(bloque.causas[0].impacto, 4.58);
});

test('clasifica el cambio de plan cuando un código de plan reemplaza a otro', () => {
  // Fixture real 123165012: RC_PLANRE500 (34.95) -> RC_PLANRE593 (49.89).
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5), 34.95),
    cargo({
      ciclo: '20260705',
      CHARGE_CODE_ID: 'RC_PLANRE593',
      CHARGE_CODE_DESC: 'RV Plan Ilimitado Mi Movistar S/49.9',
      CHARGE_TOTAL_AMOUNT: '49.89'
    })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.variacion.monto, 14.94);
  assert.equal(bloque.causas.length, 1);
  assert.equal(bloque.causas[0].codigo, CAUSAS.CAMBIO_PLAN);
  assert.equal(bloque.causas[0].impacto, 14.94);
  // El diff conserva ambos lados del cambio.
  assert.equal(bloque.deltas.find((d) => d.codigo === 'RC_PLANRE593').tipo, 'NUEVO');
  assert.equal(bloque.deltas.find((d) => d.codigo === 'RC_PLANRE500').tipo, 'ELIMINADO');
});

test('un descuento que desaparece se clasifica como fin de descuento', () => {
  const conDescuento = CICLOS.slice(0, 5).flatMap((ciclo) => [
    cargo({ ciclo, CHARGE_TOTAL_AMOUNT: '39.90' }),
    cargo({
      ciclo,
      CHARGE_CODE_ID: 'RCD_DESC030',
      CHARGE_CODE_DESC: 'Descuento por fidelización',
      GRUPO: 'DESCUENTO CARGO RECURRENTE',
      CHARGE_TOTAL_AMOUNT: '-10.00'
    })
  ]);
  const filas = [...conDescuento, cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '39.90' })];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.reciboAnterior.total, 29.9);
  assert.equal(bloque.reciboActual.total, 39.9);
  assert.equal(bloque.variacion.monto, 10);
  assert.equal(bloque.causas[0].codigo, CAUSAS.FIN_DESCUENTO);
  assert.equal(bloque.causas[0].impacto, 10);
});

test('un descuento que aparece se clasifica como nuevo descuento', () => {
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5)),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '39.90' }),
    cargo({
      ciclo: '20260705',
      CHARGE_CODE_ID: 'RCD_DESC030',
      CHARGE_CODE_DESC: 'Descuento por fidelización',
      GRUPO: 'DESCUENTO CARGO RECURRENTE',
      CHARGE_TOTAL_AMOUNT: '-10.00'
    })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.variacion.direccion, 'DISMINUCION');
  assert.equal(bloque.causas[0].codigo, CAUSAS.NUEVO_DESCUENTO);
  assert.equal(bloque.causas[0].impacto, -10);
});

test('clasifica el prorrateo por cargo proporcional', () => {
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5)),
    cargo({
      ciclo: '20260705',
      CHARGE_CODE_ID: 'RC_PLANRE500',
      GRUPO: 'CARGO FIJO PROPORCIONAL VENCIDO',
      CHARGE_TOTAL_AMOUNT: '26.60'
    })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.variacion.monto, -13.3);
  assert.equal(bloque.causas[0].codigo, CAUSAS.PRORRATEO);
});

test('clasifica el cargo de terceros OLDI como servicio de terceros', () => {
  // Fixture real 48799623: pico de 85.90 a 429.89 por AMERICATEL.
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5), 85.9),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '85.90' }),
    cargo({
      ciclo: '20260705',
      CHARGE_CODE_ID: 'OLDI_UC011977',
      CHARGE_CODE_DESC: 'Llamadas por AMERICATEL',
      CHARGE_CODE_CLASSIFICATION: 'Cargo de Uso OLDI',
      GRUPO: 'OTROS',
      SUB_GRUPO: 'OLDI',
      CHARGE_TOTAL_AMOUNT: '343.99'
    })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.reciboActual.total, 429.89);
  assert.equal(bloque.variacion.monto, 343.99);
  assert.equal(bloque.causas[0].codigo, CAUSAS.CARGO_TERCEROS);
  assert.equal(bloque.causas[0].impacto, 343.99);
});

test('clasifica el consumo adicional fuera del plan', () => {
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5)),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '39.90' }),
    cargo({
      ciclo: '20260705',
      CHARGE_CODE_ID: 'UC_DATOS001',
      CHARGE_CODE_DESC: 'Datos adicionales',
      GRUPO: 'TRAFICO ADICIONAL',
      CHARGE_TOTAL_AMOUNT: '15.00'
    })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.causas[0].codigo, CAUSAS.CONSUMO_ADICIONAL);
  assert.equal(bloque.causas[0].impacto, 15);
});

test('INVARIANTE: la suma de los deltas cuadra con la variación total', () => {
  // Ciclo con varias causas a la vez: reconexión, consumo y fin de descuento.
  const filas = [
    ...CICLOS.slice(0, 5).flatMap((ciclo) => [
      cargo({ ciclo, CHARGE_TOTAL_AMOUNT: '39.90' }),
      cargo({ ciclo, CHARGE_CODE_ID: 'RCD_DESC030', GRUPO: 'DESCUENTO CARGO RECURRENTE', CHARGE_TOTAL_AMOUNT: '-10.00' })
    ]),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '39.90' }),
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'OC1_RECONEXION', GRUPO: 'CARGO POR RECONEXION', CHARGE_TOTAL_AMOUNT: '4.58' }),
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'UC_DATOS001', GRUPO: 'TRAFICO ADICIONAL', CHARGE_TOTAL_AMOUNT: '15.00' })
  ];

  const bloque = construirBloqueDeHechos(filas);

  const sumaDeltas = bloque.deltas.reduce((suma, d) => suma + d.delta, 0);
  assert.equal(aCentimos(sumaDeltas), bloque.variacion.monto);

  const sumaCausas = bloque.causas.reduce((suma, c) => suma + c.impacto, 0);
  assert.equal(aCentimos(sumaCausas), bloque.variacion.monto);

  assert.equal(bloque.causas.length, 3);
});

test('calcula el porcentaje de variación sobre el ciclo anterior', () => {
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5), 100),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '150.00' })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.variacion.porcentaje, 50);
});

test('promedia el historial de los 6 ciclos', () => {
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5), 40),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '100.00' })
  ];

  const bloque = construirBloqueDeHechos(filas);

  assert.equal(bloque.promedioHistorico, 50);
});

test('un cliente con un solo ciclo no inventa comparación', () => {
  const bloque = construirBloqueDeHechos(serieEstable(['20260705']));

  assert.equal(bloque.reciboAnterior, null);
  assert.equal(bloque.variacion.monto, 0);
  assert.equal(bloque.variacion.porcentaje, null);
  assert.equal(bloque.deltas.length, 0);
});

test('cicloObjetivo corre la ventana para explicar un recibo anterior', () => {
  const filas = [
    ...serieEstable(['20260205', '20260305'], 39.9),
    cargo({ ciclo: '20260405', CHARGE_TOTAL_AMOUNT: '39.90' }),
    cargo({ ciclo: '20260405', CHARGE_CODE_ID: 'OLDI_UC011977', GRUPO: 'OTROS', CHARGE_TOTAL_AMOUNT: '300.00' }),
    ...serieEstable(['20260505', '20260605', '20260705'], 39.9)
  ];

  const ultimo = construirBloqueDeHechos(filas);
  assert.equal(ultimo.variacion.monto, 0, 'el último ciclo está plano');

  const viejo = construirBloqueDeHechos(filas, { cicloObjetivo: '20260405' });
  assert.equal(viejo.reciboActual.ciclo, '20260405');
  assert.equal(viejo.reciboActual.total, 339.9);
  assert.equal(viejo.reciboAnterior.ciclo, '20260305');
  assert.equal(viejo.variacion.monto, 300);
  assert.equal(viejo.causas[0].codigo, CAUSAS.CARGO_TERCEROS);
});

test('cicloObjetivo inexistente no inventa un recibo', () => {
  const bloque = construirBloqueDeHechos(serieEstable(CICLOS), { cicloObjetivo: '20991231' });

  assert.equal(bloque.encontrado, false);
  assert.equal(bloque.motivo, 'CICLO_NO_ENCONTRADO');
  assert.equal(bloque.ciclosDisponibles.length, 6);
});

test('sin cargos devuelve encontrado=false en vez de un bloque vacío', () => {
  const bloque = construirBloqueDeHechos([]);

  assert.equal(bloque.encontrado, false);
  assert.equal(bloque.motivo, 'SIN_CARGOS');
  assert.ok(bloque.advertencias.length > 0);
});

test('calcularDeltas ignora los conceptos que no se movieron', () => {
  const [actual, anterior] = agruparPorCiclo([
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '39.90' }),
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'OC1_RECONEXION', GRUPO: 'CARGO POR RECONEXION', CHARGE_TOTAL_AMOUNT: '4.58' }),
    cargo({ ciclo: '20260605', CHARGE_TOTAL_AMOUNT: '39.90' })
  ]);

  const deltas = calcularDeltas(actual, anterior);

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].codigo, 'OC1_RECONEXION');
});

test('montosDelBloque expone todas las cifras para validar alucinaciones', () => {
  const filas = [
    ...serieEstable(CICLOS.slice(0, 5), 79.9),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '79.90' }),
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'OC1_RECONEXION', GRUPO: 'CARGO POR RECONEXION', CHARGE_TOTAL_AMOUNT: '4.58' })
  ];

  const montos = montosDelBloque(construirBloqueDeHechos(filas));

  assert.ok(montos.has(84.48), 'el total actual debe estar en la lista blanca');
  assert.ok(montos.has(79.9), 'el total anterior debe estar en la lista blanca');
  assert.ok(montos.has(4.58), 'el impacto de la causa debe estar en la lista blanca');
  assert.ok(!montos.has(89.9), 'un monto que nadie facturó no puede estar en la lista blanca');
});
