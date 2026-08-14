const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HANDOFF_DECISIONS,
  REPAIR_TRANSFER_THRESHOLD,
  detectExplicitHandoffReason,
  isClearlyOutOfBillingScope,
  buildRepairState,
  evaluatePreTurnHandoffPolicy,
  evaluatePostTurnHandoffPolicy,
  buildSafeHandoffPolicySnapshot
} = require('../services/desafio1HandoffPolicyLogic');

test('solicitud explícita de asesor transfiere inmediatamente', () => {
  const result = evaluatePreTurnHandoffPolicy({
    message: 'Quiero hablar con un asesor'
  });

  assert.equal(result.decision, HANDOFF_DECISIONS.TRANSFER_NOW);
  assert.equal(result.reasonCode, 'CLIENT_REQUEST');
});

test('desacuerdo explícito conserva motivo específico de handoff', () => {
  const result = detectExplicitHandoffReason(
    'No estoy de acuerdo con la explicación'
  );

  assert.equal(result.reasonCode, 'CUSTOMER_DISAGREES');
});

test('declaración explícita de no resolución deriva sin esperar otro intento', () => {
  const result = evaluatePreTurnHandoffPolicy({
    message: 'Esto no resolvió mi problema'
  });

  assert.equal(result.decision, 'TRANSFER_NOW');
  assert.equal(result.reasonCode, 'NOT_RESOLVED');
});

test('consulta técnica inequívoca fuera de facturación deriva a humano', () => {
  const result = evaluatePreTurnHandoffPolicy({
    message: 'Mi wifi no funciona desde ayer'
  });

  assert.equal(result.reasonCode, 'OUT_OF_BILLING_SCOPE');
});

test('una consulta de cobro no se vuelve técnica solo por mencionar internet', () => {
  assert.equal(
    isClearlyOutOfBillingScope(
      'Me cobraron una reconexión después de quedarme sin internet'
    ),
    false
  );
});

test('primer pedido de aclaración no alcanza el umbral de handoff', () => {
  const state = buildRepairState({
    repair: true,
    previousRepairCount: 0,
    lastConversationDomain: 'BILLING'
  });

  assert.equal(state.currentRepairCount, 1);
  assert.equal(state.thresholdReached, false);
});

test('segunda reformulación consecutiva de facturación alcanza el umbral', () => {
  const result = evaluatePreTurnHandoffPolicy({
    message: 'Sigo sin entender, explícamelo otra vez',
    repair: true,
    previousRepairCount: 1,
    lastConversationDomain: 'BILLING'
  });

  assert.equal(result.decision, 'TRANSFER_NOW');
  assert.equal(result.reasonCode, 'REPEATED_UNDERSTANDING_FAILURE');
  assert.equal(result.observedRepairCount, REPAIR_TRANSFER_THRESHOLD);
});

test('una reparación fuera de contexto personal no hereda umbral previo', () => {
  const state = buildRepairState({
    repair: true,
    previousRepairCount: 1,
    lastConversationDomain: 'GENERAL'
  });

  assert.equal(state.currentRepairCount, 0);
  assert.equal(state.thresholdReached, false);
});

test('un turno normal reinicia el contador de reformulaciones', () => {
  const state = buildRepairState({
    repair: false,
    previousRepairCount: 1,
    lastConversationDomain: 'BILLING'
  });

  assert.equal(state.currentRepairCount, 0);
});

test('RESOLVED no ofrece asesor por política de Fase 19', () => {
  const result = evaluatePostTurnHandoffPolicy({
    resolutionStatus: 'RESOLVED'
  });

  assert.equal(result.decision, 'NONE');
});

test('PARTIALLY_RESOLVED ofrece asesor sin transferir automáticamente', () => {
  const result = evaluatePostTurnHandoffPolicy({
    resolutionStatus: 'PARTIALLY_RESOLVED'
  });

  assert.equal(result.decision, 'OFFER_ADVISOR');
  assert.equal(result.reasonCode, 'RESOLUTION_GAP');
});

test('UNRESOLVED ofrece asesor sin inventar una resolución', () => {
  const result = evaluatePostTurnHandoffPolicy({
    resolutionStatus: 'UNRESOLVED'
  });

  assert.equal(result.decision, 'OFFER_ADVISOR');
});

test('saludo genérico no se deriva por falta de palabras de facturación', () => {
  const result = evaluatePreTurnHandoffPolicy({
    message: 'Hola, buenos días'
  });

  assert.equal(result.decision, 'NONE');
});

test('snapshot de política elimina cualquier campo no permitido', () => {
  const snapshot = buildSafeHandoffPolicySnapshot({
    decision: 'TRANSFER_NOW',
    reasonCode: 'OUT_OF_BILLING_SCOPE',
    ruleId: 'RULE',
    trigger: 'TEST',
    threshold: 2,
    observedRepairCount: 2,
    subscriberKey: 'SECRET',
    sourceRows: [1, 2]
  });

  assert.equal(snapshot.decision, 'TRANSFER_NOW');
  assert.equal(snapshot.subscriberKey, undefined);
  assert.equal(snapshot.sourceRows, undefined);
});
