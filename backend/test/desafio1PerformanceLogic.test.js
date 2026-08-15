const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePerformanceProfile,
  percentile,
  summarizeOperationSamples,
  summarizeLoadRun,
  evaluateScaleComparison,
  buildPerformanceReport
} = require('../services/desafio1PerformanceLogic');

function successfulResult(
  duration = 100,
  operation = 'LUCIA_CHAT'
) {
  return {
    ok: true,
    samples: [
      {
        operation,
        ok: true,
        timeout: false,
        statusCode: 200,
        durationMs: duration
      }
    ]
  };
}

test(
  'perfil F21 deriva volumen y concurrencia objetivo exactamente a 3x por defecto',
  () => {
    const profile =
      normalizePerformanceProfile();

    assert.equal(
      profile.baselineJourneys,
      8
    );
    assert.equal(
      profile.targetJourneys,
      24
    );
    assert.equal(
      profile.baselineConcurrency,
      4
    );
    assert.equal(
      profile.targetConcurrency,
      12
    );
    assert.equal(
      profile.loadMultiplier,
      3
    );
  }
);

test(
  'perfil F21 conserva defaults reales cuando el CLI entrega flags ausentes como null o vacío',
  () => {
    const profile =
      normalizePerformanceProfile({
        baselineJourneys: null,
        loadMultiplier: null,
        baselineConcurrency: '',
        requestTimeoutMs: null,
        p95CeilingMs: '',
        relativeP95Factor: null,
        throughputFloorRatio: '',
        warmupJourneys: null
      });

    assert.equal(
      profile.baselineJourneys,
      8
    );
    assert.equal(
      profile.targetJourneys,
      24
    );
    assert.equal(
      profile.baselineConcurrency,
      4
    );
    assert.equal(
      profile.targetConcurrency,
      12
    );
    assert.equal(
      profile.loadMultiplier,
      3
    );
    assert.equal(
      profile.requestTimeoutMs,
      8000
    );
    assert.equal(
      profile.p95CeilingMs,
      3000
    );
    assert.equal(
      profile.relativeP95Factor,
      3.5
    );
    assert.equal(
      profile.throughputFloorRatio,
      0.7
    );
    assert.equal(
      profile.warmupJourneys,
      2
    );
  }
);

test(
  'perfil F21 limita valores extremos sin permitir carga cero o negativa',
  () => {
    const profile =
      normalizePerformanceProfile({
        baselineJourneys: -10,
        loadMultiplier: 99,
        baselineConcurrency: 999,
        requestTimeoutMs: 10
      });

    assert.ok(
      profile.baselineJourneys >= 2
    );
    assert.equal(
      profile.loadMultiplier,
      10
    );
    assert.ok(
      profile.baselineConcurrency <=
        profile.baselineJourneys
    );
    assert.equal(
      profile.requestTimeoutMs,
      500
    );
  }
);

test(
  'percentile usa nearest-rank reproducible para p50 y p95',
  () => {
    const values =
      Array.from(
        { length: 20 },
        (_, index) =>
          index + 1
      );

    assert.equal(
      percentile(values, 50),
      10
    );
    assert.equal(
      percentile(values, 95),
      19
    );
  }
);

test(
  'percentile ignora valores no numéricos y devuelve null sin muestra',
  () => {
    assert.equal(
      percentile([], 95),
      null
    );
    assert.equal(
      percentile(
        [null, 'x', 4, 9],
        50
      ),
      4
    );
  }
);

test(
  'resumen por operación separa latencia y tasa de éxito sin guardar payloads',
  () => {
    const summary =
      summarizeOperationSamples([
        {
          operation: 'LUCIA_CHAT',
          ok: true,
          durationMs: 100
        },
        {
          operation: 'LUCIA_CHAT',
          ok: false,
          durationMs: 900
        },
        {
          operation: 'APP_EXPERIENCE',
          ok: true,
          durationMs: 50
        }
      ]);

    const chat =
      summary.find(
        (item) =>
          item.operation ===
          'LUCIA_CHAT'
      );

    assert.equal(chat.requests, 2);
    assert.equal(chat.successRate, 50);
    assert.equal(chat.p95Ms, 100);
    assert.equal(
      JSON.stringify(summary)
        .includes('payload'),
      false
    );
  }
);

test(
  'summarizeLoadRun calcula p50 p95 throughput y corrección sobre operaciones núcleo',
  () => {
    const run =
      summarizeLoadRun({
        label: 'baseline',
        journeys: 2,
        concurrency: 1,
        wallDurationMs: 1000,
        results: [
          successfulResult(100),
          successfulResult(200)
        ]
      });

    assert.equal(
      run.journeySuccessRate,
      100
    );
    assert.equal(run.latency.p50Ms, 100);
    assert.equal(run.latency.p95Ms, 200);
    assert.equal(
      run.throughput.journeysPerSecond,
      2
    );
  }
);

test(
  'una request fallida vuelve visible error y timeout en el resumen',
  () => {
    const run =
      summarizeLoadRun({
        label: '3x',
        journeys: 1,
        concurrency: 1,
        wallDurationMs: 100,
        results: [
          {
            ok: false,
            samples: [
              {
                operation:
                  'WHATSAPP_REPAIR',
                ok: false,
                timeout: true,
                durationMs: 100
              }
            ]
          }
        ]
      });

    assert.equal(run.failedJourneys, 1);
    assert.equal(run.failedRequests, 1);
    assert.equal(run.timeoutRequests, 1);
  }
);

test(
  'evaluación F21 aprueba 3x con cero errores p95 dentro de guarda y throughput estable',
  () => {
    const profile =
      normalizePerformanceProfile();

    const baseline = {
      journeys: 8,
      concurrency: 4,
      failedJourneys: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      journeySuccessRate: 100,
      requestSuccessRate: 100,
      latency: { p95Ms: 400 },
      throughput: {
        journeysPerSecond: 8
      }
    };

    const target = {
      journeys: 24,
      concurrency: 12,
      failedJourneys: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      journeySuccessRate: 100,
      requestSuccessRate: 100,
      latency: { p95Ms: 900 },
      throughput: {
        journeysPerSecond: 7
      }
    };

    const result =
      evaluateScaleComparison({
        profile,
        baseline,
        target
      });

    assert.equal(result.status, 'PASS');
    assert.equal(
      result.passedChecks,
      result.totalChecks
    );
  }
);

test(
  'evaluación F21 queda REVIEW_REQUIRED si 3x pierde corrección aunque sea rápida',
  () => {
    const profile =
      normalizePerformanceProfile();

    const baseline = {
      journeys: 8,
      concurrency: 4,
      failedJourneys: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      journeySuccessRate: 100,
      requestSuccessRate: 100,
      latency: { p95Ms: 100 },
      throughput: {
        journeysPerSecond: 10
      }
    };

    const target = {
      journeys: 24,
      concurrency: 12,
      failedJourneys: 1,
      failedRequests: 1,
      timeoutRequests: 0,
      journeySuccessRate: 95.83,
      requestSuccessRate: 99,
      latency: { p95Ms: 120 },
      throughput: {
        journeysPerSecond: 10
      }
    };

    const result =
      evaluateScaleComparison({
        profile,
        baseline,
        target
      });

    assert.equal(
      result.status,
      'REVIEW_REQUIRED'
    );
    assert.ok(
      result.checks.some(
        (check) =>
          check.code ===
            'TARGET_CORRECTNESS_IS_100_PERCENT' &&
          !check.pass
      )
    );
  }
);

test(
  'reporte F21 declara benchmark local y no conserva ids privados por caso',
  () => {
    const profile =
      normalizePerformanceProfile();

    const baseline = {
      journeys: 8,
      concurrency: 4,
      failedJourneys: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      journeySuccessRate: 100,
      requestSuccessRate: 100,
      latency: { p95Ms: 300 },
      throughput: {
        journeysPerSecond: 4
      }
    };

    const target = {
      journeys: 24,
      concurrency: 12,
      failedJourneys: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      journeySuccessRate: 100,
      requestSuccessRate: 100,
      latency: { p95Ms: 700 },
      throughput: {
        journeysPerSecond: 4
      }
    };

    const report =
      buildPerformanceReport({
        profile,
        baseline,
        target
      });

    const serialized =
      JSON.stringify(report);

    assert.equal(report.status, 'PASS');
    assert.match(
      report.scope,
      /NOT_PRODUCTION_SLA/
    );
    assert.equal(
      /CLI000|phase21-(?:baseline|3x|warmup)-\d|movistarAuth=/i
        .test(serialized),
      false
    );
    assert.equal(
      Object.hasOwn(report, 'cases'),
      false
    );
  }
);
