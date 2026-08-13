const test = require('node:test');
const assert = require('node:assert/strict');

const {
  esSolicitudAsesor,
  determinarMotivoDerivacion,
  obtenerConsultaOriginal,
  crearCaso,
  listarCasos,
  obtenerCaso,
  actualizarEstadoCaso,
  resetHandoffCases
} = require('../services/handoffService');

test('detecta una solicitud explícita de asesor', () => {
  assert.equal(
    esSolicitudAsesor(
      'Quiero hablar con un asesor'
    ),
    true
  );

  assert.equal(
    esSolicitudAsesor(
      'Quiero hablar con una persona real'
    ),
    true
  );

  assert.equal(
    esSolicitudAsesor(
      '¿Cuánto pagaba el mes anterior?'
    ),
    false
  );
});

test('detecta desacuerdo como solicitud de derivación', () => {
  assert.equal(
    esSolicitudAsesor(
      'No estoy de acuerdo'
    ),
    true
  );
});

test('clasifica correctamente el motivo de derivación', () => {
  assert.equal(
    determinarMotivoDerivacion(
      'Quiero hablar con un asesor'
    ),
    'CLIENT_REQUEST'
  );

  assert.equal(
    determinarMotivoDerivacion(
      'No estoy de acuerdo'
    ),
    'CUSTOMER_DISAGREES'
  );

  assert.equal(
    determinarMotivoDerivacion(
      'Esto no resolvió mi problema'
    ),
    'NOT_RESOLVED'
  );
});



test('identifica la primera consulta útil y omite mensajes de identificación', () => {
  const originalQuery =
    obtenerConsultaOriginal([
      {
        role: 'user',
        content: 'Mi DNI es 72819345'
      },
      {
        role: 'assistant',
        content: 'Cliente identificado'
      },
      {
        role: 'user',
        content: 'Explícame por qué aumentó mi recibo'
      },
      {
        role: 'assistant',
        content: 'Tu recibo aumentó por dos motivos.'
      },
      {
        role: 'user',
        content: '¿Cuánto es mi recibo actual?'
      }
    ]);

  assert.equal(
    originalQuery,
    'Explícame por qué aumentó mi recibo'
  );
});

test('crea un caso con el contexto de la conversación', () => {
  resetHandoffCases();

  const caso = crearCaso({
    sessionId: 'session-test',
    customerIdentifier: '72819345',
    originalQuery:
      '¿Qué información tienes de mi recibo?',
    reason:
      'CUSTOMER_DISAGREES',

    handoffMessage:
      'No estoy de acuerdo, quiero hablar con un asesor',

    customerContext: {
      customerId: 'CLI000001',
      name: 'Carlos Mendoza',
      plan: 'Movistar Fibra 200 Mbps'
    },

    billingContext: {
      previousBill: {
        period: 'Junio 2026',
        total: 95
      },
      currentBill: {
        period: 'Julio 2026',
        total: 125
      },
      comparison: {
        difference: 30,
        percentage: 31.6,
        direction: 'UP',
        causes: [
          {
            code: 'DISCOUNT_ENDED',
            title: 'Finalizó tu descuento',
            description: 'El descuento terminó.',
            impact: 20
          },
          {
            code: 'RECONNECTION',
            title: 'Cargo por reconexión',
            description: 'Se aplicó reconexión.',
            impact: 10
          }
        ]
      }
    },

    conversation: [
      {
        role: 'user',
        content: 'Mi DNI es 72819345'
      },
      {
        role: 'assistant',
        content:
          'Hola Carlos, ¿en qué puedo ayudarte?'
      },
      {
        role: 'user',
        content:
          '¿Qué información tienes de mi recibo?'
      },
      {
        role: 'assistant',
        content:
          'Tu recibo actual presenta una variación.'
      },
      {
        role: 'user',
        content:
          'No estoy de acuerdo, quiero hablar con un asesor'
      }
    ]
  });

  assert.match(
    caso.caseId,
    /^CASO-[A-F0-9]{8}$/
  );

  assert.equal(
    caso.sessionId,
    'session-test'
  );

  assert.equal(
    caso.customerIdentifier,
    '72819345'
  );

  assert.equal(
    caso.originalQuery,
    '¿Qué información tienes de mi recibo?'
  );

  assert.equal(
    caso.reason,
    'CUSTOMER_DISAGREES'
  );

  assert.equal(
    caso.status,
    'PENDING'
  );

  assert.equal(
    caso.customer.name,
    'Carlos Mendoza'
  );

  assert.equal(
    caso.customer.plan,
    'Movistar Fibra 200 Mbps'
  );

  assert.equal(
    caso.billing.previousBill.total,
    95
  );

  assert.equal(
    caso.billing.currentBill.total,
    125
  );

  assert.equal(
    caso.billing.comparison.difference,
    30
  );

  assert.equal(
    caso.billing.comparison.causes.length,
    2
  );

  assert.equal(
    caso.handoffMessage,
    'No estoy de acuerdo, quiero hablar con un asesor'
  );

  assert.equal(
    caso.advisorSummary.headline,
    'Variación de S/ 30 en el recibo'
  );

  assert.match(
    caso.advisorSummary.outcome,
    /no está de acuerdo/i
  );

  assert.equal(
    caso.conversation.length,
    5
  );
});

test('lista y recupera los casos creados', () => {
  resetHandoffCases();

  const caso = crearCaso({
    sessionId: 'session-list',
    originalQuery: 'Consulta de prueba',
    conversation: []
  });

  const casos = listarCasos();

  assert.equal(
    casos.length,
    1
  );

  const encontrado =
    obtenerCaso(caso.caseId);

  assert.ok(encontrado);

  assert.equal(
    encontrado.caseId,
    caso.caseId
  );
});

test('permite marcar un caso como atendido', () => {
  resetHandoffCases();

  const caso = crearCaso({
    sessionId: 'session-status',
    originalQuery: 'Consulta',
    conversation: []
  });

  assert.equal(
    caso.status,
    'PENDING'
  );

  const actualizado =
    actualizarEstadoCaso(
      caso.caseId,
      'ATTENDED'
    );

  assert.equal(
    actualizado.status,
    'ATTENDED'
  );
});
test('transfiere un prorrateo de primer recibo como hallazgo al asesor', () => {
  resetHandoffCases();

  const caso = crearCaso({
    sessionId: 'session-proration-handoff',
    customerIdentifier: 'CLI000002',
    originalQuery: 'Explícame mi prorrateo',
    customerContext: {
      customerId: 'CLI000002',
      name: 'Ana Torres',
      plan: 'Plan demo oficial'
    },
    billingContext: {
      previousBill: null,
      currentBill: {
        period: 'Ciclo 30/06/2026',
        total: 51.83
      },
      comparison: {
        difference: null,
        percentage: null,
        direction: null,
        causes: []
      },
      findings: [
        {
          code: 'PRORATION',
          title: 'Prorrateo',
          description: 'El recibo incluye S/ 21.92 de prorrateo.',
          impact: 21.92,
          evidenceLevel: 'HIGH'
        }
      ]
    },
    conversation: [
      {
        role: 'user',
        content: 'Explícame mi prorrateo'
      },
      {
        role: 'assistant',
        content: 'El recibo incluye S/ 21.92 de prorrateo.'
      },
      {
        role: 'user',
        content: 'Quiero hablar con un asesor'
      }
    ]
  });

  assert.equal(
    caso.billing.previousBill,
    null
  );
  assert.equal(
    caso.billing.findings.length,
    1
  );
  assert.equal(
    caso.billing.findings[0].code,
    'PRORATION'
  );
  assert.equal(
    caso.advisorSummary.headline,
    'Prorrateo identificado en el recibo'
  );
  assert.match(
    caso.advisorSummary.findings[0].detail,
    /S\/ 21\.92/
  );
});
