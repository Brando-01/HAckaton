const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { construirBloqueDeHechos } = require('../services/motorDiff');
const {
  narrarBloqueDeHechos,
  construirBloqueParaPrompt,
  verificarMontos,
  extraerMontos,
  blindarRespuesta,
  limpiarDescripcion,
  soles,
  formatearVencimiento
} = require('../services/narradorRecibos');
const { obtenerHechosDeCliente, listarClientesConHistorial, ARCHIVO_CARGOS } = require('../services/cargosRepository');

function cargo(campos) {
  return {
    CUSTOMER_KEY: '12345678',
    FINANCIAL_ACCOUNT_KEY: '900000001',
    LEGAL_INVOICE_NUMBER: 'S1AA-0000000001',
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

const CICLOS = ['20260205', '20260305', '20260405', '20260505', '20260605', '20260705'];

/** Serie plana de 5 ciclos a `monto` más un sexto ciclo con `extras`. */
function bloqueCon(extras, monto = 39.9) {
  const filas = [
    ...CICLOS.slice(0, 5).map((ciclo) => cargo({ ciclo, CHARGE_TOTAL_AMOUNT: String(monto) })),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: String(monto) }),
    ...extras
  ];
  return construirBloqueDeHechos(filas);
}

test('soles formatea siempre con dos decimales y el signo delante', () => {
  assert.equal(soles(39.9), 'S/ 39.90');
  assert.equal(soles(-20.01), '-S/ 20.01');
  assert.equal(soles(0), 'S/ 0.00');
  assert.equal(soles(343.99), 'S/ 343.99');
});

test('formatearVencimiento traduce YYYYMMDD a DD/MM/YYYY', () => {
  assert.equal(formatearVencimiento('20260721'), '21/07/2026');
  assert.equal(formatearVencimiento(''), '');
});

test('limpiarDescripcion quita la tarifa de lista pegada al nombre del cargo', () => {
  // El plan se llama "S/49.9" pero se facturó S/ 49.89: citar el nombre crudo
  // mete en la respuesta una cifra que el bloque de hechos no respalda.
  assert.equal(limpiarDescripcion('RV Plan Porta S/49.9'), 'RV Plan Porta');
  assert.equal(limpiarDescripcion('RV Plan Ilimitado Mi Movistar S/ 77.9_IV'), 'RV Plan Ilimitado Mi Movistar _IV');
  assert.equal(limpiarDescripcion('BONIFICACION DISNEY+ (VR: S/47.37)'), 'BONIFICACION DISNEY+');
  assert.equal(limpiarDescripcion('Bono Ilim Linea Adic 39.9 (VR 60.30)'), 'Bono Ilim Linea Adic 39.9');
  assert.equal(limpiarDescripcion('Cargo por Reconexión'), 'Cargo por Reconexión');
  assert.equal(limpiarDescripcion(''), '');
});

test('extraerMontos solo toma cifras presentadas como soles', () => {
  const texto = 'Tu recibo del 5 de julio de 2026 es de S/ 84.48, subió S/ 4.58 sobre los S/ 79.90 previos. Tienes 100 GB.';

  assert.deepEqual(extraerMontos(texto), [84.48, 4.58, 79.9]);
});

test('extraerMontos entiende el signo negativo y los miles', () => {
  assert.deepEqual(extraerMontos('un ajuste de -S/ 20.01'), [-20.01]);
  assert.deepEqual(extraerMontos('un total de S/ 1,234.56'), [1234.56]);
  assert.deepEqual(extraerMontos('sin cifras de dinero acá'), []);
});

test('narra un recibo sin variación sin inventar causas', () => {
  const bloque = bloqueCon([]);
  const texto = narrarBloqueDeHechos(bloque);

  assert.match(texto, /S\/ 39\.90/);
  assert.match(texto, /no hubo ninguna variación/);
  assert.equal(verificarMontos(texto, bloque).valido, true);
});

test('narra una reconexión explicando la causa y el monto exacto', () => {
  const bloque = bloqueCon([
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'OC1_RECONEXION', CHARGE_CODE_DESC: 'Cargo por Reconexión', GRUPO: 'CARGO POR RECONEXION', CHARGE_TOTAL_AMOUNT: '4.58' })
  ], 79.9);
  const texto = narrarBloqueDeHechos(bloque);

  assert.match(texto, /S\/ 84\.48/);
  assert.match(texto, /subió S\/ 4\.58/);
  assert.match(texto, /reconexión del servicio/);
  assert.equal(verificarMontos(texto, bloque).valido, true);
});

test('narra las dos causas cuando el recibo cambió por más de un motivo', () => {
  const conDescuento = CICLOS.slice(0, 5).flatMap((ciclo) => [
    cargo({ ciclo, CHARGE_TOTAL_AMOUNT: '69.90' }),
    cargo({ ciclo, CHARGE_CODE_ID: 'RCD1_DESPORTR', CHARGE_CODE_DESC: 'Dscto por campaña VEN A MOVISTAR', GRUPO: 'DESCUENTO CARGO RECURRENTE', CHARGE_TOTAL_AMOUNT: '-34.95' })
  ]);
  const bloque = construirBloqueDeHechos([
    ...conDescuento,
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'RC_PLANRE593', CHARGE_CODE_DESC: 'RV Plan Porta S/49.9', CHARGE_TOTAL_AMOUNT: '49.89' })
  ]);

  const texto = narrarBloqueDeHechos(bloque);

  assert.match(texto, /2 motivos/);
  assert.match(texto, /Terminó un descuento/);
  assert.match(texto, /Cambio de plan/);
  assert.equal(verificarMontos(texto, bloque).valido, true);
});

test('avisa del vencimiento solo cuando el recibo está pendiente', () => {
  const conDeuda = bloqueCon([], 39.9);
  conDeuda.reciboActual.deuda = 'CON DEUDA';

  assert.match(narrarBloqueDeHechos(conDeuda), /pendiente de pago.*21\/07\/2026/s);
  assert.match(narrarBloqueDeHechos(bloqueCon([])), /ya figura pagado/);
});

test('sin recibos no inventa nada y ofrece derivar a un asesor', () => {
  const texto = narrarBloqueDeHechos(construirBloqueDeHechos([]));

  assert.match(texto, /No encontré recibos/);
  assert.match(texto, /asesor/);
  assert.deepEqual(extraerMontos(texto), []);
});

test('verificarMontos detecta una cifra que el bloque no respalda', () => {
  const bloque = bloqueCon([]);

  const limpia = verificarMontos('Tu recibo es de S/ 39.90.', bloque);
  assert.equal(limpia.valido, true);
  assert.deepEqual(limpia.inventados, []);

  const sucia = verificarMontos('Tu recibo es de S/ 39.90 y tu plan cuesta S/ 89.90.', bloque);
  assert.equal(sucia.valido, false);
  assert.deepEqual(sucia.inventados, [89.9]);
});

test('verificarMontos acepta el mismo monto con el signo invertido', () => {
  // El bloque guarda la variación como -20.01 y decir "bajó S/ 20.01" es correcto.
  const bloque = construirBloqueDeHechos([
    ...CICLOS.slice(0, 5).map((ciclo) => cargo({ ciclo, CHARGE_TOTAL_AMOUNT: '59.91' })),
    cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '39.90' })
  ]);

  assert.equal(bloque.variacion.monto, -20.01);
  assert.equal(verificarMontos('Tu recibo bajó S/ 20.01.', bloque).valido, true);
});

test('blindarRespuesta deja pasar una respuesta correcta', () => {
  const bloque = bloqueCon([]);
  const resultado = blindarRespuesta('Tu recibo es de S/ 39.90.', bloque);

  assert.equal(resultado.reemplazada, false);
  assert.equal(resultado.texto, 'Tu recibo es de S/ 39.90.');
});

test('blindarRespuesta reemplaza la respuesta que aluciona precios', () => {
  const bloque = bloqueCon([]);
  // Exactamente lo que devolvía el fallback viejo: precios escritos a mano.
  const alucinada = 'Nuestros planes de Fibra son S/ 89.90, S/ 109.90 y S/ 129.90.';

  const resultado = blindarRespuesta(alucinada, bloque);

  assert.equal(resultado.reemplazada, true);
  assert.deepEqual(resultado.verificacion.inventados, [89.9, 109.9, 129.9]);
  assert.notEqual(resultado.texto, alucinada);
  assert.equal(verificarMontos(resultado.texto, bloque).valido, true);
});

test('el bloque para el prompt lista historial, causas y la orden de no recalcular', () => {
  const bloque = bloqueCon([
    cargo({ ciclo: '20260705', CHARGE_CODE_ID: 'OC1_RECONEXION', CHARGE_CODE_DESC: 'Cargo por Reconexión', GRUPO: 'CARGO POR RECONEXION', CHARGE_TOTAL_AMOUNT: '4.58' })
  ], 79.9);

  const prompt = construirBloqueParaPrompt(bloque);

  assert.match(prompt, /NO recalcular/);
  assert.match(prompt, /Recibo actual .*S\/ 84\.48/);
  assert.match(prompt, /Recibo anterior .*S\/ 79\.90/);
  assert.match(prompt, /Cargo por reconexión/i);
  assert.equal((prompt.match(/^- \d+ de \w+ de 2026: S\//gm) || []).length, 6);
});

test('el bloque para el prompt sin datos prohíbe inventar', () => {
  const prompt = construirBloqueParaPrompt(construirBloqueDeHechos([]));

  assert.match(prompt, /No inventes montos/);
});

// --- Harness anti-alucinación sobre la data real ------------------------

const DATA_DIR = path.join(__dirname, '..', 'data');
const HAY_DATA_REAL = fs.existsSync(path.join(DATA_DIR, ARCHIVO_CARGOS));

test('data real: la narración de 200 clientes no contiene ni un monto inventado', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  const clientes = await listarClientesConHistorial(DATA_DIR, 6, 200);
  assert.ok(clientes.length >= 100, 'la muestra debería tener cientos de clientes');

  const fallos = [];

  for (const { cliente } of clientes) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, cliente);
    const texto = narrarBloqueDeHechos(hechos);
    const verificacion = verificarMontos(texto, hechos);

    if (!verificacion.valido) {
      fallos.push({ cliente, inventados: verificacion.inventados });
    }
    // Una narración sin ninguna cifra sería una explicación vacía.
    assert.ok(verificacion.montos.length > 0, `la narración de ${cliente} no menciona ningún monto`);
  }

  assert.deepEqual(fallos, [], `tasa de alucinación distinta de cero en ${fallos.length} de ${clientes.length} clientes`);
});

test('data real: la narración siempre menciona el total del recibo actual', { skip: !HAY_DATA_REAL && 'falta backend/data/' }, async () => {
  const clientes = await listarClientesConHistorial(DATA_DIR, 6, 100);

  for (const { cliente } of clientes) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, cliente);
    const montos = extraerMontos(narrarBloqueDeHechos(hechos));

    assert.ok(
      montos.includes(hechos.reciboActual.total),
      `la narración de ${cliente} no menciona su total de ${hechos.reciboActual.total}`
    );
  }
});
