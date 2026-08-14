process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server');
const {
  resetHandoffCases,
  obtenerCaso
} = require('../services/handoffService');
const {
  resetSession,
  updateContext,
  getSessionSnapshot
} = require('../services/sessionService');
const {
  resetMetrics
} = require('../services/metricsService');
const {
  clearAuthSessions
} = require('../services/authService');

async function withServer(t, options = {}) {
  const app = createApp(options);
  const server = app.listen(0);

  await new Promise((resolve) => {
    server.once('listening', resolve);
  });

  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      })
  );

  return `http://127.0.0.1:${server.address().port}`;
}

async function sendChat(
  baseUrl,
  sessionId,
  message,
  cookie = null
) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId,
      message
    })
  });

  return {
    response,
    data: await response.json()
  };
}

async function demoLogin(
  baseUrl,
  customerId = 'CLI000001'
) {
  const response = await fetch(
    `${baseUrl}/api/auth/demo-login`,
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

  assert.equal(response.status, 200);

  return String(
    response.headers.get('set-cookie') || ''
  ).split(';')[0];
}

async function associateCustomer(
  baseUrl,
  sessionId,
  cookie,
  customerId = 'CLI000001'
) {
  const response = await fetch(
    `${baseUrl}/api/session/${encodeURIComponent(sessionId)}/customer`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({
        customerId
      })
    }
  );

  return {
    response,
    data: await response.json()
  };
}

function createRepairOfficialService() {
  return {
    async getExperienceForUser(user) {
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
          status:
            'Estado no disponible',
          dueDate: null,
          items: []
        },
        previousBill: {
          period:
            'Ciclo 27/06/2026',
          total: 29.9,
          status:
            'Estado no disponible',
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
              evidenceLevel:
                'HIGH'
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
            limitations: []
          }
        },
        nextActions: []
      };
    }
  };
}

test('consulta técnica inequívoca se deriva automáticamente con regla auditable', async (t) => {
  resetHandoffCases();
  resetMetrics();
  resetSession('phase19-out-of-scope');

  const baseUrl = await withServer(t);
  const { response, data } = await sendChat(
    baseUrl,
    'phase19-out-of-scope',
    'Mi wifi no funciona desde ayer'
  );

  assert.equal(response.status, 200);
  assert.equal(data.handoff.reason, 'OUT_OF_BILLING_SCOPE');

  const caso = obtenerCaso(data.handoff.caseId);
  assert.equal(caso.handoffPolicy.decision, 'TRANSFER_NOW');
  assert.equal(caso.handoffPolicy.trigger, 'OUT_OF_BILLING_SCOPE');
});

test('segunda reformulación consecutiva alcanza el umbral y deriva', async (t) => {
  const sessionId = 'phase19-repeated-repair';

  resetHandoffCases();
  resetMetrics();
  resetSession(sessionId);
  updateContext(sessionId, {
    lastConversationDomain: 'BILLING',
    handoffRepairCount: 1
  });

  const baseUrl = await withServer(t);
  const { data } = await sendChat(
    baseUrl,
    sessionId,
    'Sigo sin entender, explícamelo otra vez'
  );

  assert.equal(data.handoff.reason, 'REPEATED_UNDERSTANDING_FAILURE');
  const caso = obtenerCaso(data.handoff.caseId);
  assert.equal(caso.handoffPolicy.threshold, 2);
  assert.equal(caso.handoffPolicy.observedRepairCount, 2);
});

test('reasociar la misma identidad conserva contexto financiero e intención previa', async (t) => {
  const sessionId =
    'phase19-idempotent-association';

  clearAuthSessions();
  resetHandoffCases();
  resetMetrics();
  resetSession(sessionId);

  const baseUrl = await withServer(
    t,
    {
      officialDemoExperienceService:
        createRepairOfficialService()
    }
  );
  const cookie = await demoLogin(
    baseUrl
  );

  const firstAssociation =
    await associateCustomer(
      baseUrl,
      sessionId,
      cookie
    );

  assert.equal(
    firstAssociation.response.status,
    200
  );
  assert.equal(
    firstAssociation.data
      .conversationContextPreserved,
    false
  );

  const initial = await sendChat(
    baseUrl,
    sessionId,
    '¿Por qué subió mi recibo?',
    cookie
  );

  assert.equal(
    initial.data.source,
    'DESAFIO1_DETERMINISTIC'
  );

  const before =
    getSessionSnapshot(sessionId);
  assert.equal(
    before.context
      .hasOfficialBillingContext,
    true
  );
  assert.equal(
    before.context.lastBillingIntent,
    'EXPLANATION'
  );

  const secondAssociation =
    await associateCustomer(
      baseUrl,
      sessionId,
      cookie
    );

  assert.equal(
    secondAssociation.response.status,
    200
  );
  assert.equal(
    secondAssociation.data
      .conversationContextPreserved,
    true
  );

  const after =
    getSessionSnapshot(sessionId);
  assert.equal(
    after.context
      .hasOfficialBillingContext,
    true
  );
  assert.equal(
    after.context.lastBillingIntent,
    'EXPLANATION'
  );
});

test('flujo real conserva la reparación financiera y deriva recién en el segundo intento', async (t) => {
  const sessionId =
    'phase19-repair-e2e';

  clearAuthSessions();
  resetHandoffCases();
  resetMetrics();
  resetSession(sessionId);

  const baseUrl = await withServer(
    t,
    {
      officialDemoExperienceService:
        createRepairOfficialService()
    }
  );
  const cookie = await demoLogin(
    baseUrl
  );

  await associateCustomer(
    baseUrl,
    sessionId,
    cookie
  );

  const initial = await sendChat(
    baseUrl,
    sessionId,
    '¿Por qué subió mi recibo?',
    cookie
  );

  assert.equal(
    initial.data.source,
    'DESAFIO1_DETERMINISTIC'
  );
  assert.equal(
    initial.data.handoff,
    undefined
  );

  // chat.js revalida /api/session/:id/customer antes de
  // cada envío. Esa revalidación no debe destruir el contexto
  // financiero que acaba de establecer el turno anterior.
  await associateCustomer(
    baseUrl,
    sessionId,
    cookie
  );

  const firstRepair = await sendChat(
    baseUrl,
    sessionId,
    'No entendí, explícamelo más fácil',
    cookie
  );

  assert.equal(
    firstRepair.data.source,
    'DESAFIO1_DETERMINISTIC'
  );
  assert.equal(
    firstRepair.data.handoff,
    undefined
  );
  assert.match(
    firstRepair.data.reply,
    /S\/ 4\.58|reconexión/i
  );

  await associateCustomer(
    baseUrl,
    sessionId,
    cookie
  );

  const secondRepair = await sendChat(
    baseUrl,
    sessionId,
    'Sigo sin entender, explícamelo otra vez',
    cookie
  );

  assert.equal(
    secondRepair.data.handoff.reason,
    'REPEATED_UNDERSTANDING_FAILURE'
  );

  const caso = obtenerCaso(
    secondRepair.data.handoff.caseId
  );
  assert.equal(
    caso.handoffPolicy.threshold,
    2
  );
  assert.equal(
    caso.handoffPolicy.observedRepairCount,
    2
  );
});

test('solicitud explícita de asesor conserva compatibilidad con CLIENT_REQUEST', async (t) => {
  resetHandoffCases();
  resetMetrics();
  resetSession('phase19-explicit');

  const baseUrl = await withServer(t);
  const { data } = await sendChat(
    baseUrl,
    'phase19-explicit',
    'Quiero hablar con un asesor'
  );

  assert.equal(data.handoff.reason, 'CLIENT_REQUEST');
  assert.match(data.reply, /Generé el caso/i);
});
