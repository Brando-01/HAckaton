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

function adaptarDescripcionParaAsesor(value) {
  if (!value) {
    return value || null;
  }

  return String(value)
    .replace(/\bde tu recibo\b/gi, 'del recibo del cliente')
    .replace(/\bde tu servicio\b/gi, 'del servicio del cliente')
    .replace(/\btu recibo\b/gi, 'el recibo del cliente')
    .replace(/\btu servicio\b/gi, 'el servicio del cliente')
    .replace(/\btu facturaci[oó]n\b/gi, 'la facturación del cliente')
    .replace(/\btu plan\b/gi, 'el plan del cliente')
    .replace(/\s{2,}/g, ' ')
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

function esMensajeIdentificacion(mensaje = '') {
  const texto = normalizarTexto(mensaje);

  if (!texto) {
    return true;
  }

  return (
    /^\d{8}$/.test(texto) ||
    /\b(mi\s+)?dni\b/.test(texto) ||
    /\bdocumento\b/.test(texto)
  );
}

function obtenerConsultaOriginal(
  conversation = [],
  fallback = null
) {
  const mensajesCliente =
    conversation.filter(
      (mensaje) =>
        mensaje &&
        mensaje.role === 'user' &&
        typeof mensaje.content === 'string' &&
        mensaje.content.trim()
    );

  const primeraConsulta =
    mensajesCliente.find(
      (mensaje) =>
        !esMensajeIdentificacion(
          mensaje.content
        )
    );

  if (primeraConsulta) {
    return primeraConsulta.content.trim();
  }

  if (mensajesCliente.length) {
    return mensajesCliente[0]
      .content
      .trim();
  }

  return fallback || null;
}

function clonarCaso(caso) {
  return JSON.parse(
    JSON.stringify(caso)
  );
}

function normalizarContextoCliente(
  customerContext,
  customerIdentifier
) {
  if (!customerContext) {
    return customerIdentifier
      ? {
          customerId:
            customerIdentifier,
          name: null,
          plan: null
        }
      : null;
  }

  return {
    customerId:
      customerContext.customerId ||
      customerIdentifier ||
      null,

    name:
      customerContext.name ||
      null,

    plan:
      customerContext.plan ||
      null
  };
}

function normalizarContextoFacturacion(
  billingContext
) {
  if (!billingContext) {
    return null;
  }

  return {
    previousBill:
      billingContext.previousBill
        ? {
            period:
              billingContext.previousBill.period ||
              null,
            total:
              Number.isFinite(
                billingContext.previousBill.total
              )
                ? billingContext.previousBill.total
                : null
          }
        : null,

    currentBill:
      billingContext.currentBill
        ? {
            period:
              billingContext.currentBill.period ||
              null,
            total:
              Number.isFinite(
                billingContext.currentBill.total
              )
                ? billingContext.currentBill.total
                : null
          }
        : null,

    comparison:
      billingContext.comparison
        ? {
            difference:
              Number.isFinite(
                billingContext.comparison.difference
              )
                ? billingContext.comparison.difference
                : null,

            percentage:
              Number.isFinite(
                billingContext.comparison.percentage
              )
                ? billingContext.comparison.percentage
                : null,

            direction:
              billingContext.comparison.direction ||
              null,

            causes:
              Array.isArray(
                billingContext.comparison.causes
              )
                ? billingContext.comparison.causes.map(
                    (cause) => ({
                      code:
                        cause.code || null,
                      title:
                        cause.title ||
                        'Variación detectada',
                      description:
                        adaptarDescripcionParaAsesor(
                          cause.description
                        ),
                      impact:
                        Number.isFinite(
                          cause.impact
                        )
                          ? cause.impact
                          : null,
                      impactPresentation:
                        cause.impactPresentation ||
                        'VARIATION',
                      evidenceLevel:
                        cause.evidenceLevel ||
                        cause.verification
                          ?.evidenceLevel ||
                        null,
                      verification:
                        cause.verification
                          ? {
                              label:
                                cause.verification.label ||
                                null,
                              sources:
                                Array.isArray(
                                  cause.verification.sources
                                )
                                  ? [
                                      ...cause.verification.sources
                                    ]
                                  : []
                            }
                          : null
                    })
                  )
                : []
          }
        : null,

    findings:
      Array.isArray(
        billingContext.findings
      )
        ? billingContext.findings.map(
            (finding) => ({
              code:
                finding.code || null,
              title:
                finding.title ||
                'Hallazgo del recibo',
              description:
                adaptarDescripcionParaAsesor(
                  finding.description
                ),
              impact:
                Number.isFinite(
                  finding.impact
                )
                  ? finding.impact
                  : null,
              evidenceLevel:
                finding.evidenceLevel ||
                finding.verification
                  ?.evidenceLevel ||
                null,
              impactPresentation:
                finding.impactPresentation ||
                'INCLUDED_IN_TOTAL',
              verification:
                finding.verification
                  ? {
                      label:
                        finding.verification.label ||
                        null,
                      sources:
                        Array.isArray(
                          finding.verification.sources
                        )
                          ? [
                              ...finding.verification.sources
                            ]
                          : []
                    }
                  : null
            })
          )
        : []
  };
}

function crearResumenAsesor({
  customer,
  billing,
  originalQuery,
  reason,
  handoffMessage,
  conversation = []
}) {
  const customerName =
    customer && customer.name
      ? customer.name
      : 'El cliente';

  const normalizedQuery =
    normalizarTexto(originalQuery || '');

  const isBillingQuery =
    /(recibo|factura|facturacion|cobro|monto|pagar|pague|pagaba|aumento|subio|variacion|descuento|reconexion|cargo|prorrateo)/.test(
      normalizedQuery
    );

  const findings = [];

  if (
    isBillingQuery &&
    billing &&
    billing.comparison &&
    Array.isArray(
      billing.comparison.causes
    )
  ) {
    billing.comparison.causes
      .forEach((cause) => {
        const impact =
          Number.isFinite(cause.impact)
            ? cause.impact
            : null;

        findings.push({
          title: cause.title,
          detail:
            cause.description || null,
          impact,
          impactPresentation:
            cause.impactPresentation ||
            'VARIATION',
          evidenceLevel:
            cause.evidenceLevel || null,
          verification:
            cause.verification || null
        });
      });
  }

  if (
    billing &&
    Array.isArray(
      billing.findings
    )
  ) {
    billing.findings
      .forEach((finding) => {
        findings.push({
          title:
            finding.title ||
            'Hallazgo del recibo',
          detail:
            finding.description ||
            null,
          impact:
            Number.isFinite(
              finding.impact
            )
              ? finding.impact
              : null,
          impactPresentation:
            finding.impactPresentation ||
            'INCLUDED_IN_TOTAL',
          evidenceLevel:
            finding.evidenceLevel || null,
          verification:
            finding.verification || null
        });
      });
  }

  let headline =
    'Consulta derivada a asesor';

  let overview = originalQuery
    ? `${customerName} inició la consulta por: “${originalQuery}”.`
    : `${customerName} solicitó apoyo de un asesor.`;

  if (
    isBillingQuery &&
    billing &&
    billing.previousBill &&
    billing.currentBill &&
    billing.comparison &&
    Number.isFinite(
      billing.comparison.difference
    )
  ) {
    const difference =
      billing.comparison.difference;

    const absDifference =
      Math.abs(difference);

    const movement =
      difference >= 0
        ? 'aumentó'
        : 'disminuyó';

    headline =
      `Variación de S/ ${absDifference} en el recibo`;

    overview =
      `${customerName} consultó por su facturación. ` +
      `El recibo ${movement} de S/ ${billing.previousBill.total} ` +
      `a S/ ${billing.currentBill.total}.`;
  }

  if (
    isBillingQuery &&
    billing?.currentBill &&
    !billing?.previousBill &&
    billing?.findings
      ?.some(
        (finding) =>
          finding.code ===
          'PRORATION'
      )
  ) {
    headline =
      'Prorrateo identificado en el recibo';
    overview =
      `${customerName} consultó por un primer recibo sin comparación mensual disponible. ` +
      'Lucía transfirió el prorrateo verificado para revisión del asesor.';
  }

  const assistantMessages =
    conversation.filter(
      (mensaje) =>
        mensaje &&
        mensaje.role === 'assistant'
    );

  let outcome =
    'El cliente solicitó continuar la atención con una persona.';

  if (reason === 'CUSTOMER_DISAGREES') {
    outcome = assistantMessages.length
      ? 'Lucía brindó una explicación, pero el cliente indicó que no está de acuerdo y solicitó atención humana.'
      : 'El cliente indicó que no está de acuerdo y solicitó atención humana.';
  } else if (reason === 'NOT_RESOLVED') {
    outcome =
      'El cliente indicó que la consulta no quedó resuelta y solicitó atención humana.';
  } else if (assistantMessages.length) {
    outcome =
      'Después de conversar con Lucía, el cliente solicitó continuar con un asesor humano.';
  }

  return {
    headline,
    overview,
    findings,
    outcome,
    handoffMessage:
      handoffMessage || null
  };
}

function crearCaso({
  sessionId,
  customerIdentifier = null,
  originalQuery,
  handoffMessage = null,
  conversation = [],
  reason = 'CLIENT_REQUEST',
  customerContext = null,
  billingContext = null
}) {
  const ahora =
    new Date().toISOString();

  const caseId =
    `CASO-${randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;

  const customer =
    normalizarContextoCliente(
      customerContext,
      customerIdentifier
    );

  const billing =
    normalizarContextoFacturacion(
      billingContext
    );

  const safeConversation =
    conversation.map(
      ({ role, content }) => ({
        role,
        content
      })
    );

  const caso = {
    caseId,
    sessionId,
    customerIdentifier,
    customer,
    billing,
    originalQuery:
      originalQuery || null,
    handoffMessage:
      handoffMessage || null,
    reason,
    status: 'PENDING',

    advisorSummary:
      crearResumenAsesor({
        customer,
        billing,
        originalQuery:
          originalQuery || null,
        reason,
        handoffMessage,
        conversation:
          safeConversation
      }),

    conversation:
      safeConversation,

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
  adaptarDescripcionParaAsesor,
  esSolicitudAsesor,
  determinarMotivoDerivacion,
  obtenerConsultaOriginal,
  crearCaso,
  listarCasos,
  obtenerCaso,
  actualizarEstadoCaso,
  resetHandoffCases
};
