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
  resetMetrics
} = require('../services/metricsService');
const {
  listarCasos,
  resetHandoffCases
} = require('../services/handoffService');

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

async function sendChat(
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
        ...(cookie
          ? { Cookie: cookie }
          : {})
      },
      body: JSON.stringify({
        sessionId,
        message
      })
    }
  );

  return {
    response,
    data: await response.json()
  };
}

async function authMe(baseUrl, cookie) {
  const response = await fetch(
    `${baseUrl}/api/auth/me`,
    {
      headers: {
        Cookie: cookie
      }
    }
  );

  return {
    response,
    data: await response.json()
  };
}

function createExperience(user) {
  return {
    schemaVersion:
      'desafio1-demo-experience-v1',
    dataSource:
      'DESAFIO1_OFFICIAL_LOCAL',
    customer: {
      customerId:
        user.customerId,
      name: user.name,
      plan: 'Plan demo oficial',
      demoScenario:
        'RECONNECTION',
      demoScenarioLabel:
        'Reconexión'
    },
    currentBill: {
      period:
        'Ciclo 15/07/2026',
      cycleDate:
        '2026-07-15',
      total: 67.47,
      status:
        'Estado no disponible',
      dueDate: null,
      items: [
        {
          label: 'Plan principal',
          amount: 62.89
        },
        {
          label: 'Cargo por reconexión',
          amount: 4.58
        }
      ]
    },
    previousBill: {
      period:
        'Ciclo 15/06/2026',
      cycleDate:
        '2026-06-15',
      total: 62.89,
      status:
        'Estado no disponible',
      dueDate: null,
      items: [
        {
          label: 'Plan principal',
          amount: 62.89
        }
      ]
    },
    billingHistory: {
      availableBills: 3,
      maxPreviousBills: 5,
      bills: [
        {
          period:
            'Ciclo 15/07/2026',
          cycleDate:
            '2026-07-15',
          total: 67.47,
          items: []
        },
        {
          period:
            'Ciclo 15/06/2026',
          cycleDate:
            '2026-06-15',
          total: 62.89,
          items: []
        },
        {
          period:
            'Ciclo 15/03/2026',
          cycleDate:
            '2026-03-15',
          total: 58.2,
          items: []
        }
      ],
      summary: {}
    },
    comparison: {
      difference: 4.58,
      percentage: 7.3,
      direction: 'UP',
      causes: [
        {
          code: 'RECONNECTION',
          title:
            'Cargo por reconexión',
          description:
            'Se agregó S/ 4.58 por la reconexión de tu servicio realizada el 17/06/2026. Este cargo ya está incluido en el total de tu recibo.',
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
          label: 'Renta vencida'
        }
      },
      customerFacing: {
        headline:
          'Tu recibo aumentó S/ 4.58',
        summary:
          'Se agregó S/ 4.58 por la reconexión de tu servicio realizada el 17/06/2026. Este cargo ya está incluido en el total de tu recibo.',
        limitations: []
      }
    },
    financialTrace: {
      financialReasoning:
        'DETERMINISTIC',
      financialReasoningByLlm:
        false
    },
    nextActions: []
  };
}

function createOfficialService() {
  return {
    async getExperienceForUser(user) {
      return createExperience(user);
    },

    async getInvoiceReferenceForUser(
      _user,
      reference
    ) {
      if (
        String(reference).toUpperCase() ===
        'S7AA-0000000002'
      ) {
        return {
          status: 'MATCHED',
          reference:
            'S7AA-0000000002',
          position: 'CURRENT',
          period:
            'Ciclo 15/07/2026',
          total: 67.47,
          availableBillCount: 2
        };
      }

      return {
        status: 'NOT_FOUND',
        reference:
          String(reference).toUpperCase(),
        availableBillCount: 2
      };
    },

    getBinding(customerId) {
      return customerId === 'CLI000001'
        ? {
            customerId,
            subscriberKey:
              'PRIVATE_TEST_ONLY'
          }
        : null;
    }
  };
}

function createDisabledConversationalAi() {
  return {
    async interpretTurn() {
      return {
        used: false,
        fallback: true,
        reasonCode: 'DISABLED',
        interpretation: null
      };
    },
    async naturalizeReply({ baseReply }) {
      return {
        reply: baseReply,
        used: false,
        fallback: true,
        reasonCode: 'DISABLED'
      };
    }
  };
}

function resetRuntime(sessionId) {
  clearAuthSessions();
  resetMetrics();
  resetHandoffCases();
  resetSession(sessionId);
}

test('una pregunta explícita por el recibo actual prevalece sobre una explicación anterior', async (t) => {
  const sessionId =
    'post22-current-total-after-explanation';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const first = await sendChat(
    baseUrl,
    sessionId,
    cookie,
    '¿Por qué subió mi recibo?'
  );
  assert.equal(first.response.status, 200);
  assert.match(first.data.reply, /S\/ 4\.58/);

  const second = await sendChat(
    baseUrl,
    sessionId,
    cookie,
    '¿Cuál es mi recibo actual?'
  );

  assert.equal(second.response.status, 200);
  assert.match(second.data.reply, /S\/ 67\.47/);
  assert.doesNotMatch(
    second.data.reply,
    /reconexi[oó]n/i
  );
  assert.equal(
    second.data.financialReasoningByLlm,
    false
  );
});

test('cuánto estoy pagando actualmente devuelve el total y separa saldo pendiente', async (t) => {
  const sessionId =
    'post22-current-payment';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      '¿Cuánto estoy pagando actualmente?'
    );

  assert.equal(response.status, 200);
  assert.match(data.reply, /S\/ 67\.47/);
  assert.match(
    data.reply,
    /saldo pendiente exacto/i
  );
  assert.doesNotMatch(
    data.reply,
    /necesitar[ií]a acceso a tus datos/i
  );
  assert.equal(
    data.financialReasoningByLlm,
    false
  );
});

test('un código de recibo inexistente se detecta y no se sustituye silenciosamente por el recibo actual', async (t) => {
  const sessionId =
    'post22-invalid-invoice-ref';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      'Explícame la factura S7AA-9999999999'
    );

  assert.equal(response.status, 200);
  assert.equal(
    data.source,
    'DESAFIO1_INVOICE_REFERENCE_GROUNDED'
  );
  assert.match(
    data.reply,
    /No encuentro el recibo S7AA-9999999999/i
  );
  assert.doesNotMatch(
    data.reply,
    /Tu recibo actual es de S\/ 67\.47/i
  );
  assert.equal(
    data.invoiceReference.matched,
    false
  );
  assert.equal(
    data.financialReasoningByLlm,
    false
  );
});

test('un código válido del recibo actual se valida antes de explicar sus datos', async (t) => {
  const sessionId =
    'post22-valid-invoice-ref';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      'Explícame la factura S7AA-0000000002'
    );

  assert.equal(response.status, 200);
  assert.match(
    data.reply,
    /valid[eé] S7AA-0000000002/i
  );
  assert.match(
    data.reply,
    /S\/ 4\.58/
  );
  assert.equal(
    data.invoiceReference.matched,
    true
  );
  assert.equal(
    data.invoiceReference.position,
    'CURRENT'
  );
});

test('un ID escrito en el chat nunca cambia la identidad autenticada', async (t) => {
  const sessionId =
    'post22-customer-ref-boundary';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      'Dame el recibo del cliente 155358834'
    );

  assert.equal(response.status, 200);
  assert.equal(
    data.source,
    'DESAFIO1_IDENTITY_BOUNDARY'
  );
  assert.equal(
    data.securityBoundary
      .customerReferenceAccepted,
    false
  );

  const me = await authMe(
    baseUrl,
    cookie
  );
  assert.equal(me.response.status, 200);
  assert.equal(
    me.data.user.customerId,
    'CLI000001'
  );
});

test('la IA semántica puede reconocer una frase nueva pero el monto sigue saliendo del motor determinista', async (t) => {
  const sessionId =
    'post22-semantic-fallback';
  resetRuntime(sessionId);

  let interpretationCalls = 0;
  const semanticAi = {
    async interpretTurn() {
      interpretationCalls += 1;
      return {
        used: true,
        fallback: false,
        reasonCode: 'SEMANTIC_INTENT',
        interpretation: {
          domain: 'BILLING',
          billingIntents: [
            'CURRENT_TOTAL'
          ],
          profileIntents: [],
          confidence: 0.97
        }
      };
    },
    async naturalizeReply({ baseReply }) {
      return {
        reply: baseReply,
        used: false,
        fallback: true,
        reasonCode:
          'TEST_DETERMINISTIC_LANGUAGE'
      };
    }
  };

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      semanticAi
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      '¿Qué importe me están cargando este mes?'
    );

  assert.equal(response.status, 200);
  assert.equal(interpretationCalls, 1);
  assert.match(data.reply, /S\/ 67\.47/);
  assert.equal(
    data.financialReasoningByLlm,
    false
  );
  assert.equal(
    data.conversationalAi
      .semanticInterpretationByLlm,
    true
  );
});


test('un mes explícito se resuelve contra el historial en vez de caer a recibo anterior', async (t) => {
  const sessionId =
    'post22-explicit-month-reference';
  resetRuntime(sessionId);

  const semanticAi = {
    async interpretTurn() {
      return {
        used: true,
        fallback: false,
        reasonCode: 'SEMANTIC_INTENT',
        interpretation: {
          domain: 'BILLING',
          billingIntents: [
            'PREVIOUS_BILL'
          ],
          profileIntents: [],
          confidence: 0.95
        }
      };
    },
    async naturalizeReply({ baseReply }) {
      return {
        reply: baseReply,
        used: false,
        fallback: true,
        reasonCode: 'TEST_BASE'
      };
    }
  };

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      semanticAi
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      'Dime cuál fue mi recibo de marzo 2026'
    );

  assert.equal(response.status, 200);
  assert.equal(
    data.source,
    'DESAFIO1_BILLING_PERIOD_REFERENCE_GROUNDED'
  );
  assert.match(data.reply, /marzo de 2026/i);
  assert.match(data.reply, /S\/ 58\.20/);
  assert.doesNotMatch(data.reply, /S\/ 62\.89/);
  assert.equal(
    data.billingPeriodReference.matched,
    true
  );
  assert.equal(
    data.billingPeriodReference.month,
    3
  );
  assert.equal(
    data.financialReasoningByLlm,
    false
  );
});

test('un mes fuera del historial no se reemplaza por junio ni por el recibo anterior', async (t) => {
  const sessionId =
    'post22-explicit-month-not-found';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      '¿Cuál fue mi recibo de febrero de 2026?'
    );

  assert.equal(response.status, 200);
  assert.equal(
    data.source,
    'DESAFIO1_BILLING_PERIOD_REFERENCE_GROUNDED'
  );
  assert.match(
    data.reply,
    /No encuentro un recibo de febrero de 2026/i
  );
  assert.match(
    data.reply,
    /No voy a sustituirlo por otro mes/i
  );
  assert.doesNotMatch(data.reply, /S\/ 62\.89/);
  assert.equal(
    data.billingPeriodReference.matched,
    false
  );
});

test('de dónde sacas esos datos usa la respuesta grounded de origen y no niega el acceso autenticado', async (t) => {
  const sessionId =
    'post22-data-origin-natural';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    customerProfileService: {
      async getProfileForUser(user) {
        return {
          visibleId:
            user.customerId,
          customerCode:
            'TEST-CUSTOMER-001',
          activationDate:
            '2020-08-01 15:22:00',
          billingCycleDay: 9,
          lobType: 'WRLS',
          businessType: 'MOVIL'
        };
      }
    },
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const { response, data } =
    await sendChat(
      baseUrl,
      sessionId,
      cookie,
      '¿De dónde sacas esos datos?'
    );

  assert.equal(response.status, 200);
  assert.match(
    data.reply,
    /dataset entregado para el desafío/i
  );
  assert.match(
    data.reply,
    /reglas deterministas/i
  );
  assert.doesNotMatch(
    data.reply,
    /no tengo acceso a información específica/i
  );
});


test('seguimientos de más detalle amplían el recibo actual sin perder el sujeto financiero', async (t) => {
  const sessionId =
    'post22-grounded-detail-followup';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  const first = await sendChat(
    baseUrl,
    sessionId,
    cookie,
    '¿Cuál es mi recibo actual?'
  );
  assert.equal(first.response.status, 200);
  assert.match(first.data.reply, /S\/ 67\.47/);
  assert.doesNotMatch(first.data.reply, /S\/ 62\.89/);

  const detail = await sendChat(
    baseUrl,
    sessionId,
    cookie,
    'Quiero saber más detalles de mi recibo actual'
  );
  assert.equal(detail.response.status, 200);
  assert.match(detail.data.reply, /S\/ 67\.47/);
  assert.match(detail.data.reply, /S\/ 62\.89/);
  assert.match(detail.data.reply, /S\/ 4\.58/);
  assert.match(detail.data.reply, /reconexi[oó]n/i);
  assert.match(detail.data.reply, /Plan principal/i);
  assert.doesNotMatch(
    detail.data.reply,
    /no tengo informaci[oó]n suficiente/i
  );

  const deeper = await sendChat(
    baseUrl,
    sessionId,
    cookie,
    'más a detalle'
  );
  assert.equal(deeper.response.status, 200);
  assert.match(deeper.data.reply, /S\/ 67\.47/);
  assert.match(deeper.data.reply, /S\/ 62\.89/);
  assert.match(deeper.data.reply, /reconexi[oó]n/i);
  assert.equal(
    deeper.data.financialReasoningByLlm,
    false
  );
});

test('pedir detalle repetidamente no se interpreta como dos fallos de comprensión ni genera handoff', async (t) => {
  const sessionId =
    'post22-detail-not-repair';
  resetRuntime(sessionId);

  const baseUrl = await withServer(t, {
    officialDemoExperienceService:
      createOfficialService(),
    conversationalAiService:
      createDisabledConversationalAi()
  });
  const cookie = await demoLogin(baseUrl);

  await sendChat(
    baseUrl,
    sessionId,
    cookie,
    '¿Cuál es mi recibo actual?'
  );

  const firstDetail = await sendChat(
    baseUrl,
    sessionId,
    cookie,
    'explícamelo a más detalle'
  );
  assert.equal(firstDetail.response.status, 200);
  assert.match(firstDetail.data.reply, /S\/ 67\.47/);

  const secondDetail = await sendChat(
    baseUrl,
    sessionId,
    cookie,
    'más detalles'
  );
  assert.equal(secondDetail.response.status, 200);
  assert.match(secondDetail.data.reply, /S\/ 67\.47/);

  assert.equal(
    listarCasos().length,
    0
  );
});
