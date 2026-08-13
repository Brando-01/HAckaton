const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  obtenerCargosDeCliente,
  obtenerHechosDeCliente,
  existeCliente,
  precargarIndice,
  limpiarIndice,
  ARCHIVO_CARGOS
} = require('../services/cargosRepository');

const CABECERA = [
  'FINANCIAL_ACCOUNT_KEY', 'CUSTOMER_KEY', 'BILLING_ARRANGEMENT_KEY', 'LEGAL_INVOICE_NUMBER',
  'BILLING_CYCLE_KEY', 'CHARGE_NET_AMOUNT', 'CHARGE_TOTAL_AMOUNT', 'CHARGE_CODE_ID',
  'CHARGE_CODE_DESC', 'CHARGE_CODE_CLASSIFICATION', 'SUBSCRIBER_KEY', 'PERIOD_START_DATE',
  'PERIOD_END_DATE', 'ciclo', 'GRUPO', 'SUB_GRUPO', 'FECHA-VENCIMIENTO ', 'DEUDA'
].join(';');

/** Escribe un CSV con el mismo formato del dataset real (delimitador `;`). */
function crearDataDir(filas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cargos-repo-'));
  const lineas = filas.map((fila) => [
    fila.cuenta || '900000001',
    fila.cliente,
    fila.cuenta || '900000001',
    fila.factura || 'S1AA-0000000001',
    '5',
    fila.neto || fila.total,
    fila.total,
    fila.codigo || 'RC_PLANRE500',
    fila.descripcion || 'RV Plan Mi Movistar S/39.9',
    'Cargo Recurrente De Plan',
    fila.suscriptor || '800000001',
    '00:00.0',
    '00:00.0',
    fila.ciclo,
    fila.grupo || 'CARGO FIJO VENCIDO',
    'CARGO FIJO VENCIDO MOVIL',
    '20260721',
    fila.deuda || 'SIN DEUDA'
  ].join(';'));

  fs.writeFileSync(path.join(dir, ARCHIVO_CARGOS), [CABECERA, ...lineas].join('\n') + '\n');
  limpiarIndice(dir);
  return dir;
}

const FILAS_BASE = [
  { cliente: '55555555', ciclo: '20260605', total: '39.90' },
  { cliente: '55555555', ciclo: '20260705', total: '39.90' },
  { cliente: '55555555', ciclo: '20260705', total: '4.58', codigo: 'OC1_RECONEXION', descripcion: 'Cargo por Reconexión', grupo: 'CARGO POR RECONEXION' },
  { cliente: '66666666', ciclo: '20260705', total: '89.90', cuenta: '900000002', suscriptor: '800000002' }
];

test('indexa el CSV y devuelve los cargos de un cliente', async () => {
  const dir = crearDataDir(FILAS_BASE);

  const cargos = await obtenerCargosDeCliente(dir, '55555555');

  assert.equal(cargos.length, 3);
  assert.ok(cargos.every((c) => c.CUSTOMER_KEY === '55555555'));
});

test('recorta el espacio final de la columna FECHA-VENCIMIENTO al indexar', async () => {
  const dir = crearDataDir(FILAS_BASE);

  const [cargo] = await obtenerCargosDeCliente(dir, '55555555');

  assert.equal(cargo['FECHA-VENCIMIENTO'], '20260721');
});

test('encuentra al cliente también por cuenta financiera y por suscriptor', async () => {
  const dir = crearDataDir(FILAS_BASE);

  assert.equal((await obtenerCargosDeCliente(dir, '900000002')).length, 1);
  assert.equal((await obtenerCargosDeCliente(dir, '800000002')).length, 1);
});

test('un identificador inexistente devuelve lista vacía, no todos los cargos', async () => {
  const dir = crearDataDir(FILAS_BASE);

  assert.deepEqual(await obtenerCargosDeCliente(dir, 'NO_EXISTE'), []);
  assert.deepEqual(await obtenerCargosDeCliente(dir, ''), []);
  assert.deepEqual(await obtenerCargosDeCliente(dir, null), []);
});

test('existeCliente valida contra la base, no contra el formato', async () => {
  const dir = crearDataDir(FILAS_BASE);

  assert.equal(await existeCliente(dir, '55555555'), true);
  assert.equal(await existeCliente(dir, '99999999'), false);
  assert.equal(await existeCliente(dir, 'NO_EXISTE'), false);
});

test('obtenerHechosDeCliente encadena el índice con el motor', async () => {
  const dir = crearDataDir(FILAS_BASE);

  const hechos = await obtenerHechosDeCliente(dir, '55555555');

  assert.equal(hechos.encontrado, true);
  assert.equal(hechos.reciboActual.total, 44.48);
  assert.equal(hechos.variacion.monto, 4.58);
  assert.equal(hechos.causas[0].codigo, 'RECONEXION');
});

test('el índice se construye una sola vez por directorio', async () => {
  const dir = crearDataDir(FILAS_BASE);

  const primera = await precargarIndice(dir);
  assert.equal(primera.filas, 4);
  assert.equal(primera.clientes, 2);

  // Si el índice se releyera, este cambio en disco se vería reflejado.
  fs.appendFileSync(path.join(dir, ARCHIVO_CARGOS), `900000003;77777777;900000003;S1AA-9;5;10;10;RC_PLANRE500;x;y;800000003;;;20260705;CARGO FIJO;z;20260721;SIN DEUDA\n`);

  assert.equal(await existeCliente(dir, '77777777'), false);

  limpiarIndice(dir);
  assert.equal(await existeCliente(dir, '77777777'), true);
});

test('un directorio sin el CSV no rompe, reporta índice no disponible', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cargos-vacio-'));
  limpiarIndice(dir);

  const estado = await precargarIndice(dir);

  assert.equal(estado.disponible, false);
  assert.equal(estado.filas, 0);
  assert.deepEqual(await obtenerCargosDeCliente(dir, '55555555'), []);
});

// --- Integración contra el dataset real ---------------------------------
//
// Ground truth verificado sobre Cargos_FacturadosV2.csv el 2026-08-12,
// filtrando GRUPO='NO CONSIDERAR'. Ojo: los totales negativos que figuraban
// antes para 128757351 y 58013061 eran un artefacto de sumar bonos negativos
// huérfanos; el recibo real de esos ciclos es positivo.

const DATA_DIR = path.join(__dirname, '..', 'data');
const HAY_DATA_REAL = fs.existsSync(path.join(DATA_DIR, ARCHIVO_CARGOS));

const GROUND_TRUTH = [
  {
    cliente: '48799623',
    serie: [68.72, 85.9, 429.89, 74.89, 74.89, 74.89],
    // El pico está en un ciclo viejo: el recibo actual está plano contra el
    // anterior, así que no hay causa que explicar salvo que se pida ese ciclo.
    nota: 'pico por llamadas AMERICATEL (OLDI) en el ciclo 20260331'
  },
  {
    cliente: '58364152',
    serie: [149.9, 89.91, 89.91, 89.91, 89.91, 89.91],
    nota: 'alta con prorrateo en el primer ciclo, luego estable'
  },
  {
    cliente: '130857463',
    serie: [120, 60.01, 60.01, 60.01, 60.01, 60.01],
    nota: 'baja a la mitad tras el primer ciclo'
  },
  {
    cliente: '128757351',
    serie: [39.9, 39.9, 39.9, 39.9, 39.98, 39.99],
    nota: 'estable: el -163.28 que se reportaba eran bonos huérfanos'
  },
  {
    cliente: '58013061',
    serie: [77.89, 77.89, 74.94, 54.53, 39.99, 39.99],
    nota: 'reconexión y cambio de plan; sin notas de crédito reales'
  },
  {
    cliente: '125420001',
    serie: [79.9, 79.9, 79.9, 79.9, 79.9, 84.48],
    causaPrincipal: 'RECONEXION',
    variacion: 4.58,
    nota: 'reconexión limpia de S/ 4.58 sobre una serie plana'
  },
  {
    cliente: '123165012',
    serie: [34.95, 34.95, 34.95, 34.95, 34.95, 49.89],
    // Dos causas a la vez: el plan bajó de S/69.90 a S/49.89 (-20.01) pero se
    // acabó el descuento de campaña de -34.95 (+34.95). Manda el descuento.
    causaPrincipal: 'FIN_DESCUENTO',
    variacion: 14.94,
    nota: 'fin de campaña VEN A MOVISTAR sumado a migración de plan'
  }
];

test('data real: los 6 ciclos y totales coinciden con el ground truth', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  for (const caso of GROUND_TRUTH) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, caso.cliente);

    assert.equal(hechos.encontrado, true, `${caso.cliente} debería existir`);
    assert.equal(hechos.historial.length, 6, `${caso.cliente} debe tener 6 ciclos`);

    // El historial va del más reciente al más antiguo; la serie, al revés.
    const totales = hechos.historial.map((h) => h.total).reverse();
    assert.deepEqual(totales, caso.serie, `serie de ${caso.cliente} (${caso.nota})`);
  }
});

test('data real: ningún recibo del ground truth sale negativo', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  for (const caso of GROUND_TRUTH) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, caso.cliente);
    const negativos = hechos.historial.filter((h) => h.total < 0);

    assert.deepEqual(negativos, [], `${caso.cliente} no debería tener recibos negativos`);
  }
});

test('data real: la causa principal detectada es la esperada', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  for (const caso of GROUND_TRUTH.filter((c) => c.causaPrincipal)) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, caso.cliente);

    assert.ok(hechos.causas.length > 0, `${caso.cliente} debería tener alguna causa`);
    assert.equal(hechos.causas[0].codigo, caso.causaPrincipal, `causa de ${caso.cliente}`);

    if (caso.variacion !== undefined) {
      assert.equal(hechos.variacion.monto, caso.variacion, `variación de ${caso.cliente}`);
    }
  }
});

test('data real: un recibo con dos causas las reporta ordenadas por impacto', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  const hechos = await obtenerHechosDeCliente(DATA_DIR, '123165012');

  assert.equal(hechos.causas.length, 2);
  assert.deepEqual(hechos.causas.map((c) => c.codigo), ['FIN_DESCUENTO', 'CAMBIO_PLAN']);
  assert.equal(hechos.causas[0].impacto, 34.95);
  assert.equal(hechos.causas[1].impacto, -20.01);
  // Las dos causas se compensan hasta dar la variación real del recibo.
  assert.equal(hechos.variacion.monto, 14.94);
});

test('data real: la reconexión se detecta por GRUPO, no por el código del cargo', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  // 125420001 cobra la reconexión como FRIORX_001, no como OC1_RECONEXION:
  // clasificar por prefijo de código se la habría perdido.
  const hechos = await obtenerHechosDeCliente(DATA_DIR, '125420001');

  assert.equal(hechos.causas[0].codigo, 'RECONEXION');
  assert.equal(hechos.causas[0].conceptos[0].codigo, 'FRIORX_001');
});

test('data real: un recibo estable no inventa causas', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  // 48799623 cerró 74.89 tres ciclos seguidos: no hay nada que explicar.
  const hechos = await obtenerHechosDeCliente(DATA_DIR, '48799623');

  assert.equal(hechos.variacion.monto, 0);
  assert.equal(hechos.variacion.direccion, 'SIN_CAMBIO');
  assert.deepEqual(hechos.causas, []);
});

test('data real: cicloObjetivo explica un recibo viejo, no solo el último', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  // "¿Por qué mi recibo de marzo salió 429.89?" → S/ 343.99 de AMERICATEL.
  const hechos = await obtenerHechosDeCliente(DATA_DIR, '48799623', { cicloObjetivo: '20260331' });

  assert.equal(hechos.encontrado, true);
  assert.equal(hechos.reciboActual.ciclo, '20260331');
  assert.equal(hechos.reciboActual.total, 429.89);
  assert.equal(hechos.reciboAnterior.total, 85.9);
  assert.equal(hechos.variacion.monto, 343.99);
  assert.equal(hechos.causas[0].codigo, 'CARGO_TERCEROS');
  assert.equal(hechos.causas[0].impacto, 343.99);
  assert.match(hechos.causas[0].conceptos[0].descripcion, /AMERICATEL/);
});

test('data real: un ciclo que el cliente no tuvo no se inventa', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  const hechos = await obtenerHechosDeCliente(DATA_DIR, '48799623', { cicloObjetivo: '20991231' });

  assert.equal(hechos.encontrado, false);
  assert.equal(hechos.motivo, 'CICLO_NO_ENCONTRADO');
  assert.ok(hechos.ciclosDisponibles.includes('20260331'));
});

test('data real: adjunta la ficha de servicio del cliente', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  const { obtenerFichaDeServicio } = require('../services/cargosRepository');

  // 130857463 figura en PLANTA CLIENTES como TV.
  const ficha = await obtenerFichaDeServicio(DATA_DIR, '130857463');

  assert.ok(ficha, 'el cliente debería estar en la planta');
  assert.deepEqual(ficha.servicios, ['TV']);
  assert.ok(ficha.antiguedadMeses > 0, 'debería calcular la antigüedad');

  // Y viaja dentro del bloque de hechos.
  const hechos = await obtenerHechosDeCliente(DATA_DIR, '130857463');
  assert.deepEqual(hechos.servicio.servicios, ['TV']);
});

test('data real: un cliente fuera de la planta no inventa servicios', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  const { obtenerFichaDeServicio } = require('../services/cargosRepository');

  assert.equal(await obtenerFichaDeServicio(DATA_DIR, 'NO_EXISTE'), null);
  assert.equal(await obtenerFichaDeServicio(DATA_DIR, ''), null);
});

test('data real: INVARIANTE de cuadre sobre una muestra amplia de clientes', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  const clientes = await require('../services/cargosRepository')
    .listarClientesConHistorial(DATA_DIR, 6, 300);

  assert.ok(clientes.length >= 100, 'debería haber cientos de clientes con 6 ciclos');

  for (const { cliente } of clientes) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, cliente);
    const sumaCausas = hechos.causas.reduce((suma, c) => suma + c.impacto, 0);

    assert.equal(
      Math.round(sumaCausas * 100) / 100,
      hechos.variacion.monto,
      `las causas de ${cliente} no explican su variación`
    );
  }
});
