function roundMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(
    (number + Number.EPSILON) * 100
  ) / 100;
}

function formatMoney(value) {
  const amount = roundMoney(value);
  const sign = amount < 0 ? '-' : '';

  return `${sign}S/ ${Math.abs(amount).toFixed(2)}`;
}

function formatDateEs(value) {
  const match = String(value || '')
    .match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return null;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function sanitizeInternalTerms(value) {
  return String(value || '')
    .replace(/Brainy Reconexiones/gi, 'los registros de reconexión')
    .replace(/Brainy Prorrateo/gi, 'los registros de prorrateo')
    .replace(/Brainy/gi, 'los registros disponibles')
    .replace(/\bel dataset\b/gi, 'los datos disponibles')
    .replace(/\bdel dataset\b/gi, 'de los datos disponibles')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function reconnectionCustomerDescription(cause) {
  const amount = formatMoney(
    cause?.impactAmount
  );

  const date = (
    cause?.evidence
      ?.brainyReconnections || []
  )
    .map((item) =>
      formatDateEs(
        item?.reconnectionDate
      )
    )
    .find(Boolean);

  if (date) {
    return (
      `Se agregó ${amount} por la reconexión de tu servicio realizada el ${date}. ` +
      'Este cargo ya está incluido en el total de tu recibo.'
    );
  }

  return (
    `Se agregó ${amount} por la reconexión de tu servicio. ` +
    'Este cargo ya está incluido en el total de tu recibo.'
  );
}

function discountEndedCustomerDescription(cause) {
  const amount = formatMoney(
    cause?.impactAmount
  );

  const description =
    cause?.chargeChange?.description ||
    cause?.evidence?.previousDiscount
      ?.description ||
    'promoción aplicada';

  const endDate = formatDateEs(
    cause?.evidence?.previousDiscount
      ?.endDate
  );

  if (cause?.code === 'DISCOUNT_REMOVED') {
    return (
      `Tu recibo aumentó ${amount} porque el descuento "${description}" ya no aparece en el recibo actual. ` +
      'No contamos con evidencia suficiente para afirmar una fecha exacta de término.'
    );
  }

  if (endDate) {
    return (
      `Tu recibo aumentó ${amount} porque terminó el descuento "${description}". ` +
      `La promoción registra como fecha de término el ${endDate}.`
    );
  }

  return (
    `Tu recibo aumentó ${amount} porque terminó el descuento "${description}".`
  );
}

function planChangeCustomerDescription(cause) {
  const impact = roundMoney(
    cause?.impactAmount
  );

  if (impact > 0) {
    return (
      `El cambio de plan aumentó tu recibo en ${formatMoney(impact)}. ` +
      'El nuevo cargo de plan coincide con el cambio registrado en tu servicio.'
    );
  }

  return (
    `El cambio de plan redujo tu recibo en ${formatMoney(impact)}. ` +
    'El nuevo cargo de plan coincide con el cambio registrado en tu servicio.'
  );
}

function packageCustomerDescription(cause) {
  const impact = roundMoney(
    cause?.impactAmount
  );

  const description =
    cause?.chargeChange
      ?.description ||
    'paquete adicional';

  const event =
    cause?.packageEvent ||
    cause?.chargeChange?.status ||
    'CHANGED';

  if (event === 'ADDED') {
    return (
      `En tu recibo apareció un cargo de ${formatMoney(impact)} correspondiente al paquete "${description}". ` +
      'Ese importe explica la variación de ese concepto.'
    );
  }

  if (event === 'REMOVED') {
    return (
      `Tu recibo bajó ${formatMoney(Math.abs(impact))} porque dejó de aparecer el paquete "${description}". ` +
      'La reducción coincide con la variación de ese concepto.'
    );
  }

  if (impact > 0) {
    return (
      `El cargo del paquete "${description}" aumentó ${formatMoney(impact)} entre ambos recibos.`
    );
  }

  return (
    `El cargo del paquete "${description}" disminuyó ${formatMoney(Math.abs(impact))} entre ambos recibos.`
  );
}

function prorationCustomerDescription(finding) {
  const amount = formatMoney(
    finding?.amount ??
    finding?.impactAmount
  );

  const start = formatDateEs(
    finding?.periodStartDate
  );

  const end = formatDateEs(
    finding?.periodEndDate
  );

  const period =
    start && end
      ? ` por el periodo parcial del ${start} al ${end}`
      : '';

  return (
    `Tu recibo incluye ${amount} de prorrateo${period}. ` +
    'Este importe ya está incluido en el total del recibo.'
  );
}

function activeDiscountCustomerDescription(finding) {
  const amount = formatMoney(
    finding?.discountAmount ??
    Math.abs(
      Number(finding?.impactOnBill) || 0
    )
  );

  const description =
    finding?.description ||
    finding?.translation ||
    null;

  return description
    ? `Tienes un descuento de ${amount} aplicado en este recibo: "${description}".`
    : `Tienes un descuento de ${amount} aplicado en este recibo.`;
}

function suspensionAdjustmentCustomerDescription(
  finding
) {
  const amount = formatMoney(
    finding?.amount
  );

  const start = formatDateEs(
    finding?.periodStartDate
  );
  const end = formatDateEs(
    finding?.periodEndDate
  );

  const period =
    start && end
      ? ` del ${start} al ${end}`
      : '';

  const days = Number(
    finding?.suspendedDays
  );
  const daysText =
    Number.isInteger(days) &&
    days > 0
      ? ` por ${days} día${days === 1 ? '' : 's'} sin servicio`
      : '';

  return (
    `Se verificó un ajuste de ${amount} a tu favor${daysText}${period}. ` +
    'El periodo coincide con el corte y termina el día anterior a la reconexión. Este ajuste se presenta como información verificada y no se suma nuevamente al total del recibo.'
  );
}

function buildCustomerCauseDescription(cause) {
  switch (cause?.code) {
    case 'RECONNECTION':
      return reconnectionCustomerDescription(
        cause
      );

    case 'DISCOUNT_ENDED':
    case 'DISCOUNT_REMOVED':
      return discountEndedCustomerDescription(
        cause
      );

    case 'PLAN_CHANGE':
      return planChangeCustomerDescription(
        cause
      );

    case 'PACKAGES':
      return packageCustomerDescription(
        cause
      );

    case 'PRORATION': {
      const finding =
        cause?.evidence?.findings?.[0];

      return finding
        ? prorationCustomerDescription(
            finding
          )
        : sanitizeInternalTerms(
            cause?.explanation
          );
    }

    default:
      return sanitizeInternalTerms(
        cause?.explanation
      );
  }
}

function buildCustomerFindingDescription(
  finding
) {
  switch (finding?.code) {
    case 'PRORATION':
      return prorationCustomerDescription(
        finding
      );

    case 'ACTIVE_DISCOUNT':
      return activeDiscountCustomerDescription(
        finding
      );

    case 'SUSPENSION_ADJUSTMENT':
      return suspensionAdjustmentCustomerDescription(
        finding
      );

    default:
      return sanitizeInternalTerms(
        finding?.explanation
      );
  }
}

function getImpactPresentation(item) {
  if (item?.code === 'PRORATION') {
    return 'INCLUDED_IN_TOTAL';
  }

  if (item?.code === 'ACTIVE_DISCOUNT') {
    return 'APPLIED_TO_TOTAL';
  }

  if (
    item?.code ===
      'SUSPENSION_ADJUSTMENT'
  ) {
    return 'VERIFIED_CREDIT_CONTEXT';
  }

  return 'VARIATION';
}

function buildVerification(item) {
  const sourceMap = {
    RECONNECTION: [
      'Facturación',
      'Registro de reconexión',
      'Órdenes del servicio'
    ],
    DISCOUNT_ENDED: [
      'Facturación',
      'Registro de promociones'
    ],
    DISCOUNT_REMOVED: [
      'Facturación',
      'Registro de promociones'
    ],
    PLAN_CHANGE: [
      'Facturación',
      'Órdenes del servicio'
    ],
    PACKAGES: [
      'Facturación'
    ],
    PRORATION: [
      'Facturación',
      'Registro de prorrateo'
    ],
    ACTIVE_DISCOUNT: [
      'Facturación',
      'Registro de promociones'
    ],
    SUSPENSION_ADJUSTMENT: [
      'Facturación',
      'Registro de notas',
      'Registro de reconexión'
    ]
  };

  if (
    item?.code === 'PACKAGES' &&
    (item?.evidence?.orders || [])
      .length
  ) {
    sourceMap.PACKAGES = [
      'Facturación',
      'Órdenes del servicio'
    ];
  }

  const evidenceLevel =
    item?.evidenceLevel || null;

  return {
    evidenceLevel,
    label:
      evidenceLevel === 'HIGH'
        ? 'Evidencia alta'
        : evidenceLevel === 'MEDIUM'
          ? 'Evidencia media'
          : evidenceLevel === 'LOW'
            ? 'Evidencia baja'
            : 'Evidencia no clasificada',
    sources:
      sourceMap[item?.code] || [
        'Facturación'
      ]
  };
}

function buildCustomerFacing({
  explanation,
  causes,
  findings
}) {
  const source =
    explanation?.customerFacing || {};

  const interpretation =
    explanation?.interpretation || {};

  const proration =
    findings.find(
      (item) =>
        item.code === 'PRORATION'
    ) || null;

  let summary = sanitizeInternalTerms(
    source.summary
  );

  if (
    interpretation.status ===
      'NO_PREVIOUS_BILL' &&
    proration
  ) {
    summary = proration.description;
  } else if (
    interpretation.status ===
      'FULLY_EXPLAINED' &&
    causes.length === 1
  ) {
    summary = causes[0].description;
  } else if (
    interpretation.status ===
      'FULLY_EXPLAINED' &&
    causes.length > 1
  ) {
    summary =
      `La variación queda explicada por ${causes.length} movimientos verificados en tu facturación.`;
  }

  const details = [
    ...causes.map(
      (cause) => cause.description
    ),
    ...findings.map(
      (finding) => finding.description
    )
  ].filter(Boolean);

  const limitations = (
    source.limitations || []
  )
    .filter(
      (item) =>
        !/ciclo.*fecha de emisi[oó]n/i.test(
          String(item)
        )
    )
    .map(sanitizeInternalTerms)
    .filter(Boolean);

  return {
    headline:
      sanitizeInternalTerms(
        source.headline ||
        'Análisis del recibo'
      ),
    summary,
    details: Array.from(
      new Set(details)
    ),
    limitations
  };
}

module.exports = {
  formatMoney,
  formatDateEs,
  sanitizeInternalTerms,
  packageCustomerDescription,
  suspensionAdjustmentCustomerDescription,
  buildCustomerCauseDescription,
  buildCustomerFindingDescription,
  getImpactPresentation,
  buildVerification,
  buildCustomerFacing
};
