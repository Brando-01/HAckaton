process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

const {
  resetMetrics
} = require('../services/metricsService');

async function startServer(t) {
  const app =
    createApp({
      requestLogging: false
    });

  const server = app.listen(0);

  await new Promise(
    (resolve) =>
      server.once(
        'listening',
        resolve
      )
  );

  t.after(
    () =>
      new Promise(
        (resolve) =>
          server.close(resolve)
      )
  );

  return server.address().port;
}

test(
  'dashboard expone p50 p95 runtime después de una consulta determinista',
  async (t) => {
    resetMetrics();
    const port =
      await startServer(t);

    const chatResponse =
      await fetch(
        `http://127.0.0.1:${port}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            sessionId:
              'phase21-runtime-api',
            message:
              '¿Qué es un prorrateo?'
          })
        }
      );

    assert.equal(
      chatResponse.status,
      200
    );

    await chatResponse.json();

    const dashboardResponse =
      await fetch(
        `http://127.0.0.1:${port}/api/metrics/dashboard`
      );

    const dashboard =
      await dashboardResponse.json();

    assert.ok(
      dashboard.performance
        .sampleCount >= 1
    );
    assert.equal(
      dashboard.performance
        .operations
        .some(
          (item) =>
            item.operation ===
            'LUCIA_CHAT'
        ),
      true
    );
    assert.ok(
      Number.isFinite(
        dashboard.performance.p95Ms
      )
    );
  }
);

test(
  'consultar el dashboard no se mide a sí mismo ni infla la ventana de rendimiento',
  async (t) => {
    resetMetrics();
    const port =
      await startServer(t);

    await fetch(
      `http://127.0.0.1:${port}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          sessionId:
            'phase21-dashboard-no-self',
          message:
            '¿Qué es un prorrateo?'
        })
      }
    );

    const first =
      await (
        await fetch(
          `http://127.0.0.1:${port}/api/metrics/dashboard`
        )
      ).json();

    const second =
      await (
        await fetch(
          `http://127.0.0.1:${port}/api/metrics/dashboard`
        )
      ).json();

    assert.equal(
      second.performance.sampleCount,
      first.performance.sampleCount
    );
  }
);
