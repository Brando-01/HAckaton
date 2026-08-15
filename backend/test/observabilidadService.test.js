/**
 * Métricas del Desafío 1.
 *
 * Lo que más importa acá no es que las cifras se calculen, sino que se
 * calculen HONESTAMENTE. Una tasa de alucinación con el denominador mal
 * elegido se ve mejor y no significa nada, y ante un jurado eso se nota.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  registrarTurno,
  calcularResumen,
  exportarRegistros,
  reiniciarObservabilidad,
  ORIGENES
} = require('../services/observabilidadService');

test.beforeEach(() => reiniciarObservabilidad());

/** Turno mínimo, para no repetir campos en cada caso. */
function turno(campos) {
  return registrarTurno({
    sessionId: 's1',
    intencion: 'CONSULTA_MONTO',
    confianza: 0.9,
    requiereIdentidad: true,
    autenticado: true,
    bloqueEncontrado: true,
    origenRespuesta: ORIGENES.MOTOR,
    montosEnRespuesta: [84.48],
    montosInventados: [],
    latenciaMs: 10,
    ...campos
  });
}

test('sin turnos registrados el resumen no rompe', () => {
  const resumen = calcularResumen();

  assert.equal(resumen.turnos, 0);
  assert.equal(resumen.alucinacion.tasaPorcentaje, 0);
  assert.equal(resumen.recuperacion.precisionPorcentaje, null);
  assert.equal(resumen.handoff.tasaContencionPorcentaje, null);
});

test('el denominador de la alucinación son los turnos CON montos', () => {
  // Un "hola" no puede alucinar cifras. Contarlo bajaría la tasa
  // artificialmente: con 1 alucinación sobre 4 turnos daría 25% en vez del
  // 50% real sobre los 2 turnos que sí mostraron dinero.
  turno({ intencion: 'SALUDO', montosEnRespuesta: [], requiereIdentidad: false });
  turno({ intencion: 'AGRADECIMIENTO', montosEnRespuesta: [], requiereIdentidad: false });
  turno({ montosEnRespuesta: [84.48] });
  turno({ montosEnRespuesta: [99.99], montosInventados: [99.99] });

  const { alucinacion } = calcularResumen();

  assert.equal(alucinacion.turnosConMontos, 2);
  assert.equal(alucinacion.turnosConAlucinacion, 1);
  assert.equal(alucinacion.tasaPorcentaje, 50);
});

test('lo interceptado por el blindaje NO cuenta como alucinación', () => {
  // El modelo lo intentó y el mecanismo lo frenó antes de mostrarlo: eso es
  // el sistema funcionando, no un fallo. Pero queda registrado aparte,
  // porque demuestra que el blindaje actúa de verdad.
  turno({ montosEnRespuesta: [84.48] });
  turno({
    montosEnRespuesta: [84.48],
    montosInventados: [1371.52],
    respuestaReemplazada: true
  });

  const { alucinacion } = calcularResumen();

  assert.equal(alucinacion.tasaPorcentaje, 0, 'ninguna llegó al cliente');
  assert.equal(alucinacion.interceptadasPorElBlindaje, 1);
  assert.deepEqual(alucinacion.montosInterceptados, [1371.52]);
});

test('cuenta las reescrituras del modelo que se descartaron', () => {
  // Misma clase de evidencia que las alucinaciones interceptadas: el modelo
  // intentó algo y el sistema lo frenó antes de que llegara al cliente.
  turno({ pulidoDescartado: 'cambiaron los montos' });
  turno({ pulidoDescartado: 'cambiaron los montos' });
  turno({ pulidoDescartado: 'perdió la pregunta final' });
  turno({});

  const { pulidoDescartado } = calcularResumen();

  assert.equal(pulidoDescartado.total, 3);
  assert.equal(pulidoDescartado.porMotivo['cambiaron los montos'], 2);
  assert.equal(pulidoDescartado.porMotivo['perdió la pregunta final'], 1);
});

test('la precisión de recuperación solo mira turnos que pedían datos', () => {
  turno({ requiereIdentidad: false, bloqueEncontrado: false });      // no cuenta
  turno({ requiereIdentidad: true, autenticado: false });            // no cuenta: sin sesión
  turno({ requiereIdentidad: true, autenticado: true, bloqueEncontrado: true });
  turno({ requiereIdentidad: true, autenticado: true, bloqueEncontrado: true });
  turno({ requiereIdentidad: true, autenticado: true, bloqueEncontrado: false });

  const { recuperacion } = calcularResumen();

  assert.equal(recuperacion.turnosQuePidieronDatos, 3);
  assert.equal(recuperacion.turnosResueltosConDatos, 2);
  assert.equal(recuperacion.precisionPorcentaje, 66.67);
});

test('distingue ofrecer de derivar', () => {
  // Derivar de más también es un error de precisión: ofrecer deja la
  // decisión en el cliente, derivar la ejecuta.
  turno({ derivacion: { accion: 'OFRECER', motivo: 'DISPUTA', regla: 'DISPUTA_PERSISTENTE' } });
  turno({ derivacion: { accion: 'OFRECER', motivo: 'DISPUTA', regla: 'DISPUTA_PERSISTENTE' } });
  turno({ derivacion: { accion: 'DERIVAR', motivo: 'CLIENT_REQUEST', regla: 'PETICION_EXPLICITA' } });

  const { handoff } = calcularResumen();

  assert.equal(handoff.ofrecimientos, 2);
  assert.equal(handoff.derivaciones, 1);
  assert.equal(handoff.porRegla.DISPUTA_PERSISTENTE, 2);
  assert.equal(handoff.porRegla.PETICION_EXPLICITA, 1);
  assert.equal(handoff.porMotivo.CLIENT_REQUEST, 1);
});

test('la tasa de contención se mide por sesión, no por turno', () => {
  // El indicador de impacto: sesiones resueltas sin pasar por un humano.
  turno({ sessionId: 'a' });
  turno({ sessionId: 'a' });
  turno({ sessionId: 'b' });
  turno({ sessionId: 'c' });
  turno({ sessionId: 'c', derivacion: { accion: 'DERIVAR', motivo: 'CLIENT_REQUEST', regla: 'PETICION_EXPLICITA' } });

  const { handoff } = calcularResumen();

  assert.equal(handoff.sesiones, 3);
  assert.equal(handoff.sesionesDerivadas, 1);
  assert.equal(handoff.tasaContencionPorcentaje, 66.67);
});

test('mide la tasa de intenciones no reconocidas', () => {
  turno({ intencion: 'CONSULTA_MONTO' });
  turno({ intencion: 'CONSULTA_VARIACION' });
  turno({ intencion: 'DESCONOCIDA' });
  turno({ intencion: 'DESCONOCIDA' });

  const { intenciones } = calcularResumen();

  assert.equal(intenciones.noReconocidas, 2);
  assert.equal(intenciones.tasaNoReconocidasPorcentaje, 50);
  assert.equal(intenciones.distribucion.CONSULTA_MONTO, 1);
});

test('separa las latencias por origen', () => {
  // Es lo que justifica numéricamente el motor determinista frente al LLM.
  turno({ origenRespuesta: ORIGENES.MOTOR, latenciaMs: 2 });
  turno({ origenRespuesta: ORIGENES.MOTOR, latenciaMs: 4 });
  turno({ origenRespuesta: ORIGENES.LLM, latenciaMs: 800 });
  turno({ origenRespuesta: ORIGENES.LLM, latenciaMs: 1200 });

  const { latenciasMs } = calcularResumen();

  assert.equal(latenciasMs.MOTOR.turnos, 2);
  assert.ok(latenciasMs.MOTOR.p50 <= 4);
  assert.equal(latenciasMs.LLM.turnos, 2);
  assert.ok(latenciasMs.LLM.p50 >= 800);
});

test('exporta los registros del más reciente al más antiguo', () => {
  turno({ intencion: 'PRIMERA' });
  turno({ intencion: 'SEGUNDA' });
  turno({ intencion: 'TERCERA' });

  const registros = exportarRegistros();

  assert.equal(registros.length, 3);
  assert.equal(registros[0].intencion, 'TERCERA');
  assert.equal(registros[2].intencion, 'PRIMERA');
});

test('el export respeta el límite pedido', () => {
  for (let i = 0; i < 10; i += 1) {
    turno({ intencion: `T${i}` });
  }

  assert.equal(exportarRegistros(3).length, 3);
});

test('cada registro guarda lo necesario para auditarlo', () => {
  const registro = turno({
    montosEnRespuesta: [84.48, 79.9],
    montosInventados: [999],
    respuestaReemplazada: true
  });

  assert.ok(registro.momento, 'debe llevar marca de tiempo');
  assert.equal(registro.sessionId, 's1');
  assert.equal(registro.origenRespuesta, ORIGENES.MOTOR);
  assert.deepEqual(registro.montosEnRespuesta, [84.48, 79.9]);
  assert.deepEqual(registro.montosInventados, [999]);
  assert.equal(registro.respuestaReemplazada, true);
});
