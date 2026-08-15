function normalizeReference(value) {
  const normalized =
    String(value ?? '')
      .trim()
      .toUpperCase();

  return normalized || null;
}

function extractExplicitInvoiceReference(
  message
) {
  const text = String(message ?? '');
  const matches = Array.from(
    text.matchAll(
      /\b[A-Z0-9]{2,8}-\d{6,14}\b/gi
    )
  );

  if (!matches.length) {
    return null;
  }

  return normalizeReference(
    matches[0][0]
  );
}

function extractExplicitCustomerReference(
  message
) {
  const text = String(message ?? '');

  const alias =
    text.match(
      /\b(?:CLI\d{6,}|DEMO\d{4,})\b/i
    );

  if (alias) {
    return normalizeReference(
      alias[0]
    );
  }

  const numeric =
    text.match(
      /\b(?:id|codigo|código)\s*(?:de\s*)?(?:cliente|usuario|cuenta)?\s*[:#-]?\s*(\d{6,14})\b/i
    ) ||
    text.match(
      /\b(?:cliente|usuario|cuenta)\s+(\d{6,14})\b/i
    );

  return numeric
    ? normalizeReference(
        numeric[1]
      )
    : null;
}

function evaluateCustomerReference({
  reference,
  authenticatedCustomerId = null,
  authenticatedCustomerReferences = []
}) {
  const normalized =
    normalizeReference(reference);
  const authenticated =
    normalizeReference(
      authenticatedCustomerId
    );

  const allowedReferences =
    new Set(
      [
        authenticated,
        ...(Array.isArray(
          authenticatedCustomerReferences
        )
          ? authenticatedCustomerReferences
              .map(normalizeReference)
          : [])
      ].filter(Boolean)
    );

  if (!normalized) {
    return {
      present: false,
      allowed: true,
      reasonCode:
        'NO_CUSTOMER_REFERENCE'
    };
  }

  if (
    allowedReferences.has(
      normalized
    )
  ) {
    return {
      present: true,
      allowed: true,
      reasonCode:
        'MATCHES_AUTHENTICATED_ACCOUNT',
      reference: normalized
    };
  }

  return {
    present: true,
    allowed: false,
    reasonCode:
      allowedReferences.size
        ? 'CUSTOMER_REFERENCE_CANNOT_SWITCH_IDENTITY'
        : 'CUSTOMER_REFERENCE_REQUIRES_AUTH',
    reference: normalized
  };
}

function buildCustomerReferenceReply(
  decision
) {
  if (!decision?.present) {
    return null;
  }

  if (decision.allowed) {
    return null;
  }

  if (
    decision.reasonCode ===
      'CUSTOMER_REFERENCE_REQUIRES_AUTH'
  ) {
    return (
      'No puedo usar un ID escrito en el chat como autorización para consultar una cuenta. Inicia sesión con un perfil autorizado y usaré únicamente la identidad de esa sesión.'
    );
  }

  return (
    `El código ${decision.reference} no puede cambiar la cuenta de esta conversación. ` +
    'Por seguridad, los datos personales se consultan únicamente para la cuenta que inició sesión. Si quieres usar otra cuenta, cierra sesión y vuelve a validarla desde el acceso demo.'
  );
}


const BILLING_MONTHS = Object.freeze({
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
});

const BILLING_MONTH_LABELS = Object.freeze([
  null,
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]);

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractExplicitBillingPeriodReference(
  message
) {
  const raw = String(message ?? '');
  const text = normalizeSearchText(raw);

  if (!/(recibo|factura|ciclo)/.test(text)) {
    return null;
  }

  let month = null;
  let monthLabel = null;

  for (const [label, number] of Object.entries(BILLING_MONTHS)) {
    if (new RegExp(`\\b${label}\\b`, 'i').test(text)) {
      month = number;
      monthLabel = BILLING_MONTH_LABELS[number];
      break;
    }
  }

  let year = null;
  const yearMatch = text.match(/\b(20\d{2})\b/);

  if (yearMatch) {
    year = Number(yearMatch[1]);
  }

  if (!month) {
    const numeric = text.match(
      /\b(?:recibo|factura|ciclo)(?:\s+(?:de|del|en))?\s+(0?[1-9]|1[0-2])[\/-](20\d{2})\b/
    );

    if (numeric) {
      month = Number(numeric[1]);
      year = Number(numeric[2]);
      monthLabel = BILLING_MONTH_LABELS[month];
    }
  }

  if (!month) {
    return null;
  }

  return {
    month,
    monthLabel,
    year,
    precision:
      year ? 'MONTH_YEAR' : 'MONTH_ONLY'
  };
}

function parseCycleDate(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function billingPeriodReferenceLabel(reference) {
  if (!reference?.month) {
    return 'el periodo solicitado';
  }

  const monthLabel =
    reference.monthLabel ||
    BILLING_MONTH_LABELS[reference.month] ||
    `mes ${reference.month}`;

  return reference.year
    ? `${monthLabel} de ${reference.year}`
    : monthLabel;
}

function resolveBillingPeriodReference({
  experience,
  reference
}) {
  if (!reference?.month) {
    return {
      status: 'NOT_PROVIDED',
      reference: null
    };
  }

  const historyBills =
    Array.isArray(
      experience?.billingHistory?.bills
    )
      ? experience.billingHistory.bills
      : [
          experience?.currentBill,
          experience?.previousBill
        ].filter(Boolean);

  const matches = historyBills
    .map((bill, index) => ({
      bill,
      index,
      parsed:
        parseCycleDate(
          bill?.cycleDate
        )
    }))
    .filter(({ parsed }) =>
      parsed &&
      parsed.month === reference.month &&
      (
        !reference.year ||
        parsed.year === reference.year
      )
    );

  if (!matches.length) {
    return {
      status: 'NOT_FOUND',
      reference: {
        ...reference
      },
      label:
        billingPeriodReferenceLabel(
          reference
        ),
      availableBillCount:
        historyBills.length
    };
  }

  if (matches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      reference: {
        ...reference
      },
      label:
        billingPeriodReferenceLabel(
          reference
        ),
      availableBillCount:
        historyBills.length,
      matchedYears:
        matches
          .map(({ parsed }) => parsed.year)
          .filter(
            (value, index, values) =>
              values.indexOf(value) === index
          )
          .sort()
    };
  }

  const {
    bill,
    index,
    parsed
  } = matches[0];

  return {
    status: 'MATCHED',
    reference: {
      ...reference
    },
    label:
      billingPeriodReferenceLabel({
        ...reference,
        year:
          reference.year || parsed.year
      }),
    position:
      index === 0
        ? 'CURRENT'
        : index === 1
          ? 'PREVIOUS'
          : 'HISTORY',
    period:
      bill?.period ||
      bill?.cycleDate ||
      null,
    cycleDate:
      bill?.cycleDate || null,
    total:
      Number.isFinite(
        Number(bill?.total)
      )
        ? Number(bill.total)
        : null,
    availableBillCount:
      historyBills.length
  };
}

function buildBillingPeriodReferenceReply({
  validation,
  message = ''
}) {
  if (!validation) {
    return null;
  }

  const label =
    validation.label ||
    billingPeriodReferenceLabel(
      validation.reference
    );

  if (validation.status === 'NOT_FOUND') {
    return {
      handled: true,
      reply:
        `No encuentro un recibo de ${label} dentro de los ${validation.availableBillCount || 0} recibos disponibles de tu cuenta. ` +
        'No voy a sustituirlo por otro mes. Si quieres, puedo mostrarte los periodos que sí están disponibles.',
      resolutionStatus: 'UNRESOLVED',
      reasonCode:
        'BILLING_PERIOD_NOT_FOUND'
    };
  }

  if (validation.status === 'AMBIGUOUS') {
    const years =
      (validation.matchedYears || [])
        .join(', ');

    return {
      handled: true,
      reply:
        `Encontré más de un recibo correspondiente a ${label}${years ? ` (${years})` : ''}. Indícame el año para escoger el periodo correcto.`,
      resolutionStatus: 'UNRESOLVED',
      reasonCode:
        'BILLING_PERIOD_AMBIGUOUS'
    };
  }

  if (validation.status !== 'MATCHED') {
    return null;
  }

  const asksExplanation =
    messageRequestsInvoiceExplanation(
      message
    );

  if (
    asksExplanation &&
    validation.position === 'CURRENT'
  ) {
    return {
      handled: false,
      prefix:
        `Sí, encontré tu recibo de ${label}.`,
      resolutionStatus: null,
      reasonCode:
        'BILLING_PERIOD_MATCHED_CURRENT'
    };
  }

  const amountText =
    Number.isFinite(
      Number(validation.total)
    )
      ? ` fue de S/ ${Number(validation.total).toFixed(2)}`
      : ' tiene un monto disponible';

  const periodText =
    validation.period
      ? ` y corresponde a ${validation.period}`
      : '';

  let reply =
    `Tu recibo de ${label}${amountText}${periodText}.`;

  if (asksExplanation) {
    reply +=
      ' Puedo confirmar ese periodo y su monto, pero no voy a inventar una causa histórica si no está verificada para ese ciclo.';
  }

  return {
    handled: true,
    reply,
    resolutionStatus:
      asksExplanation
        ? 'PARTIALLY_RESOLVED'
        : 'RESOLVED',
    reasonCode:
      asksExplanation
        ? 'HISTORICAL_BILLING_PERIOD_CAUSE_NOT_VERIFIED'
        : 'BILLING_PERIOD_MATCHED_HISTORY'
  };
}

function buildSafeBillingPeriodReferenceMetadata(
  validation
) {
  if (!validation) {
    return null;
  }

  return {
    provided: true,
    matched:
      validation.status === 'MATCHED',
    scope:
      'AUTHENTICATED_ACCOUNT_HISTORY',
    precision:
      validation.reference?.precision || null,
    month:
      validation.reference?.month || null,
    year:
      validation.reference?.year || null,
    position:
      validation.status === 'MATCHED'
        ? validation.position || null
        : null
  };
}

function messageRequestsInvoiceExplanation(
  message
) {
  const text =
    String(message ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  return [
    'explica',
    'explicame',
    'por que',
    'porque',
    'cargos',
    'conceptos',
    'detalle'
  ].some(
    (marker) =>
      text.includes(marker)
  );
}

function buildInvoiceReferenceReply({
  validation,
  baseReply = null,
  message = ''
}) {
  if (!validation) {
    return null;
  }

  const reference =
    validation.reference ||
    'ese código';

  if (
    validation.status ===
      'NOT_FOUND'
  ) {
    return {
      handled: true,
      reply:
        `No encuentro el recibo ${reference} dentro del historial disponible de la cuenta con la que iniciaste sesión. ` +
        'Revisa el código; si quieres, puedo mostrarte tu recibo actual o resumir tus últimos recibos.',
      resolutionStatus:
        'UNRESOLVED',
      reasonCode:
        'INVOICE_REFERENCE_NOT_FOUND'
    };
  }

  if (
    validation.status !== 'MATCHED'
  ) {
    return null;
  }

  if (
    validation.position === 'CURRENT'
  ) {
    return {
      handled: false,
      prefix:
        `Sí, validé ${reference}: corresponde a tu recibo actual.`,
      reply: baseReply,
      resolutionStatus: null,
      reasonCode:
        'INVOICE_REFERENCE_MATCHED_CURRENT'
    };
  }

  const asksExplanation =
    messageRequestsInvoiceExplanation(
      message
    );

  const relation =
    validation.position === 'PREVIOUS'
      ? 'tu recibo anterior'
      : 'uno de los recibos de tu historial';

  const amountText =
    Number.isFinite(
      Number(validation.total)
    )
      ? ` totaliza S/ ${Number(validation.total).toFixed(2)}`
      : '';

  const periodText =
    validation.period
      ? ` y corresponde a ${validation.period}`
      : '';

  let reply =
    `Sí, encontré ${reference}: es ${relation}${periodText} y${amountText || ' tiene un monto disponible en el historial'}.`;

  if (asksExplanation) {
    reply +=
      ' Puedo confirmar ese recibo y su monto, pero la explicación causal auditada del prototipo está centrada en el recibo actual y su comparación con el anterior; no voy a inventar una causa histórica que no esté verificada.';
  }

  return {
    handled: true,
    reply,
    resolutionStatus:
      asksExplanation
        ? 'PARTIALLY_RESOLVED'
        : 'RESOLVED',
    reasonCode:
      asksExplanation
        ? 'HISTORICAL_INVOICE_CAUSE_NOT_VERIFIED'
        : 'INVOICE_REFERENCE_MATCHED_HISTORY'
  };
}

function buildSafeInvoiceReferenceMetadata(
  validation
) {
  if (!validation) {
    return null;
  }

  return {
    provided: true,
    matched:
      validation.status ===
        'MATCHED',
    scope:
      'AUTHENTICATED_ACCOUNT_HISTORY',
    position:
      validation.status ===
        'MATCHED'
        ? validation.position || null
        : null
  };
}

module.exports = {
  normalizeReference,
  extractExplicitInvoiceReference,
  extractExplicitBillingPeriodReference,
  extractExplicitCustomerReference,
  evaluateCustomerReference,
  buildCustomerReferenceReply,
  messageRequestsInvoiceExplanation,
  buildInvoiceReferenceReply,
  resolveBillingPeriodReference,
  buildBillingPeriodReferenceReply,
  buildSafeBillingPeriodReferenceMetadata,
  buildSafeInvoiceReferenceMetadata
};
