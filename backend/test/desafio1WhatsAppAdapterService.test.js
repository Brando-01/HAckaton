const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDesafio1WhatsAppAdapterService,
  DEDUPE_TTL_MS
} = require('../services/desafio1WhatsAppAdapterService');

test('un providerMessageId se procesa una sola vez por conversación', () => {
  const service =
    createDesafio1WhatsAppAdapterService();

  const body = {
    sessionId: 's_demo',
    message: 'Hola',
    providerMessageId: 'wamid.001'
  };

  assert.equal(
    service.prepareInbound(body).duplicate,
    false
  );
  assert.equal(
    service.prepareInbound(body).duplicate,
    true
  );
});

test('el mismo providerMessageId en otra conversación no bloquea un mensaje distinto', () => {
  const service =
    createDesafio1WhatsAppAdapterService();

  const first = service.prepareInbound({
    sessionId: 's_a',
    message: 'Hola A',
    providerMessageId: 'wamid.same'
  });
  const second = service.prepareInbound({
    sessionId: 's_b',
    message: 'Hola B',
    providerMessageId: 'wamid.same'
  });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, false);
});

test('la deduplicación expira y permite reintento fuera de la ventana', () => {
  let clock = 1000;
  const service =
    createDesafio1WhatsAppAdapterService({
      now: () => clock
    });

  const body = {
    sessionId: 's_ttl',
    message: 'Hola',
    providerMessageId: 'wamid.ttl'
  };

  assert.equal(
    service.prepareInbound(body).duplicate,
    false
  );

  clock += DEDUPE_TTL_MS + 1;

  assert.equal(
    service.prepareInbound(body).duplicate,
    false
  );
});

test('sin providerMessageId el contrato sigue funcionando pero no inventa idempotencia', () => {
  const service =
    createDesafio1WhatsAppAdapterService();

  const result = service.prepareInbound({
    sessionId: 's_no_id',
    message: 'Hola'
  });

  assert.equal(result.duplicate, false);
  assert.equal(
    result.adapter.providerMessageId,
    null
  );
  assert.equal(
    result.adapter.liveProviderConnected,
    false
  );
});
