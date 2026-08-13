process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_demo_smoke_placeholder';

const {
  createApp
} = require('../server');

const {
  clearAuthSessions
} = require('../services/authService');

function createCheckRunner() {
  const results = [];

  async function check(
    name,
    task
  ) {
    try {
      await task();
      results.push({
        name,
        ok: true
      });
      console.log(`✅ ${name}`);
    } catch (error) {
      results.push({
        name,
        ok: false,
        error:
          error?.message ||
          String(error)
      });
      console.log(`❌ ${name}`);
      console.log(
        `   ${error?.message || error}`
      );
    }
  }

  return {
    check,
    results
  };
}

function ensure(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response) {
  const text =
    await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
      : null;
  } catch (error) {
    throw new Error(
      `Respuesta no JSON (${response.status}): ${text.slice(0, 180)}`
    );
  }

  return data;
}

function getCookie(response) {
  const setCookie =
    response.headers.get(
      'set-cookie'
    );

  return setCookie
    ? setCookie.split(';')[0]
    : null;
}

async function requestJson(
  baseUrl,
  pathname,
  options = {}
) {
  const response =
    await fetch(
      `${baseUrl}${pathname}`,
      options
    );

  const data =
    await readJson(response);

  return {
    response,
    data
  };
}

async function loginDemo(
  baseUrl,
  customerId
) {
  const {
    response,
    data
  } = await requestJson(
    baseUrl,
    '/api/auth/demo-login',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        customerId
      })
    }
  );

  ensure(
    response.ok,
    `Login demo falló para ${customerId}: ${data?.error || response.status}`
  );

  const cookie =
    getCookie(response);

  ensure(
    cookie,
    `No se recibió cookie para ${customerId}`
  );

  return cookie;
}

function personalPromptForScenario(
  scenario
) {
  const prompts = {
    RECONNECTION:
      '¿Por qué subió mi recibo?',
    PRORATION:
      'Explícame mi prorrateo',
    DISCOUNT_ENDED:
      '¿Por qué subió mi recibo?',
    PLAN_CHANGE:
      '¿Por qué cambió mi recibo?'
  };

  return prompts[scenario] ||
    'Explícame mi recibo';
}

async function main() {
  clearAuthSessions();

  const app = createApp();
  const server =
    await new Promise(
      (resolve) => {
        const instance =
          app.listen(
            0,
            '127.0.0.1',
            () => resolve(instance)
          );
      }
    );

  const { port } =
    server.address();

  const baseUrl =
    `http://127.0.0.1:${port}`;

  const runner =
    createCheckRunner();

  let readiness = null;
  let firstProfileCookie = null;
  let firstProfile = null;
  let handoffSessionId = null;

  console.log(
    '\n==================================================='
  );
  console.log(
    '  RELEASE 1 · SMOKE TEST END-TO-END'
  );
  console.log(
    '===================================================\n'
  );

  try {
    await runner.check(
      'Health del backend',
      async () => {
        const {
          response,
          data
        } = await requestJson(
          baseUrl,
          '/health'
        );

        ensure(
          response.ok && data?.ok,
          'El endpoint /health no respondió OK.'
        );
      }
    );

    await runner.check(
      'Preflight del Release 1',
      async () => {
        const {
          response,
          data
        } = await requestJson(
          baseUrl,
          '/api/demo/release/readiness'
        );

        ensure(
          response.ok,
          `Preflight HTTP ${response.status}`
        );
        ensure(
          data?.ready === true,
          'El preflight reporta REVIEW_REQUIRED.'
        );

        readiness = data;
        firstProfile =
          data.profiles?.[0] || null;

        ensure(
          data.profiles?.length >= 2,
          'Se esperaban al menos dos perfiles demo listos.'
        );
      }
    );

    await runner.check(
      'Lucía pública responde educación sin login',
      async () => {
        const {
          response,
          data
        } = await requestJson(
          baseUrl,
          '/api/chat',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              message:
                '¿Qué es un prorrateo?',
              sessionId:
                'release-smoke-public-education'
            })
          }
        );

        ensure(
          response.ok,
          `Chat público HTTP ${response.status}`
        );
        ensure(
          data?.source ===
            'DESAFIO1_EDUCATION_DETERMINISTIC',
          'La definición general no usó la respuesta determinista esperada.'
        );
      }
    );

    await runner.check(
      'Consulta personal anónima exige autenticación',
      async () => {
        const {
          response,
          data
        } = await requestJson(
          baseUrl,
          '/api/chat',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              message:
                '¿Por qué subió mi recibo?',
              sessionId:
                'release-smoke-public-private'
            })
          }
        );

        ensure(
          response.ok &&
            data?.requiresAuth === true,
          'La consulta personal no solicitó login.'
        );
      }
    );

    if (readiness) {
      for (
        const [index, profile]
        of readiness.profiles.entries()
      ) {
        await runner.check(
          `${profile.name || profile.customerId}: Mi Movistar usa el caso oficial ${profile.scenario}`,
          async () => {
            const cookie =
              await loginDemo(
                baseUrl,
                profile.customerId
              );

            if (index === 0) {
              firstProfileCookie =
                cookie;
            }

            const {
              response,
              data
            } = await requestJson(
              baseUrl,
              '/api/app/me',
              {
                headers: {
                  Cookie: cookie
                }
              }
            );

            ensure(
              response.ok,
              `Mi Movistar HTTP ${response.status}`
            );
            ensure(
              data?.dataSource ===
                'DESAFIO1_OFFICIAL_LOCAL',
              'Mi Movistar no está usando la fuente oficial local.'
            );
            ensure(
              data?.customer
                ?.demoScenario ===
                profile.scenario,
              'El escenario visible no coincide con el preflight.'
            );

            if (
              profile.scenario ===
              'PRORATION'
            ) {
              ensure(
                data.previousBill === null,
                'El caso de prorrateo no debería inventar recibo anterior.'
              );
              ensure(
                data.findings?.some(
                  (finding) =>
                    finding.code ===
                      'PRORATION' &&
                    finding
                      .impactPresentation ===
                      'INCLUDED_IN_TOTAL'
                ),
                'No se encontró el prorrateo marcado como incluido en el total.'
              );
            }
          }
        );

        await runner.check(
          `${profile.name || profile.customerId}: Lucía usa respuesta financiera determinista`,
          async () => {
            const cookie =
              await loginDemo(
                baseUrl,
                profile.customerId
              );

            const {
              response,
              data
            } = await requestJson(
              baseUrl,
              '/api/chat',
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                  Cookie: cookie
                },
                body: JSON.stringify({
                  message:
                    personalPromptForScenario(
                      profile.scenario
                    ),
                  sessionId:
                    `release-smoke-${profile.customerId}`
                })
              }
            );

            ensure(
              response.ok,
              `Lucía HTTP ${response.status}`
            );
            ensure(
              data?.source ===
                'DESAFIO1_DETERMINISTIC',
              'La consulta financiera no usó el motor determinista.'
            );
            ensure(
              data
                ?.financialReasoningByLlm ===
                false,
              'La respuesta no declaró la salvaguarda financiera.'
            );
            ensure(
              !/\bbrainy\b/i.test(
                data?.reply || ''
              ),
              'La respuesta expuso un nombre interno.'
            );
          }
        );
      }
    }

    await runner.check(
      'Handoff conserva contexto del primer perfil',
      async () => {
        ensure(
          firstProfile &&
            firstProfileCookie,
          'No hay primer perfil disponible para probar handoff.'
        );

        handoffSessionId =
          `release-smoke-handoff-${Date.now()}`;

        const firstPrompt =
          personalPromptForScenario(
            firstProfile.scenario
          );

        await requestJson(
          baseUrl,
          '/api/chat',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie:
                firstProfileCookie
            },
            body: JSON.stringify({
              message: firstPrompt,
              sessionId:
                handoffSessionId
            })
          }
        );

        const {
          response,
          data
        } = await requestJson(
          baseUrl,
          '/api/chat',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie:
                firstProfileCookie
            },
            body: JSON.stringify({
              message:
                'No estoy de acuerdo, quiero hablar con un asesor',
              sessionId:
                handoffSessionId
            })
          }
        );

        ensure(
          response.ok &&
            data?.handoff?.caseId,
          'No se generó un caso de handoff.'
        );

        const caseResponse =
          await requestJson(
            baseUrl,
            `/api/advisor/cases/${encodeURIComponent(data.handoff.caseId)}`
          );

        ensure(
          caseResponse.response.ok,
          'El asesor no pudo abrir el caso generado.'
        );
        ensure(
          caseResponse.data
            ?.advisorSummary,
          'El caso no contiene resumen para el asesor.'
        );
      }
    );

    await runner.check(
      'Dashboard registra la derivación del smoke test',
      async () => {
        const {
          response,
          data
        } = await requestJson(
          baseUrl,
          '/api/metrics/dashboard'
        );

        ensure(
          response.ok,
          `Dashboard HTTP ${response.status}`
        );
        ensure(
          Number(
            data?.handoffInteractions
          ) >= 1,
          'El dashboard no registró el handoff ejecutado.'
        );
      }
    );
  } finally {
    await new Promise(
      (resolve) =>
        server.close(resolve)
    );
  }

  const passed =
    runner.results.filter(
      (item) => item.ok
    ).length;

  const failed =
    runner.results.length - passed;

  console.log(
    '\n---------------------------------------------------'
  );
  console.log(
    `Resultado: ${passed}/${runner.results.length} controles OK`
  );

  if (failed) {
    console.log(
      `❌ ${failed} control(es) fallaron. No congeles el Release 1 todavía.`
    );
    process.exitCode = 1;
  } else {
    console.log(
      '🎉 Smoke test completo. Release 1 listo para ensayo de pitch.'
    );
  }
}

main().catch(
  (error) => {
    console.error(
      '\n❌ Smoke test abortado:',
      error?.stack || error
    );
    process.exitCode = 1;
  }
);
