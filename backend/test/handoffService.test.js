const test = require('node:test');
const assert = require('node:assert/strict');

const {
  esSolicitudAsesor,
  determinarMotivoDerivacion,
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

test('crea un caso con el contexto de la conversación', () => {
  resetHandoffCases();

  const caso = crearCaso({
    sessionId: 'session-test',
    customerIdentifier: '72819345',
    originalQuery:
      '¿Qué información tienes de mi recibo?',
    reason:
      'CUSTOMER_DISAGREES',

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