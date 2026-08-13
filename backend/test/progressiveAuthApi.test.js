process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

const {
  clearAuthSessions
} = require('../services/authService');

function officialExperience(
  user
) {
  return {
    schemaVersion:
      'desafio1-demo-experience-v1',
    dataSource:
      'DESAFIO1_OFFICIAL_LOCAL',
    customer: {
      customerId:
        user.customerId,
      name: user.name,
      plan:
        'Plan demo oficial',
      demoScenario:
        'RECONNECTION',
      demoScenarioLabel:
        'Reconexión'
    },
    currentBill: {
      period:
        'Ciclo 27/07/2026',
      total: 34.48,
      status: 'Pendiente',
      dueDate: null,
      items: []
    },
    previousBill: {
      period:
        'Ciclo 27/06/2026',
      total: 29.9,
      status: 'Pendiente',
      dueDate: null,
      items: []
    },
    comparison: {
      difference: 4.58,
      percentage: 15.3,
      direction: 'UP',
      causes: [
        {
          code:
            'RECONNECTION',
          title:
            'Cargo por reconexión',
          description:
            'Se agregó S/ 4.58 por reconexión.',
          impact: 4.58,
          evidenceLevel: 'HIGH'
        }
      ]
    },
    findings: [],
    financialExplanation: {
      status:
        'FULLY_EXPLAINED',
      coveragePercent: 100,
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV',
          label:
            'Renta vencida',
          definition:
            'Se factura después de transcurrido.'
        }
      },
      customerFacing: {
        headline:
          'Tu recibo aumentó S/ 4.58',
        summary:
          'Se agregó S/ 4.58 por reconexión.',
        limitations: [
          'El ciclo no se interpreta como fecha de emisión.'
        ]
      }
    },
    nextActions: []
  };
}

function createFakeOfficialService() {
  const calls = [];

  return {
    calls,
    async getExperienceForUser(
      user
    ) {
      calls.push(
        user.customerId
      );
      return officialExperience(
        user
      );
    }
  };
}

function startServer(
  officialDemoExperienceService
) {
  const app =
    createApp({
      officialDemoExperienceService
    });

  return new Promise(
    (resolve) => {
      const server =
        app.listen(
          0,
          '127.0.0.1',
          () => resolve(server)
        );
    }
  );
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

async function demoLogin(
  port,
  customerId = 'CLI000001'
) {
  const response =
    await fetch(
      `http://127.0.0.1:${port}/api/auth/demo-login`,
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

  return getCookie(response);
}


test(
  'las respuestas API no se cachean entre cambios de sesión demo',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const anonymous =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/me`
        );

      assert.equal(
        anonymous.status,
        401
      );
      assert.match(
        anonymous.headers.get(
          'cache-control'
        ) || '',
        /no-store/i
      );

      const cookie =
        await demoLogin(
          port,
          'CLI000004'
        );

      const authenticated =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/me`,
          {
            headers: {
              Cookie: cookie
            }
          }
        );

      const data =
        await authenticated.json();

      assert.equal(
        authenticated.status,
        200
      );
      assert.equal(
        data.user.customerId,
        'CLI000004'
      );
      assert.match(
        authenticated.headers.get(
          'cache-control'
        ) || '',
        /no-store/i
      );
    } finally {
      server.close();
    }
  }
);

test(
  'Lucía responde una definición general sin login ni datos oficiales',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
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
                'progressive-auth-general'
            })
          }
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.source,
        'DESAFIO1_EDUCATION_DETERMINISTIC'
      );
      assert.match(
        data.reply,
        /cobro proporcional/i
      );
      assert.equal(
        official.calls.length,
        0
      );
    } finally {
      server.close();
    }
  }
);


test(
  'Lucía pública pide login antes de consultar un recibo personal',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
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
                'progressive-auth-public'
            })
          }
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.requiresAuth,
        true
      );
      assert.match(
        data.authUrl,
        /^\/login\?returnTo=/
      );
      assert.equal(
        official.calls.length,
        0
      );
    } finally {
      server.close();
    }
  }
);

test(
  'después del login la misma consulta usa el motor oficial determinista',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const cookie =
        await demoLogin(port);

      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                '¿Por qué subió mi recibo?',
              sessionId:
                'progressive-auth-private'
            })
          }
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.foundData,
        true
      );
      assert.equal(
        data.source,
        'DESAFIO1_DETERMINISTIC'
      );
      assert.equal(
        data.financialReasoningByLlm,
        false
      );
      assert.match(
        data.reply,
        /S\/ 4\.58/
      );
      assert.deepEqual(
        official.calls,
        ['CLI000001']
      );
    } finally {
      server.close();
    }
  }
);

test(
  'una consulta autenticada por tipo de renta usa el motor oficial determinista',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const cookie =
        await demoLogin(
          port,
          'CLI000002'
        );

      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                '¿Qué tipo de renta tengo?',
              sessionId:
                'progressive-auth-rent-type'
            })
          }
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.source,
        'DESAFIO1_DETERMINISTIC'
      );
      assert.equal(
        data.financialReasoningByLlm,
        false
      );
      assert.match(
        data.reply,
        /Renta vencida \(RV\)/
      );
      assert.deepEqual(
        official.calls,
        ['CLI000002']
      );
    } finally {
      server.close();
    }
  }
);

test(
  'Mi Movistar obtiene la experiencia oficial a partir del alias autenticado',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const cookie =
        await demoLogin(port);

      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/app/me`,
          {
            headers: {
              Cookie: cookie
            }
          }
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.dataSource,
        'DESAFIO1_OFFICIAL_LOCAL'
      );
      assert.equal(
        data.customer.customerId,
        'CLI000001'
      );
      assert.equal(
        data.currentBill.total,
        34.48
      );
    } finally {
      server.close();
    }
  }
);

test(
  'login autenticado respeta returnTo local hacia el chat',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const cookie =
        await demoLogin(port);

      const response =
        await fetch(
          `http://127.0.0.1:${port}/login?returnTo=${encodeURIComponent('/chat?resume=1')}`,
          {
            redirect: 'manual',
            headers: {
              Cookie: cookie
            }
          }
        );

      assert.equal(
        response.status,
        302
      );
      assert.equal(
        response.headers.get(
          'location'
        ),
        '/chat?resume=1'
      );
    } finally {
      server.close();
    }
  }
);

test(
  'returnTo externo se descarta para evitar redirecciones abiertas',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const cookie =
        await demoLogin(port);

      const response =
        await fetch(
          `http://127.0.0.1:${port}/login?returnTo=${encodeURIComponent('//evil.example')}`,
          {
            redirect: 'manual',
            headers: {
              Cookie: cookie
            }
          }
        );

      assert.equal(
        response.headers.get(
          'location'
        ),
        '/app'
      );
    } finally {
      server.close();
    }
  }
);

test(
  'si la autenticación desaparece el chat no reutiliza el cliente de una sesión anterior',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const cookie =
        await demoLogin(
          port,
          'CLI000001'
        );

      const bindResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/session/phase8-stale-auth/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              customerId:
                'CLI000001'
            })
          }
        );

      assert.equal(
        bindResponse.status,
        200
      );

      // Simula reinicio del backend o expiración de la
      // sesión auth mientras el tab de Lucía sigue abierto.
      clearAuthSessions();

      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                '¿Por qué subió mi recibo?',
              sessionId:
                'phase8-stale-auth'
            })
          }
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.requiresAuth,
        true
      );
      assert.equal(
        data.foundData,
        false
      );
      assert.notEqual(
        data.sessionId,
        'phase8-stale-auth'
      );
      assert.deepEqual(
        official.calls,
        []
      );
    } finally {
      server.close();
    }
  }
);

test(
  'cambiar de perfil autenticado rota el chatSessionId antes de asociar al nuevo cliente',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const carlosCookie =
        await demoLogin(
          port,
          'CLI000001'
        );

      const firstBind =
        await fetch(
          `http://127.0.0.1:${port}/api/session/phase8-profile-switch/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: carlosCookie
            },
            body: JSON.stringify({
              customerId:
                'CLI000001'
            })
          }
        );

      assert.equal(
        firstBind.status,
        200
      );

      const anaCookie =
        await demoLogin(
          port,
          'CLI000002'
        );

      const secondBind =
        await fetch(
          `http://127.0.0.1:${port}/api/session/phase8-profile-switch/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: anaCookie
            },
            body: JSON.stringify({
              customerId:
                'CLI000002'
            })
          }
        );

      const bindData =
        await secondBind.json();

      assert.equal(
        secondBind.status,
        200
      );
      assert.equal(
        bindData.customerId,
        'CLI000002'
      );
      assert.equal(
        bindData.identitySessionRotated,
        true
      );
      assert.notEqual(
        bindData.sessionId,
        'phase8-profile-switch'
      );

      const chatResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: anaCookie
            },
            body: JSON.stringify({
              message:
                '¿Por qué subió mi recibo?',
              sessionId:
                bindData.sessionId
            })
          }
        );

      const chatData =
        await chatResponse.json();

      assert.equal(
        chatData.source,
        'DESAFIO1_DETERMINISTIC'
      );
      assert.deepEqual(
        official.calls,
        ['CLI000002']
      );
    } finally {
      server.close();
    }
  }
);

test(
  'un handoff sin autenticación no reutiliza la identidad personal que quedó en el chat',
  async () => {
    clearAuthSessions();
    const official =
      createFakeOfficialService();
    const server =
      await startServer(official);
    const { port } =
      server.address();

    try {
      const cookie =
        await demoLogin(
          port,
          'CLI000001'
        );

      await fetch(
        `http://127.0.0.1:${port}/api/session/phase8-stale-handoff/customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Cookie: cookie
          },
          body: JSON.stringify({
            customerId:
              'CLI000001'
          })
        }
      );

      clearAuthSessions();

      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                'Quiero hablar con un asesor',
              sessionId:
                'phase8-stale-handoff'
            })
          }
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.ok(
        data.handoff?.caseId
      );
      assert.equal(
        data.foundData,
        false
      );
      assert.notEqual(
        data.sessionId,
        'phase8-stale-handoff'
      );
      assert.deepEqual(
        official.calls,
        []
      );
    } finally {
      server.close();
    }
  }
);
