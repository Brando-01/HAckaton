const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_RUNTIME_SAMPLES,
  classifyPerformanceRequest,
  recordPerformanceSample,
  getRuntimePerformanceSummary,
  getRuntimePerformanceSamples,
  resetRuntimePerformanceMetrics
} = require('../services/desafio1PerformanceMetrics');

test.beforeEach(() => {
  resetRuntimePerformanceMetrics();
});

test(
  'instrumentación F21 clasifica solo endpoints núcleo conocidos',
  () => {
    assert.equal(
      classifyPerformanceRequest(
        'POST',
        '/api/chat'
      ),
      'LUCIA_CHAT'
    );
    assert.equal(
      classifyPerformanceRequest(
        'POST',
        '/api/channels/whatsapp/inbound'
      ),
      'WHATSAPP_INBOUND'
    );
    assert.equal(
      classifyPerformanceRequest(
        'GET',
        '/api/metrics/dashboard'
      ),
      null
    );
  }
);

test(
  'sessionId dinámico se normaliza por patrón y nunca se guarda',
  () => {
    assert.equal(
      classifyPerformanceRequest(
        'POST',
        '/api/session/s_secret/customer'
      ),
      'SESSION_ASSOCIATION'
    );

    recordPerformanceSample({
      operation:
        'SESSION_ASSOCIATION',
      durationMs: 10,
      statusCode: 200
    });

    assert.equal(
      JSON.stringify(
        getRuntimePerformanceSamples()
      ).includes('s_secret'),
      false
    );
  }
);

test(
  'resumen runtime calcula p50 p95 éxito y breakdown por operación',
  () => {
    const now = 100000;

    [10, 20, 30, 40].forEach(
      (durationMs) =>
        recordPerformanceSample({
          operation:
            'LUCIA_CHAT',
          durationMs,
          statusCode: 200,
          timestamp: now - 100
        })
    );

    const summary =
      getRuntimePerformanceSummary({
        now,
        windowMs: 1000
      });

    assert.equal(summary.sampleCount, 4);
    assert.equal(summary.p50Ms, 20);
    assert.equal(summary.p95Ms, 40);
    assert.equal(summary.successRate, 100);
    assert.equal(summary.operations.length, 1);
  }
);

test(
  'resumen runtime excluye muestras fuera de la ventana local',
  () => {
    recordPerformanceSample({
      operation: 'LUCIA_CHAT',
      durationMs: 50,
      statusCode: 200,
      timestamp: 1000
    });

    const summary =
      getRuntimePerformanceSummary({
        now: 10000,
        windowMs: 1000
      });

    assert.equal(summary.sampleCount, 0);
    assert.equal(summary.p95Ms, null);
  }
);

test(
  'fallo HTTP queda en successRate pero no expone contenido de request',
  () => {
    recordPerformanceSample({
      operation:
        'WHATSAPP_INBOUND',
      durationMs: 22,
      statusCode: 500
    });

    const summary =
      getRuntimePerformanceSummary();

    assert.equal(summary.failureCount, 1);
    assert.equal(summary.successRate, 0);
    assert.equal(
      /message|cookie|customer|session/i
        .test(
          JSON.stringify(summary)
        ),
      false
    );
  }
);

test(
  'buffer runtime se mantiene acotado y no crece indefinidamente',
  () => {
    for (
      let index = 0;
      index <
        MAX_RUNTIME_SAMPLES + 25;
      index += 1
    ) {
      recordPerformanceSample({
        operation: 'LUCIA_CHAT',
        durationMs: index,
        statusCode: 200
      });
    }

    assert.equal(
      getRuntimePerformanceSamples()
        .length,
      MAX_RUNTIME_SAMPLES
    );
  }
);
