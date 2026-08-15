process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server');
const {
  clearAuthSessions
} = require('../services/authService');
const {
  resetSession
} = require('../services/sessionService');
const {
  resetHandoffCases,
  obtenerCaso
} = require('../services/handoffService');
const {
  resetMetrics
} = require('../services/metricsService');

async function withServer(t, options = {}) {
  const app = createApp(options);
  const server = app.listen(0);

  await new Promise((resolve) =>
    server.once('listening', resolve)
  );

  t.after(
    () =>
      new Promise((resolve) =>
        server.close(resolve)
      )
  );

  return `http://127.0.0.1:${server.address().port}`;
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ customerId })
    }
  );

  assert.equal(response.status, 200);

  return String(
    response.headers.get('set-cookie') || ''
  ).split(';')[0];
}

async function associate(
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
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({ customerId })
    }
  );

  return {
    response,
    data: await response.json()
  };
}

async function touchAppChannel(
  baseUrl,
  sessionId,
  cookie
) {
  const response = await fetch(
    `${baseUrl}/api/session/${encodeURIComponent(sessionId)}/channel`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({
        channel: 'MI_MOVISTAR'
      })
    }
  );

  return {
    response,
    data: await response.json()
  };
}

async function sendWebChat(
  baseUrl,
  sessionId,
  cookie,
  message
) {
  const response = await fetch(
    `${baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({
        sessionId,
        message,
        channel: 'ADVISOR'
      })
    }
  );

  return {
    response,
    data: await response.json()
  };
}

async function sendWhatsApp(
  baseUrl,
  sessionId,
  cookie,
  message,
  providerMessageId
) {
  const response = await fetch(
    `${baseUrl}/api/channels/whatsapp/inbound`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({
        sessionId,
        message,
        providerMessageId,
        customerId: 'UNTRUSTED',
        phone: '+51999999999'
      })
    }
  );

  return {
    response,
    data: await response.json()
  };
}

function createOfficialService() {
  return {
    async getExperienceForUser(user) {
      return {
        schemaVersion:
          'desafio1-demo-experience-v1',
        dataSource:
          'DESAFIO1_OFFICIAL_LOCAL',
        customer: {
          customerId: user.customerId,
          name: user.name,
          plan: 'Plan demo oficial',
          demoScenario: 'RECONNECTION',
          demoScenarioLabel: 'Reconexión'
        },
        currentBill: {
          period: 'Ciclo 27/07/2026',
          total: 34.48,
          status: 'Estado no disponible',
          dueDate: null,
          items: []
        },
        previousBill: {
          period: 'Ciclo 27/06/2026',
          total: 29.9,
          status: 'Estado no disponible',
          dueDate: null,
          items: []
        },
        comparison: {
          difference: 4.58,
          percentage: 15.3,
          direction: 'UP',
          causes: [
            {
              code: 'RECONNECTION',
              title: 'Cargo por reconexión',
              description:
                'Se agregó S/ 4.58 por reconexión.',
              impact: 4.58,
              evidenceLevel: 'HIGH'
            }
          ]
        },
        findings: [],
        financialExplanation: {
          status: 'FULLY_EXPLAINED',
          coveragePercent: 100,
          rentContext: {
            current: {
              resolved: true,
              rentType: 'RV',
              label: 'Renta vencida',
              definition:
                'Se factura después de transcurrido.'
            }
          },
          customerFacing: {
            headline:
              'Tu recibo aumentó S/ 4.58',
            summary:
              'Se agregó S/ 4.58 por la reconexión de tu servicio.',
            limitations: []
          }
        },
        financialTrace: null,
        nextActions: []
      };
    }
  };
}

function resetRuntime(sessionId) {
  clearAuthSessions();
  resetHandoffCases();
  resetMetrics();
  resetSession(sessionId);
}

test('Mi Movistar → Lucía conserva la misma conversación y no permite falsificar el canal desde /api/chat', async (t) => {
  const sessionId = 'phase20-app-chat';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService()
  });
  const cookie = await demoLogin(baseUrl);

  await associate(
    baseUrl,
    sessionId,
    cookie
  );

  const appTouch = await touchAppChannel(
    baseUrl,
    sessionId,
    cookie
  );
  assert.equal(appTouch.response.status, 200);

  const chat = await sendWebChat(
    baseUrl,
    sessionId,
    cookie,
    '¿Por qué subió mi recibo?'
  );

  assert.equal(chat.response.status, 200);
  assert.equal(chat.data.channel, 'LUCIA_WEB');
  assert.deepEqual(
    chat.data.continuity.visitedChannels,
    ['MI_MOVISTAR', 'LUCIA_WEB']
  );
  assert.equal(
    chat.data.continuity.transitionCount,
    1
  );
});

test('una reformulación puede saltar de Lucía web a WhatsApp sin perder la explicación financiera', async (t) => {
  const sessionId = 'phase20-chat-whatsapp';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService()
  });
  const cookie = await demoLogin(baseUrl);

  await associate(baseUrl, sessionId, cookie);

  const first = await sendWebChat(
    baseUrl,
    sessionId,
    cookie,
    '¿Por qué subió mi recibo?'
  );
  assert.equal(first.data.source, 'DESAFIO1_DETERMINISTIC');

  const repair = await sendWhatsApp(
    baseUrl,
    sessionId,
    cookie,
    'No entendí, explícamelo más fácil',
    'wamid.phase20.1'
  );

  assert.equal(repair.response.status, 200);
  assert.equal(repair.data.channel, 'WHATSAPP');
  assert.equal(repair.data.source, 'DESAFIO1_DETERMINISTIC');
  assert.match(repair.data.reply, /S\/ 4\.58|reconexión/i);
  assert.deepEqual(
    repair.data.continuity.visitedChannels,
    ['LUCIA_WEB', 'WHATSAPP']
  );
  assert.equal(
    repair.data.adapter.liveProviderConnected,
    false
  );
});

test('handoff iniciado desde WhatsApp transfiere la ruta de canales al asesor', async (t) => {
  const sessionId = 'phase20-whatsapp-handoff';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService()
  });
  const cookie = await demoLogin(baseUrl);

  await associate(baseUrl, sessionId, cookie);
  await touchAppChannel(baseUrl, sessionId, cookie);

  await sendWebChat(
    baseUrl,
    sessionId,
    cookie,
    '¿Por qué subió mi recibo?'
  );

  await sendWhatsApp(
    baseUrl,
    sessionId,
    cookie,
    'No entendí, explícamelo más fácil',
    'wamid.phase20.h1'
  );

  const handoff = await sendWhatsApp(
    baseUrl,
    sessionId,
    cookie,
    'Sigo sin entender, explícamelo otra vez',
    'wamid.phase20.h2'
  );

  assert.equal(
    handoff.data.handoff.reason,
    'REPEATED_UNDERSTANDING_FAILURE'
  );

  const caso = obtenerCaso(
    handoff.data.handoff.caseId
  );

  assert.deepEqual(
    caso.omnichannel.visitedChannels,
    [
      'MI_MOVISTAR',
      'LUCIA_WEB',
      'WHATSAPP',
      'ADVISOR'
    ]
  );
  assert.equal(
    caso.omnichannel.currentChannel,
    'ADVISOR'
  );
  assert.equal(
    caso.conversation.at(-1).channel,
    'WHATSAPP'
  );
});

test('un retry de WhatsApp con el mismo providerMessageId no duplica la conversación', async (t) => {
  const sessionId = 'phase20-whatsapp-dedupe';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t);
  const cookie = await demoLogin(baseUrl);
  await associate(baseUrl, sessionId, cookie);

  const first = await sendWhatsApp(
    baseUrl,
    sessionId,
    cookie,
    '¿Qué es un prorrateo?',
    'wamid.phase20.duplicate'
  );
  assert.equal(first.response.status, 200);
  assert.equal(first.data.duplicate, undefined);

  const second = await sendWhatsApp(
    baseUrl,
    sessionId,
    cookie,
    '¿Qué es un prorrateo?',
    'wamid.phase20.duplicate'
  );

  assert.equal(second.response.status, 200);
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.processed, false);

  const continuityResponse = await fetch(
    `${baseUrl}/api/session/${encodeURIComponent(sessionId)}/continuity`,
    { headers: { Cookie: cookie } }
  );
  const continuity = await continuityResponse.json();

  assert.equal(
    continuity.recentMessages.length,
    2
  );
});

test('un retry deduplicado de WhatsApp tampoco filtra continuidad a otra identidad', async (t) => {
  const sessionId = 'phase20-whatsapp-private-dedupe';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t);
  const carlosCookie = await demoLogin(
    baseUrl,
    'CLI000001'
  );

  await associate(
    baseUrl,
    sessionId,
    carlosCookie,
    'CLI000001'
  );

  const first = await sendWhatsApp(
    baseUrl,
    sessionId,
    carlosCookie,
    '¿Qué es un prorrateo?',
    'wamid.phase20.private'
  );

  assert.equal(first.response.status, 200);

  const anaCookie = await demoLogin(
    baseUrl,
    'CLI000002'
  );

  const retry = await sendWhatsApp(
    baseUrl,
    sessionId,
    anaCookie,
    '¿Qué es un prorrateo?',
    'wamid.phase20.private'
  );

  assert.equal(retry.response.status, 403);
  assert.match(
    retry.data.error,
    /no coincide con el cliente autenticado/i
  );
});

test('continuidad autenticada no puede consultarse desde otra identidad', async (t) => {
  const sessionId = 'phase20-private-continuity';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t);
  const carlosCookie = await demoLogin(
    baseUrl,
    'CLI000001'
  );

  await associate(
    baseUrl,
    sessionId,
    carlosCookie,
    'CLI000001'
  );

  const anaCookie = await demoLogin(
    baseUrl,
    'CLI000002'
  );

  const response = await fetch(
    `${baseUrl}/api/session/${encodeURIComponent(sessionId)}/continuity`,
    {
      headers: {
        Cookie: anaCookie
      }
    }
  );

  assert.equal(response.status, 403);
});

test('WhatsApp simulado exige autenticación y no expone un webhook público de proveedor real', async (t) => {
  const baseUrl = await withServer(t);

  const page = await fetch(
    `${baseUrl}/whatsapp`,
    { redirect: 'manual' }
  );
  assert.equal(page.status, 302);

  const inbound = await fetch(
    `${baseUrl}/api/channels/whatsapp/inbound`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: 's_public',
        message: 'Hola'
      })
    }
  );

  assert.equal(inbound.status, 401);
});
