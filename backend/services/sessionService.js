const { randomUUID } = require('crypto');

const {
  buildEmptyContinuityState,
  recordChannelTouch,
  buildSafeContinuitySnapshot,
  normalizeChannel
} = require('./desafio1OmnichannelLogic');

const sessions = new Map();

const MAX_HISTORY_MESSAGES = 12;
const SESSION_TTL_MS = 30 * 60 * 1000;

function limpiarSesionesExpiradas() {
  const ahora = Date.now();

  for (const [sessionId, session] of sessions.entries()) {
    if (ahora - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

function normalizarSessionId(sessionId) {
  if (typeof sessionId === 'string' && sessionId.trim()) {
    return sessionId.trim();
  }

  return `server-${randomUUID()}`;
}

function crearSesion(sessionId) {
  const ahora = Date.now();

  return {
    sessionId,
    createdAt: ahora,
    updatedAt: ahora,

    context: {
      customerIdentifier: null,
      currentPeriod: null,
      currentCause: null,
      detailMode: 'simple',
      omnichannel:
        buildEmptyContinuityState()
    },

    history: []
  };
}

function getOrCreateSession(sessionId) {
  limpiarSesionesExpiradas();

  const id = normalizarSessionId(sessionId);

  if (!sessions.has(id)) {
    sessions.set(id, crearSesion(id));
  }

  const session = sessions.get(id);
  session.updatedAt = Date.now();

  return session;
}

function addMessage(
  sessionId,
  role,
  content,
  metadata = {}
) {
  const session = getOrCreateSession(sessionId);

  if (!['user', 'assistant'].includes(role)) {
    throw new Error(`Rol de mensaje inválido: ${role}`);
  }

  const explicitChannel =
    normalizeChannel(
      metadata.channel
    );

  const inferredChannel =
    normalizeChannel(
      session.context
        ?.omnichannel
        ?.currentChannel
    );

  session.history.push({
    role,
    content,
    timestamp: Date.now(),
    channel:
      explicitChannel ||
      inferredChannel ||
      null
  });

  if (session.history.length > MAX_HISTORY_MESSAGES) {
    session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
  }

  session.updatedAt = Date.now();

  return session;
}

function getHistory(sessionId) {
  const session = getOrCreateSession(sessionId);

  return session.history.map(({ role, content }) => ({
    role,
    content
  }));
}

function updateContext(sessionId, partialContext) {
  const session = getOrCreateSession(sessionId);

  session.context = {
    ...session.context,
    ...partialContext
  };

  session.updatedAt = Date.now();

  return session;
}


function touchChannel(
  sessionId,
  channel,
  options = {}
) {
  const session =
    getOrCreateSession(sessionId);

  session.context.omnichannel =
    recordChannelTouch(
      session.context.omnichannel,
      {
        channel,
        event:
          options.event ||
          'TOUCH',
        at:
          options.at ||
          new Date().toISOString()
      }
    );

  session.updatedAt = Date.now();

  return buildSafeContinuitySnapshot(
    session.context.omnichannel
  );
}

function getContinuitySnapshot(
  sessionId
) {
  const session =
    getOrCreateSession(sessionId);

  return buildSafeContinuitySnapshot(
    session.context.omnichannel
  );
}

function getSessionSnapshot(sessionId) {
  const session = getOrCreateSession(sessionId);

  return {
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    context: { ...session.context },
    history: session.history.map((message) => ({ ...message }))
  };
}

function resetSession(sessionId) {
  return sessions.delete(sessionId);
}

module.exports = {
  getOrCreateSession,
  addMessage,
  getHistory,
  updateContext,
  getSessionSnapshot,
  touchChannel,
  getContinuitySnapshot,
  resetSession
};