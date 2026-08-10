process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

const {
  resetHandoffCases
} = require('../services/handoffService');

const {
  resetSession,
  updateContext,
  addMessage
} = require('../services/sessionService');

test(
  'crea, consulta y atiende un caso mediante la API',
  async (t) => {
    const sessionId =
      'handoff-api-test';

    resetHandoffCases();
    resetSession(sessionId);

    // Simulamos que Mi Movistar ya autenticó
    // al cliente Carlos.
    updateContext(
      sessionId,
      {
        customerIdentifier:
          'CLI000001'
      }
    );

    // Simulamos una conversación previa,
    // evitando depender de Groq.
    addMessage(
      sessionId,
      'user',
      'Explícame por qué aumentó mi recibo'
    );

    addMessage(
      sessionId,
      'assistant',
      'Tu recibo aumentó por el fin de un descuento y una reconexión.'
    );

    addMessage(
      sessionId,
      'user',
      '¿Cuánto es mi recibo actual?'
    );

    addMessage(
      sessionId,
      'assistant',
      'Tu recibo actual es de S/ 125.'
    );

    const app = createApp();

    const server =
      app.listen(0);

    await new Promise(
      (resolve) => {
        server.once(
          'listening',
          resolve
        );
      }
    );

    t.after(
      () =>
        new Promise(
          (resolve) => {
            server.close(resolve);
          }
        )
    );

    const port =
      server.address().port;

    const baseUrl =
      `http://127.0.0.1:${port}`;

    // 1. El cliente solicita asesor.
    const handoffResponse =
      await fetch(
        `${baseUrl}/api/chat`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            message:
              'No estoy de acuerdo, quiero hablar con un asesor',

            sessionId
          })
        }
      );

    assert.equal(
      handoffResponse.status,
      200
    );

    const handoff =
      await handoffResponse.json();

    assert.ok(
      handoff.handoff
    );

    assert.match(
      handoff.handoff.caseId,
      /^CASO-[A-F0-9]{8}$/
    );

    assert.equal(
      handoff.handoff.status,
      'PENDING'
    );

    assert.equal(
      handoff.handoff.reason,
      'CUSTOMER_DISAGREES'
    );

    assert.equal(
      handoff.sessionId,
      sessionId
    );

    const caseId =
      handoff.handoff.caseId;

    // 2. El panel lista el caso.
    const listResponse =
      await fetch(
        `${baseUrl}/api/advisor/cases`
      );

    assert.equal(
      listResponse.status,
      200
    );

    const list =
      await listResponse.json();

    assert.equal(
      list.cases.length,
      1
    );

    assert.equal(
      list.cases[0].caseId,
      caseId
    );

    // 3. El asesor consulta el caso.
    const caseResponse =
      await fetch(
        `${baseUrl}/api/advisor/cases/${caseId}`
      );

    assert.equal(
      caseResponse.status,
      200
    );

    const caseData =
      await caseResponse.json();

    assert.equal(
      caseData.caseId,
      caseId
    );

    assert.equal(
      caseData.customerIdentifier,
      'CLI000001'
    );

    assert.equal(
      caseData.customer.name,
      'Carlos Mendoza'
    );

    assert.equal(
      caseData.customer.plan,
      'Movistar Fibra 200 Mbps'
    );

    assert.equal(
      caseData.originalQuery,
      'Explícame por qué aumentó mi recibo'
    );

    assert.equal(
      caseData.handoffMessage,
      'No estoy de acuerdo, quiero hablar con un asesor'
    );

    assert.equal(
      caseData.billing.previousBill.total,
      95
    );

    assert.equal(
      caseData.billing.currentBill.total,
      125
    );

    assert.equal(
      caseData.billing.comparison.difference,
      30
    );

    assert.equal(
      caseData.billing.comparison.causes.length,
      2
    );

    assert.equal(
      caseData.advisorSummary.headline,
      'Variación de S/ 30 en el recibo'
    );

    assert.match(
      caseData.advisorSummary.outcome,
      /no está de acuerdo/i
    );

    assert.equal(
      caseData.reason,
      'CUSTOMER_DISAGREES'
    );

    assert.equal(
      caseData.status,
      'PENDING'
    );

    // 4 mensajes previos +
    // solicitud actual de asesor.
    assert.equal(
      caseData.conversation.length,
      5
    );

    assert.equal(
      caseData.conversation[4].content,
      'No estoy de acuerdo, quiero hablar con un asesor'
    );

    // 4. El asesor marca el caso
    // como atendido.
    const patchResponse =
      await fetch(
        `${baseUrl}/api/advisor/cases/${caseId}`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            status: 'ATTENDED'
          })
        }
      );

    assert.equal(
      patchResponse.status,
      200
    );

    const updated =
      await patchResponse.json();

    assert.equal(
      updated.status,
      'ATTENDED'
    );

    // 5. Comprobamos que el cambio
    // realmente quedó guardado.
    const finalResponse =
      await fetch(
        `${baseUrl}/api/advisor/cases/${caseId}`
      );

    const finalCase =
      await finalResponse.json();

    assert.equal(
      finalCase.status,
      'ATTENDED'
    );
  }
);