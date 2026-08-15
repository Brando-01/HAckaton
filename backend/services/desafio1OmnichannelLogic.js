const OMNICHANNEL_SCHEMA_VERSION =
  'desafio1-omnichannel-continuity-v1';

const CHANNELS = Object.freeze({
  MI_MOVISTAR: 'MI_MOVISTAR',
  LUCIA_WEB: 'LUCIA_WEB',
  WHATSAPP: 'WHATSAPP',
  ADVISOR: 'ADVISOR'
});

const CHANNEL_LABELS = Object.freeze({
  [CHANNELS.MI_MOVISTAR]:
    'Mi Movistar',
  [CHANNELS.LUCIA_WEB]:
    'Lucía web',
  [CHANNELS.WHATSAPP]:
    'WhatsApp',
  [CHANNELS.ADVISOR]:
    'Asesor'
});

const CUSTOMER_MESSAGE_CHANNELS =
  new Set([
    CHANNELS.LUCIA_WEB,
    CHANNELS.WHATSAPP
  ]);

const MAX_TRANSITIONS = 12;

function normalizeChannel(
  value,
  fallback = null
) {
  const normalized =
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');

  const aliases = {
    APP: CHANNELS.MI_MOVISTAR,
    MI_MOVISTAR:
      CHANNELS.MI_MOVISTAR,
    MIMOVISTAR:
      CHANNELS.MI_MOVISTAR,
    LUCIA:
      CHANNELS.LUCIA_WEB,
    LUCIA_WEB:
      CHANNELS.LUCIA_WEB,
    BOT:
      CHANNELS.LUCIA_WEB,
    WEB:
      CHANNELS.LUCIA_WEB,
    WHATSAPP:
      CHANNELS.WHATSAPP,
    WA:
      CHANNELS.WHATSAPP,
    ADVISOR:
      CHANNELS.ADVISOR,
    ASESOR:
      CHANNELS.ADVISOR
  };

  return aliases[normalized] ||
    fallback;
}

function buildEmptyContinuityState() {
  return {
    schemaVersion:
      OMNICHANNEL_SCHEMA_VERSION,
    currentChannel: null,
    previousChannel: null,
    visitedChannels: [],
    transitionCount: 0,
    transitions: [],
    lastTouchAt: null
  };
}

function cloneState(value) {
  const base =
    value &&
    typeof value === 'object'
      ? value
      : {};

  return {
    ...buildEmptyContinuityState(),
    ...base,
    visitedChannels:
      Array.isArray(
        base.visitedChannels
      )
        ? [...base.visitedChannels]
        : [],
    transitions:
      Array.isArray(
        base.transitions
      )
        ? base.transitions.map(
            (item) => ({ ...item })
          )
        : []
  };
}

function recordChannelTouch(
  state,
  {
    channel,
    event = 'TOUCH',
    at = new Date().toISOString()
  } = {}
) {
  const normalizedChannel =
    normalizeChannel(channel);

  if (!normalizedChannel) {
    throw new Error(
      'Canal omnicanal inválido'
    );
  }

  const next =
    cloneState(state);

  const previousCurrent =
    normalizeChannel(
      next.currentChannel
    );

  if (
    !next.visitedChannels.includes(
      normalizedChannel
    )
  ) {
    next.visitedChannels.push(
      normalizedChannel
    );
  }

  if (
    previousCurrent &&
    previousCurrent !==
      normalizedChannel
  ) {
    next.previousChannel =
      previousCurrent;

    next.transitionCount =
      Number(next.transitionCount || 0) +
      1;

    next.transitions.push({
      from: previousCurrent,
      to: normalizedChannel,
      event:
        String(event || 'TOUCH'),
      at
    });

    if (
      next.transitions.length >
      MAX_TRANSITIONS
    ) {
      next.transitions =
        next.transitions.slice(
          -MAX_TRANSITIONS
        );
    }
  }

  next.currentChannel =
    normalizedChannel;
  next.lastTouchAt = at;
  next.schemaVersion =
    OMNICHANNEL_SCHEMA_VERSION;

  return next;
}

function buildSafeContinuitySnapshot(
  state
) {
  const normalized =
    cloneState(state);

  const visitedChannels =
    normalized.visitedChannels
      .map((channel) =>
        normalizeChannel(channel)
      )
      .filter(Boolean);

  const transitions =
    normalized.transitions
      .map((item) => ({
        from:
          normalizeChannel(item.from),
        to:
          normalizeChannel(item.to),
        event:
          String(
            item.event || 'TOUCH'
          ),
        at:
          item.at || null
      }))
      .filter(
        (item) =>
          item.from && item.to
      );

  return {
    schemaVersion:
      OMNICHANNEL_SCHEMA_VERSION,
    currentChannel:
      normalizeChannel(
        normalized.currentChannel
      ),
    previousChannel:
      normalizeChannel(
        normalized.previousChannel
      ),
    visitedChannels,
    visitedChannelLabels:
      visitedChannels.map(
        (channel) =>
          CHANNEL_LABELS[channel]
      ),
    transitionCount:
      Number(
        normalized.transitionCount || 0
      ),
    transitions,
    journey:
      visitedChannels.map(
        (channel) => ({
          channel,
          label:
            CHANNEL_LABELS[channel]
        })
      ),
    isOmnichannel:
      visitedChannels.length >= 2,
    lastTouchAt:
      normalized.lastTouchAt || null
  };
}

function isCustomerMessageChannel(
  channel
) {
  return CUSTOMER_MESSAGE_CHANNELS.has(
    normalizeChannel(channel)
  );
}

function buildWhatsAppInboundEnvelope(
  body = {}
) {
  const message =
    typeof body.message === 'string'
      ? body.message.trim()
      : '';

  const sessionId =
    typeof body.sessionId === 'string'
      ? body.sessionId.trim()
      : '';

  const providerMessageId =
    typeof body.providerMessageId ===
      'string'
      ? body.providerMessageId.trim()
      : null;

  if (!message) {
    const error = new Error(
      'El mensaje de WhatsApp no puede estar vacío'
    );
    error.code =
      'WHATSAPP_MESSAGE_REQUIRED';
    throw error;
  }

  if (!sessionId) {
    const error = new Error(
      'conversationId/sessionId es obligatorio para conservar continuidad'
    );
    error.code =
      'WHATSAPP_SESSION_REQUIRED';
    throw error;
  }

  return {
    schemaVersion:
      'desafio1-whatsapp-adapter-v1',
    channel: CHANNELS.WHATSAPP,
    sessionId,
    message,
    providerMessageId:
      providerMessageId || null,
    provider: 'SIMULATED_WHATSAPP'
  };
}

function buildWhatsAppAdapterMetadata(
  envelope,
  {
    duplicate = false
  } = {}
) {
  return {
    schemaVersion:
      envelope?.schemaVersion ||
      'desafio1-whatsapp-adapter-v1',
    provider:
      'SIMULATED_WHATSAPP',
    channel:
      CHANNELS.WHATSAPP,
    providerMessageId:
      envelope?.providerMessageId ||
      null,
    duplicate:
      Boolean(duplicate),
    liveProviderConnected: false,
    contractOnly: true
  };
}

module.exports = {
  OMNICHANNEL_SCHEMA_VERSION,
  CHANNELS,
  CHANNEL_LABELS,
  MAX_TRANSITIONS,
  normalizeChannel,
  buildEmptyContinuityState,
  recordChannelTouch,
  buildSafeContinuitySnapshot,
  isCustomerMessageChannel,
  buildWhatsAppInboundEnvelope,
  buildWhatsAppAdapterMetadata
};
