const { randomUUID } = require('crypto');

const casos = new Map();

const ESTADOS_VALIDOS = new Set([
  'PENDING',
  'ATTENDED'
]);

function normalizarTexto(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function esSolicitudAsesor(mensaje) {
  const texto = normalizarTexto(mensaje);

  if (!texto) {
    return false;
  }

  const patrones = [
    /\basesor\b/,
    /\bhumano\b/,
    /\bpersona real\b/,
    /\batencion humana\b/,
    /\bhablar con alguien\b/,
    /\bno estoy de acuerdo\b/,
    /\bno resolvio mi problema\b/,
    /\bno resolvio mi duda\b/,
    /\besto no me ayudo\b/
  ];

  return patrones.some((patron) =>
    patron.test(texto)
  );
}

function determinarMotivoDerivacion(mensaje) {
  const texto = normalizarTexto(mensaje);

  if (texto.includes('no estoy de acuerdo')) {
    return 'CUSTOMER_DISAGREES';
  }

  if (
    texto.includes('no resolvio mi problema') ||
    texto.includes('no resolvio mi duda') ||
    texto.includes('esto no me ayudo')
  ) {
    return 'NOT_RESOLVED';
  }

  return 'CLIENT_REQUEST';
}

function clonarCaso(caso) {
  return JSON.parse(
    JSON.stringify(caso)
  );
}

function crearCaso({
  sessionId,
  customerIdentifier = null,
  originalQuery,
  conversation = [],
  reason = 'CLIENT_REQUEST'
}) {
  const ahora =
    new Date().toISOString();

  const caseId =
    `CASO-${randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;

  const caso = {
    caseId,
    sessionId,
    customerIdentifier,
    originalQuery:
      originalQuery || null,
    reason,
    status: 'PENDING',

    conversation:
      conversation.map(
        ({ role, content }) => ({
          role,
          content
        })
      ),

    createdAt: ahora,
    updatedAt: ahora
  };

  casos.set(caseId, caso);

  return clonarCaso(caso);
}

function listarCasos() {
  return Array.from(
    casos.values()
  )
    .sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    )
    .map(clonarCaso);
}

function obtenerCaso(caseId) {
  const caso =
    casos.get(caseId);

  return caso
    ? clonarCaso(caso)
    : null;
}

function actualizarEstadoCaso(
  caseId,
  status
) {
  if (!ESTADOS_VALIDOS.has(status)) {
    throw new Error(
      `Estado inválido: ${status}`
    );
  }

  const caso =
    casos.get(caseId);

  if (!caso) {
    return null;
  }

  caso.status = status;
  caso.updatedAt =
    new Date().toISOString();

  return clonarCaso(caso);
}

function resetHandoffCases() {
  casos.clear();
}

module.exports = {
  esSolicitudAsesor,
  determinarMotivoDerivacion,
  crearCaso,
  listarCasos,
  obtenerCaso,
  actualizarEstadoCaso,
  resetHandoffCases
};