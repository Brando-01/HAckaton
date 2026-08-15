const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHANNELS,
  normalizeChannel,
  buildEmptyContinuityState,
  recordChannelTouch,
  buildSafeContinuitySnapshot,
  buildWhatsAppInboundEnvelope
} = require('../services/desafio1OmnichannelLogic');

test('normaliza alias de canales sin aceptar valores arbitrarios', () => {
  assert.equal(
    normalizeChannel('app'),
    CHANNELS.MI_MOVISTAR
  );
  assert.equal(
    normalizeChannel('Lucía web'),
    CHANNELS.LUCIA_WEB
  );
  assert.equal(
    normalizeChannel('wa'),
    CHANNELS.WHATSAPP
  );
  assert.equal(
    normalizeChannel('otro-canal'),
    null
  );
});

test('repetir el mismo canal es idempotente y no crea transición ficticia', () => {
  let state = buildEmptyContinuityState();

  state = recordChannelTouch(state, {
    channel: CHANNELS.MI_MOVISTAR,
    at: '2026-08-14T18:00:00.000Z'
  });
  state = recordChannelTouch(state, {
    channel: CHANNELS.MI_MOVISTAR,
    at: '2026-08-14T18:00:01.000Z'
  });

  const snapshot =
    buildSafeContinuitySnapshot(state);

  assert.equal(snapshot.transitionCount, 0);
  assert.deepEqual(
    snapshot.visitedChannels,
    [CHANNELS.MI_MOVISTAR]
  );
  assert.equal(snapshot.isOmnichannel, false);
});

test('conserva App → Lucía → WhatsApp → Asesor como ruta segura', () => {
  let state = buildEmptyContinuityState();

  [
    CHANNELS.MI_MOVISTAR,
    CHANNELS.LUCIA_WEB,
    CHANNELS.WHATSAPP,
    CHANNELS.ADVISOR
  ].forEach((channel, index) => {
    state = recordChannelTouch(state, {
      channel,
      event: 'TEST',
      at: `2026-08-14T18:00:0${index}.000Z`
    });
  });

  const snapshot =
    buildSafeContinuitySnapshot(state);

  assert.equal(snapshot.transitionCount, 3);
  assert.equal(snapshot.currentChannel, CHANNELS.ADVISOR);
  assert.equal(snapshot.previousChannel, CHANNELS.WHATSAPP);
  assert.equal(snapshot.isOmnichannel, true);
  assert.deepEqual(
    snapshot.visitedChannelLabels,
    [
      'Mi Movistar',
      'Lucía web',
      'WhatsApp',
      'Asesor'
    ]
  );
});

test('snapshot seguro no copia campos privados inyectados', () => {
  const snapshot = buildSafeContinuitySnapshot({
    currentChannel: 'WHATSAPP',
    visitedChannels: ['MI_MOVISTAR', 'WHATSAPP'],
    transitionCount: 1,
    transitions: [
      {
        from: 'MI_MOVISTAR',
        to: 'WHATSAPP',
        event: 'TEST',
        at: '2026-08-14T18:00:00.000Z',
        subscriberKey: 'SECRET'
      }
    ],
    subscriberKey: 'SECRET',
    customerKey: 'SECRET'
  });

  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /SECRET/);
  assert.doesNotMatch(serialized, /subscriberKey|customerKey/i);
});

test('adaptador WhatsApp exige mensaje y conversation id', () => {
  assert.throws(
    () => buildWhatsAppInboundEnvelope({
      sessionId: 's_1',
      message: ''
    }),
    /mensaje de WhatsApp/i
  );

  assert.throws(
    () => buildWhatsAppInboundEnvelope({
      message: 'Hola'
    }),
    /sessionId/i
  );
});

test('adaptador WhatsApp ignora customerId y teléfono del payload como identidad', () => {
  const envelope =
    buildWhatsAppInboundEnvelope({
      sessionId: 's_1',
      message: '¿Y ese cargo?',
      providerMessageId: 'wamid.1',
      customerId: 'CLI999999',
      phone: '+51999999999'
    });

  assert.equal(envelope.channel, CHANNELS.WHATSAPP);
  assert.equal(envelope.sessionId, 's_1');
  assert.equal(envelope.providerMessageId, 'wamid.1');
  assert.equal(envelope.customerId, undefined);
  assert.equal(envelope.phone, undefined);
});
