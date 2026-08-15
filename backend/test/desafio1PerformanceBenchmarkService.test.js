const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractCookie,
  performJsonRequest,
  runVirtualJourney,
  runPool
} = require('../services/desafio1PerformanceBenchmarkService');

function response(payload, options = {}) {
  return new Response(
    JSON.stringify(payload),
    {
      status: options.status || 200,
      headers: {
        'content-type':
          'application/json',
        ...(options.cookie
          ? {
              'set-cookie':
                options.cookie
            }
          : {})
      }
    }
  );
}

test(
  'extractCookie conserva solo el par de cookie y no atributos',
  () => {
    const result =
      extractCookie({
        headers: {
          get: () =>
            'movistarAuth=abc; Path=/; HttpOnly'
        }
      });

    assert.equal(
      result,
      'movistarAuth=abc'
    );
  }
);

test(
  'performJsonRequest registra éxito y valida respuesta sin guardar body privado',
  async () => {
    const result =
      await performJsonRequest({
        fetchImpl: async () =>
          response({ ok: true }),
        baseUrl:
          'http://local.test',
        path: '/ok',
        timeoutMs: 1000,
        operation: 'TEST',
        validate: (payload) =>
          payload.ok === true
      });

    assert.equal(result.sample.ok, true);
    assert.equal(result.sample.statusCode, 200);
    assert.equal(
      Object.hasOwn(
        result.sample,
        'payload'
      ),
      false
    );
  }
);

test(
  'performJsonRequest convierte respuesta inválida en código seguro de benchmark',
  async () => {
    const result =
      await performJsonRequest({
        fetchImpl: async () =>
          response({ ok: false }),
        baseUrl:
          'http://local.test',
        path: '/wrong',
        timeoutMs: 1000,
        operation: 'TEST',
        validate: (payload) =>
          payload.ok === true
      });

    assert.equal(result.sample.ok, false);
    assert.equal(
      result.sample.errorCode,
      'RESPONSE_VALIDATION_FAILED'
    );
  }
);

test(
  'runPool respeta límite de concurrencia y produce todos los resultados',
  async () => {
    let active = 0;
    let maximum = 0;

    const results =
      await runPool({
        total: 7,
        concurrency: 2,
        worker: async (index) => {
          active += 1;
          maximum =
            Math.max(maximum, active);

          await new Promise(
            (resolve) =>
              setTimeout(resolve, 5)
          );

          active -= 1;

          return {
            ok: true,
            index,
            samples: []
          };
        }
      });

    assert.equal(results.length, 7);
    assert.ok(maximum <= 2);
  }
);

test(
  'journey F21 recorre App Lucía WhatsApp sobre una sola sesión y sin LLM financiero',
  async () => {
    const visited =
      [
        'MI_MOVISTAR',
        'LUCIA_WEB',
        'WHATSAPP'
      ];

    const fakeFetch =
      async (url, options = {}) => {
        const pathname =
          new URL(url).pathname;

        if (
          pathname ===
          '/api/auth/demo-login'
        ) {
          const body =
            JSON.parse(options.body);

          return response(
            {
              ok: true,
              user: {
                customerId:
                  body.customerId
              }
            },
            {
              cookie:
                'movistarAuth=phase21; Path=/; HttpOnly'
            }
          );
        }

        if (
          /\/api\/session\/[^/]+\/customer$/
            .test(pathname)
        ) {
          return response({
            ok: true,
            sessionId:
              decodeURIComponent(
                pathname.split('/')[3]
              )
          });
        }

        if (
          /\/api\/session\/[^/]+\/channel$/
            .test(pathname)
        ) {
          return response({
            ok: true,
            continuity: {
              visitedChannels: [
                'MI_MOVISTAR'
              ]
            }
          });
        }

        if (pathname === '/api/app/me') {
          return response({
            customer: {
              customerId:
                'CLI000001'
            },
            financialTrace: {
              financialReasoning:
                'DETERMINISTIC'
            }
          });
        }

        if (pathname === '/api/chat') {
          const body =
            JSON.parse(options.body);

          return response({
            sessionId:
              body.sessionId,
            authenticated: true,
            foundData: true,
            financialReasoningByLlm:
              false,
            reply: 'Respuesta',
            continuity: {
              visitedChannels: [
                'MI_MOVISTAR',
                'LUCIA_WEB'
              ]
            }
          });
        }

        if (
          pathname ===
          '/api/channels/whatsapp/inbound'
        ) {
          const body =
            JSON.parse(options.body);

          return response({
            sessionId:
              body.sessionId,
            channel: 'WHATSAPP',
            authenticated: true,
            foundData: true,
            financialReasoningByLlm:
              false,
            reply: 'Respuesta WhatsApp',
            continuity: {
              visitedChannels:
                visited
            }
          });
        }

        if (
          /\/api\/session\/[^/]+\/continuity$/
            .test(pathname)
        ) {
          return response({
            sessionId:
              decodeURIComponent(
                pathname.split('/')[3]
              ),
            continuity: {
              visitedChannels:
                visited
            },
            recentMessages: [
              {}, {}, {}, {}
            ]
          });
        }

        return response(
          { error: 'unexpected' },
          { status: 404 }
        );
      };

    const result =
      await runVirtualJourney({
        baseUrl:
          'http://local.test',
        index: 0,
        runLabel: 'test',
        timeoutMs: 1000,
        fetchImpl: fakeFetch
      });

    assert.equal(result.ok, true);
    assert.equal(result.samples.length, 7);
    assert.deepEqual(
      result.samples
        .map(
          (item) =>
            item.operation
        ),
      [
        'DEMO_LOGIN',
        'SESSION_ASSOCIATION',
        'CHANNEL_TOUCH',
        'APP_EXPERIENCE',
        'LUCIA_CHAT',
        'WHATSAPP_REPAIR',
        'CONTINUITY_READ'
      ]
    );
  }
);
