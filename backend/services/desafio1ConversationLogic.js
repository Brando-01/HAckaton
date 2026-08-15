const {
  sanitizeInternalTerms
} = require(
  './desafio1CustomerPresentation'
);

const {
  analyzeChargeRecurrence
} = require(
  './desafio1BillingHistoryLogic'
);

const {
  resolveHistoryChargeSubject,
  aggregateBillingResolutions
} = require(
  './desafio1ResolutionLogic'
);

const BILLING_HISTORY_INTENTS =
  new Set([
    'BILL_HISTORY',
    'HIGHEST_BILL',
    'LATEST_INCREASE',
    'CHARGE_RECURRENCE'
  ]);

function needsBillingHistoryForIntents(
  intents = []
) {
  return (intents || []).some(
    (intent) =>
      BILLING_HISTORY_INTENTS
        .has(intent)
  );
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasAny(text, values) {
  return values.some(
    (value) =>
      text.includes(value)
  );
}

const BILLING_TERMS = [
  'recibo',
  'factura',
  'facturacion',
  'monto',
  'deuda',
  'debo',
  'pagar',
  'pago',
  'cargo',
  'descuento',
  'promocion',
  'prorrateo',
  'prorrateado',
  'paquete',
  'paquetes',
  'plan',
  'renta adelantada',
  'renta vencida',
  'historial',
  'recurrente'
];

const PERSONAL_MARKERS = [
  'mi recibo',
  'mi factura',
  'mi deuda',
  'mi pago',
  'mi plan',
  'mi tipo de renta',
  'tipo de renta tengo',
  'mi descuento',
  'mi promocion',
  'mi paquete',
  'mis paquetes',
  'mis recibos',
  'mis facturas',
  'cuanto debo',
  'cuanto tengo que pagar',
  'cuanto pague',
  'cuanto me cobraron',
  'me cobraron',
  'me aumentaron',
  'me descontaron',
  'recibo anterior',
  'factura anterior',
  'mis ultimos recibos',
  'ultimos meses',
  'recibo mas caro',
  'factura mas cara',
  'desde cuando estoy pagando mas',
  'este cargo',
  'este cobro'
];

const GENERAL_EDUCATION_PREFIXES = [
  'que es ',
  'que significa ',
  'como funciona ',
  'como se calcula ',
  'explicame que es ',
  'que quiere decir '
];

const GENERAL_HOW_TO_PREFIXES = [
  'como consulto ',
  'como puedo consultar ',
  'como veo ',
  'donde veo ',
  'donde consulto ',
  'como reviso '
];

const PERSONAL_FOLLOWUPS = [
  'por que',
  'y por que',
  'y el mes pasado',
  'el mes pasado',
  'el anterior',
  'cuanto era antes',
  'que descuento',
  'cuando termino',
  'explicamelo',
  'explicamelo mejor',
  'mas facil',
  'no entendi',
  'y eso por que',
  'y en los ultimos meses',
  'este cargo',
  'este cobro',
  'es recurrente'
];

const BILLING_DETAIL_MARKERS = [
  'mas detalle',
  'mas detalles',
  'mas a detalle',
  'a mas detalle',
  'con mas detalle',
  'con mas detalles',
  'dame mas detalle',
  'dame mas detalles',
  'quiero mas detalle',
  'quiero mas detalles',
  'quiero saber mas detalle',
  'quiero saber mas detalles',
  'explicamelo con mas detalle',
  'explicamelo con mas detalles',
  'explicamelo a mas detalle',
  'explicamelo a mayor detalle',
  'explicalo con mas detalle',
  'amplia la informacion',
  'amplia eso',
  'amplialo',
  'profundiza',
  'profundiza mas',
  'desglosalo',
  'desglosame eso',
  'que mas puedes decirme'
];

function isBillingDetailRequest(
  message
) {
  const text =
    normalizeText(message);

  if (!text) {
    return false;
  }

  return BILLING_DETAIL_MARKERS
    .some(
      (marker) =>
        text === marker ||
        text.startsWith(
          `${marker} `
        ) ||
        text.includes(
          ` ${marker}`
        )
    );
}

function isGeneralBillingEducationQuery(
  message
) {
  const text =
    normalizeText(message);

  if (!text) {
    return false;
  }

  const hasBillingTerm =
    hasAny(
      text,
      BILLING_TERMS
    );

  if (!hasBillingTerm) {
    return false;
  }

  const startsAsDefinition =
    GENERAL_EDUCATION_PREFIXES
      .some(
        (prefix) =>
          text.startsWith(prefix)
      );

  const startsAsHowTo =
    GENERAL_HOW_TO_PREFIXES
      .some(
        (prefix) =>
          text.startsWith(prefix)
      );

  // Preguntar cómo/dónde consultar el recibo es una
  // instrucción general aunque el usuario diga "mi recibo".
  if (startsAsHowTo) {
    return true;
  }

  // Una definición deja de ser general si está pidiendo
  // interpretar explícitamente un dato propio.
  if (
    PERSONAL_MARKERS.some(
      (marker) =>
        text.includes(marker)
    )
  ) {
    return false;
  }

  if (startsAsDefinition) {
    return true;
  }

  return false;
}

function isPersonalBillingFollowup(
  message
) {
  const text =
    normalizeText(message);

  return PERSONAL_FOLLOWUPS
    .some(
      (value) =>
        text === value ||
        text.startsWith(
          `${value} `
        )
    );
}

function requiresPersonalBillingAccess(
  message,
  {
    hasPersonalBillingContext =
      false
  } = {}
) {
  const text =
    normalizeText(message);

  if (!text) {
    return false;
  }

  if (
    isGeneralBillingEducationQuery(
      text
    )
  ) {
    return false;
  }

  if (
    hasPersonalBillingContext &&
    (
      isPersonalBillingFollowup(
        text
      ) ||
      isBillingDetailRequest(
        text
      ) ||
      isBillingRepairRequest(
        text
      )
    )
  ) {
    return true;
  }

  if (
    PERSONAL_MARKERS.some(
      (marker) =>
        text.includes(marker)
    )
  ) {
    return true;
  }

  const billingTerm =
    hasAny(
      text,
      BILLING_TERMS
    );

  const possessive =
    /(^| )(mi|mis|me)( |$)/
      .test(text);

  const variationQuestion =
    hasAny(
      text,
      [
        'subio',
        'aumento',
        'aumentó',
        'bajo',
        'disminuyo',
        'cambio',
        'diferencia'
      ]
    ) &&
    billingTerm;

  const explicitPersonalIntent =
    classifyPersonalBillingIntents(
      text,
      {
        hasPersonalBillingContext
      }
    ).length > 0;

  return (
    (billingTerm && possessive) ||
    variationQuestion ||
    explicitPersonalIntent
  );
}

function isBillingRepairRequest(
  message
) {
  const text = normalizeText(message);

  // Pedir profundidad no equivale a decir que la explicación
  // anterior fue incomprensible. Así evitamos consumir el umbral
  // de handoff por frases como "explícamelo a más detalle".
  if (isBillingDetailRequest(text)) {
    return false;
  }

  return [
    'no entendi',
    'no lo entendi',
    'sigo sin entender',
    'sigo sin entenderlo',
    'todavia no entiendo',
    'aun no entiendo',
    'sigo sin comprender',
    'no me quedo claro',
    'explicamelo',
    'explicamelo mejor',
    'explicamelo mas facil',
    'mas facil',
    'en simple',
    'en sencillo'
  ].some(
    (marker) =>
      text === marker ||
      text.startsWith(`${marker} `)
  );
}

function classifyPersonalBillingIntents(
  message,
  {
    hasPersonalBillingContext =
      false,
    lastBillingIntent = null
  } = {}
) {
  const text = normalizeText(message);

  if (!text) {
    return [];
  }

  const intents = [];
  const add = (intent) => {
    if (!intents.includes(intent)) {
      intents.push(intent);
    }
  };

  const detailRequest =
    isBillingDetailRequest(text);

  if (
    detailRequest &&
    hasAny(
      text,
      [
        'recibo actual',
        'factura actual',
        'recibo de este mes',
        'factura de este mes'
      ]
    )
  ) {
    add('CURRENT_TOTAL');
  }

  if (
    detailRequest &&
    hasAny(
      text,
      [
        'recibo anterior',
        'factura anterior',
        'mes pasado'
      ]
    )
  ) {
    add('PREVIOUS_BILL');
  }

  if (
    detailRequest &&
    hasAny(
      text,
      [
        'variacion',
        'diferencia',
        'por que subio',
        'por que cambio',
        'por que aumento'
      ]
    )
  ) {
    add('EXPLANATION');
  }

  const historyTrendQuestion =
    hasAny(
      text,
      [
        'historial de recibos',
        'historial de facturas',
        'mis ultimos recibos',
        'mis ultimas facturas',
        'ultimos recibos',
        'ultimas facturas',
        'ultimos meses',
        'como ha cambiado mi recibo',
        'como cambio mi recibo en los ultimos',
        'evolucion de mi recibo',
        'evolucion de mis recibos'
      ]
    );

  const highestBillQuestion =
    hasAny(
      text,
      [
        'recibo mas caro',
        'factura mas cara',
        'recibo mas alto',
        'factura mas alta',
        'cuando pague mas',
        'en que mes pague mas',
        'cual fue el mayor recibo',
        'cual fue la mayor factura'
      ]
    );

  const latestIncreaseQuestion =
    hasAny(
      text,
      [
        'desde cuando estoy pagando mas',
        'desde cuando pago mas',
        'cuando empece a pagar mas',
        'cuando comenzo a subir mi recibo',
        'cuando subio mi recibo',
        'cual fue el ultimo aumento'
      ]
    );

  const recurrenceQuestion =
    hasAny(
      text,
      [
        'unico o recurrente',
        'unica o recurrente',
        'es recurrente',
        'fue recurrente',
        'aparece todos los meses',
        'sale todos los meses',
        'me lo cobran todos los meses',
        'cada mes',
        'se repite'
      ]
    ) &&
    hasAny(
      text,
      [
        'cargo',
        'cobro',
        'paquete',
        'concepto',
        'recibo',
        'factura',
        'recurrente'
      ]
    );

  if (historyTrendQuestion) {
    add('BILL_HISTORY');
  }

  if (highestBillQuestion) {
    add('HIGHEST_BILL');
  }

  if (latestIncreaseQuestion) {
    add('LATEST_INCREASE');
  }

  if (recurrenceQuestion) {
    add('CHARGE_RECURRENCE');
  }

  if (
    hasAny(
      text,
      [
        'prorrateo',
        'prorrateado',
        'proporcional'
      ]
    )
  ) {
    add('PRORATION');
  }

  if (
    hasAny(
      text,
      [
        'renta adelantada',
        'renta vencida',
        'tipo de renta',
        'ra o rv',
        'ra rv'
      ]
    )
  ) {
    add('RENT_TYPE');
  }

  if (
    hasAny(
      text,
      [
        'descuento',
        'promocion'
      ]
    )
  ) {
    add('DISCOUNT');
  }

  const suspensionAdjustmentQuestion =
    hasAny(
      text,
      [
        'suspension',
        'suspendido',
        'suspendida',
        'dias sin servicio',
        'dia sin servicio',
        'nota de credito',
        'ajuste por corte'
      ]
    ) &&
    hasAny(
      text,
      [
        'ajuste',
        'descuento',
        'devolv',
        'credito',
        'recibo',
        'factura',
        'cobr',
        'dias',
        'servicio'
      ]
    );

  if (suspensionAdjustmentQuestion) {
    add('SUSPENSION_ADJUSTMENT');
  }

  const mentionsPackage =
    hasAny(
      text,
      [
        'paquete',
        'paquetes'
      ]
    );

  const packageChargeQuestion =
    mentionsPackage &&
    hasAny(
      text,
      [
        'cargo',
        'cobro',
        'cobraron',
        'cobrado',
        'recibo',
        'factura',
        'subio',
        'aumento',
        'cambio',
        'variacion',
        'por que'
      ]
    );

  if (packageChargeQuestion) {
    add('PACKAGE_CHARGE');
  }

  const explicitPreviousBill =
    hasAny(
      text,
      [
        'recibo anterior',
        'factura anterior',
        'recibo del mes pasado',
        'factura del mes pasado',
        'cuanto era antes',
        'cuanto pague antes',
        'cuanto pague el mes pasado',
        'cuanto pagaba'
      ]
    );

  const contextualPreviousBill =
    hasPersonalBillingContext &&
    (
      text === 'mes pasado' ||
      text === 'y el mes pasado' ||
      text === 'el anterior' ||
      text === 'y el anterior'
    );

  if (
    explicitPreviousBill ||
    contextualPreviousBill
  ) {
    add('PREVIOUS_BILL');
  }

  if (
    hasAny(
      text,
      [
        'cuanto debo',
        'cuanto tengo que pagar',
        'cuanto pago',
        'cuanto pago ahora',
        'cuanto estoy pagando',
        'cuanto estoy pagando actualmente',
        'cuanto me estan cobrando',
        'cuanto me cobran actualmente',
        'que monto estoy pagando',
        'monto actual',
        'total actual',
        'total de mi recibo',
        'total de mi factura',
        'cuanto es mi recibo',
        'cuanto cuesta mi recibo',
        'cual es mi recibo actual',
        'cual es mi factura actual',
        'cuanto vino mi recibo',
        'cuanto me vino el recibo'
      ]
    ) ||
    (
      hasAny(
        text,
        ['total', 'monto']
      ) &&
      hasAny(
        text,
        ['recibo', 'factura']
      ) &&
      /(^| )(mi|mis)( |$)/.test(text)
    )
  ) {
    add('CURRENT_TOTAL');
  }

  const variationMarkers = [
    'por que cambio',
    'por que subio',
    'por que aumento',
    'por que bajo',
    'por que disminuyo',
    'variacion',
    'diferencia de mi recibo',
    'explica mi recibo',
    'explicame mi recibo'
  ];

  if (
    !historyTrendQuestion &&
    !highestBillQuestion &&
    !latestIncreaseQuestion &&
    (
      hasAny(text, variationMarkers) ||
      (
        hasAny(
          text,
          [
            'subio',
            'aumento',
            'bajo',
            'disminuyo',
            'cambio',
            'diferencia'
          ]
        ) &&
        hasAny(
          text,
          ['recibo', 'factura', 'monto']
        )
      )
    )
  ) {
    add('EXPLANATION');
  }

  if (
    !intents.length &&
    detailRequest &&
    hasPersonalBillingContext &&
    lastBillingIntent
  ) {
    add(lastBillingIntent);
  }

  if (
    !intents.length &&
    isBillingRepairRequest(text) &&
    lastBillingIntent
  ) {
    add(lastBillingIntent);
  }

  if (
    !intents.length &&
    hasPersonalBillingContext &&
    isPersonalBillingFollowup(text)
  ) {
    add('EXPLANATION');
  }

  return intents;
}

function classifyPersonalBillingIntent(
  message,
  options = {}
) {
  const intents =
    classifyPersonalBillingIntents(
      message,
      options
    );

  return intents[0] || 'SUMMARY';
}

function formatMoney(value) {
  const amount =
    Number(value);

  if (!Number.isFinite(amount)) {
    return 'monto no disponible';
  }

  const sign =
    amount < 0 ? '-' : '';

  return (
    `${sign}S/ ${Math.abs(amount).toFixed(2)}`
  );
}

function buildVariationReply(
  experience
) {
  const customerFacing =
    experience
      ?.financialExplanation
      ?.customerFacing || {};

  const lines = [
    customerFacing.headline,
    customerFacing.summary
  ]
    .map(sanitizeInternalTerms)
    .filter(Boolean);

  const limitations =
    (customerFacing.limitations || [])
      .filter(
        (item) =>
          !/ciclo.*fecha de emisi[oó]n/i.test(
            String(item)
          )
      )
      .map(sanitizeInternalTerms);

  if (limitations.length) {
    lines.push(
      `Nota: ${limitations[0]}`
    );
  }

  return lines.join('\n\n');
}

function isOutstandingDebtQuestion(
  message
) {
  const text =
    normalizeText(message);

  return hasAny(
    text,
    [
      'cuanto debo',
      'deuda pendiente',
      'saldo pendiente',
      'cuanto me falta pagar'
    ]
  );
}

function isAmbiguousCurrentPaymentQuestion(
  message
) {
  const text =
    normalizeText(message);

  return hasAny(
    text,
    [
      'cuanto estoy pagando',
      'cuanto estoy pagando actualmente',
      'cuanto pago actualmente',
      'cuanto me estan cobrando',
      'cuanto me cobran actualmente',
      'que monto estoy pagando'
    ]
  );
}

function buildCurrentTotalReply(
  experience,
  {
    debtQuestion = false,
    paymentQuestion = false
  } = {}
) {
  const bill =
    experience?.currentBill;

  if (!bill) {
    return (
      'No tengo un recibo actual disponible para este perfil demo.'
    );
  }

  if (debtQuestion) {
    return (
      `El total de tu recibo actual es ${formatMoney(bill.total)} y corresponde a ${bill.period}. ` +
      'No tengo un saldo pendiente verificable separado del total del recibo, así que no puedo afirmar que ese importe sea exactamente lo que adeudas.'
    );
  }

  if (paymentQuestion) {
    return (
      `El total de tu recibo actual es ${formatMoney(bill.total)} y corresponde a ${bill.period}. ` +
      'Si con “cuánto estoy pagando” te refieres al saldo pendiente exacto por pagar hoy, ese dato no está disponible de forma verificable en la fuente actual; por eso no lo voy a inferir.'
    );
  }

  const status =
    bill.status &&
    bill.status !==
      'Estado no disponible'
      ? ` Estado: ${bill.status}.`
      : '';

  return (
    `Tu recibo actual es de ${formatMoney(bill.total)}. ` +
    `Corresponde a ${bill.period}.${status}`
  );
}

function buildVisibleBillConceptsDetail(
  bill,
  {
    maxItems = 5
  } = {}
) {
  const items =
    (bill?.items || [])
      .filter(
        (item) =>
          Number.isFinite(
            Number(item?.amount)
          )
      );

  if (!items.length) {
    return null;
  }

  const visible = items
    .slice(0, maxItems)
    .map(
      (item) =>
        `${sanitizeInternalTerms(item.label || 'Concepto')}: ${formatMoney(item.amount)}`
    );

  const suffix =
    items.length > visible.length
      ? ` Hay ${items.length - visible.length} concepto(s) visible(s) adicional(es) en el detalle del recibo.`
      : '';

  return (
    `Entre los conceptos visibles del recibo: ${visible.join('; ')}.${suffix}`
  );
}

function buildCurrentBillDetailReply(
  experience
) {
  const current =
    experience?.currentBill;

  if (!current) {
    return (
      'No tengo un recibo actual disponible para ampliar el detalle.'
    );
  }

  const blocks = [
    `Tu recibo actual es de ${formatMoney(current.total)} y corresponde a ${current.period}.`
  ];

  const previous =
    experience?.previousBill;
  const difference =
    Number(
      experience?.comparison
        ?.difference
    );

  if (
    previous &&
    Number.isFinite(difference)
  ) {
    if (Math.abs(difference) < 0.005) {
      blocks.push(
        `El recibo anterior fue de ${formatMoney(previous.total)} (${previous.period}) y el total no cambió de forma material frente a ese ciclo.`
      );
    } else {
      const verb =
        difference > 0
          ? 'aumentó'
          : 'disminuyó';

      blocks.push(
        `El recibo anterior fue de ${formatMoney(previous.total)} (${previous.period}), así que el actual ${verb} ${formatMoney(Math.abs(difference))}.`
      );
    }
  } else if (!previous) {
    blocks.push(
      'No hay un recibo anterior comparable disponible, así que no voy a inventar una variación mensual.'
    );
  }

  const summary =
    sanitizeInternalTerms(
      experience
        ?.financialExplanation
        ?.customerFacing
        ?.summary || ''
    );

  if (summary) {
    blocks.push(
      `Explicación verificada: ${summary}`
    );
  }

  const concepts =
    buildVisibleBillConceptsDetail(
      current
    );

  if (concepts) {
    blocks.push(concepts);
  }

  return blocks
    .filter(Boolean)
    .join('\n\n');
}

function buildPreviousBillDetailReply(
  experience
) {
  const previous =
    experience?.previousBill;

  if (!previous) {
    return buildPreviousBillReply(
      experience
    );
  }

  const blocks = [
    `Tu recibo anterior fue de ${formatMoney(previous.total)} y corresponde a ${previous.period}.`
  ];

  const current =
    experience?.currentBill;
  const difference =
    Number(
      experience?.comparison
        ?.difference
    );

  if (
    current &&
    Number.isFinite(difference)
  ) {
    if (Math.abs(difference) < 0.005) {
      blocks.push(
        `El recibo actual es de ${formatMoney(current.total)} (${current.period}) y no presenta una variación material frente al anterior.`
      );
    } else {
      const direction =
        difference > 0
          ? 'subió'
          : 'bajó';

      blocks.push(
        `Desde ese recibo hasta el actual (${formatMoney(current.total)}, ${current.period}), el total ${direction} ${formatMoney(Math.abs(difference))}.`
      );
    }
  }

  const concepts =
    buildVisibleBillConceptsDetail(
      previous
    );

  if (concepts) {
    blocks.push(concepts);
  }

  return blocks
    .filter(Boolean)
    .join('\n\n');
}

function buildPreviousBillReply(
  experience
) {
  const bill =
    experience?.previousBill;

  if (!bill) {
    return (
      'En los datos disponibles para este caso no hay un recibo anterior comparable. Por eso no voy a inventar una variación mensual.'
    );
  }

  return (
    `Tu recibo anterior fue de ${formatMoney(bill.total)} y corresponde a ${bill.period}.`
  );
}

function findFinding(
  experience,
  code
) {
  return (
    experience?.findings || []
  ).find(
    (finding) =>
      finding.code === code
  ) || null;
}

function findCause(
  experience,
  code
) {
  return (
    experience?.comparison
      ?.causes || []
  ).find(
    (cause) =>
      cause.code === code
  ) || null;
}

function buildProrationReply(
  experience
) {
  const finding =
    findFinding(
      experience,
      'PRORATION'
    );

  const cause =
    findCause(
      experience,
      'PRORATION'
    );

  const item =
    cause || finding;

  if (!item) {
    return (
      'No encontré un prorrateo verificado en el recibo actual de este perfil.'
    );
  }

  return sanitizeInternalTerms(
    item.description
  );
}

function buildDiscountReply(
  experience
) {
  const ended =
    findCause(
      experience,
      'DISCOUNT_ENDED'
    );

  if (ended) {
    return sanitizeInternalTerms(
      ended.description
    );
  }

  const active =
    findFinding(
      experience,
      'ACTIVE_DISCOUNT'
    );

  if (active) {
    return sanitizeInternalTerms(
      active.description
    );
  }

  return (
    'No encontré un descuento o fin de promoción verificado para el recibo actual de este perfil.'
  );
}

function buildPackageReply(
  experience
) {
  const cause =
    findCause(
      experience,
      'PACKAGES'
    );

  if (!cause) {
    return (
      'No encontré una variación verificable del recibo atribuible a un paquete entre los ciclos comparados.'
    );
  }

  return sanitizeInternalTerms(
    cause.description
  );
}

function buildSuspensionAdjustmentReply(
  experience
) {
  const finding =
    findFinding(
      experience,
      'SUSPENSION_ADJUSTMENT'
    );

  if (!finding) {
    return (
      'No encontré un ajuste por días de suspensión verificado en el recibo actual de este perfil. No voy a inferirlo solo porque exista un corte o una reconexión.'
    );
  }

  return sanitizeInternalTerms(
    finding.description
  );
}

function getHistory(
  experience
) {
  return experience?.billingHistory || null;
}

function historyBillLabel(bill) {
  return bill?.period ||
    bill?.cycleDate ||
    'ciclo no disponible';
}

function buildBillHistoryReply(
  experience
) {
  const history =
    getHistory(experience);

  if (!history?.availableBills) {
    return (
      'No tengo recibos históricos disponibles para este servicio.'
    );
  }

  const bills =
    history.bills || [];

  if (bills.length === 1) {
    return (
      `Solo tengo un recibo disponible: ${historyBillLabel(bills[0])}, por ${formatMoney(bills[0].total)}. ` +
      'Con un solo recibo no puedo calcular una tendencia.'
    );
  }

  const summary =
    history.summary || {};
  const oldest =
    summary.oldestBill;
  const newest =
    summary.newestBill;
  const netChange =
    Number(summary.netChange);

  const list = bills
    .map(
      (bill) =>
        `• ${historyBillLabel(bill)}: ${formatMoney(bill.total)}`
    )
    .join('\n');

  let trend = '';

  if (
    oldest &&
    newest &&
    Number.isFinite(netChange)
  ) {
    if (Math.abs(netChange) < 0.005) {
      trend =
        `Entre ${historyBillLabel(oldest)} y ${historyBillLabel(newest)}, el total terminó en el mismo nivel: ${formatMoney(newest.total)}.`;
    } else {
      const verb =
        netChange > 0
          ? 'subió'
          : 'bajó';

      trend =
        `Entre ${historyBillLabel(oldest)} y ${historyBillLabel(newest)}, el total ${verb} ${formatMoney(Math.abs(netChange))}, de ${formatMoney(oldest.total)} a ${formatMoney(newest.total)}.`;
    }
  }

  return [
    `Revisé ${history.availableBills} recibos disponibles (el actual y hasta ${history.maxPreviousBills} anteriores):`,
    list,
    trend
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildHighestBillReply(
  experience
) {
  const history =
    getHistory(experience);
  const highest =
    history?.summary
      ?.highestBill;

  if (!highest) {
    return (
      'No tengo suficiente histórico para identificar el recibo más alto.'
    );
  }

  return (
    `Dentro de los ${history.availableBills} recibos disponibles, el total más alto fue ${formatMoney(highest.total)} en ${historyBillLabel(highest)}.`
  );
}

function buildLatestIncreaseReply(
  experience
) {
  const history =
    getHistory(experience);

  if (
    !history ||
    history.availableBills < 2
  ) {
    return (
      'Necesito al menos dos recibos para identificar cuándo ocurrió un aumento.'
    );
  }

  const increase =
    history.summary
      ?.mostRecentIncrease;

  if (!increase) {
    return (
      `En los ${history.availableBills} recibos disponibles no encontré un aumento entre dos ciclos consecutivos.`
    );
  }

  const prefix =
    increase.isCurrentChange
      ? 'El aumento más reciente ocurrió'
      : 'Tu recibo actual no aumentó frente al anterior. El aumento más reciente que puedo verificar ocurrió';

  return (
    `${prefix} entre ${historyBillLabel(increase.from)} y ${historyBillLabel(increase.to)}: pasó de ${formatMoney(increase.from.total)} a ${formatMoney(increase.to.total)}, una diferencia de ${formatMoney(increase.difference)}.`
  );
}

function buildChargeRecurrenceReply(
  experience,
  message,
  {
    lastBillingIntent = null
  } = {}
) {
  const history =
    getHistory(experience);

  if (!history?.availableBills) {
    return (
      'No tengo recibos históricos disponibles para revisar si ese cargo se repite.'
    );
  }

  const subject =
    resolveHistoryChargeSubject(
      experience,
      message,
      {
        lastBillingIntent
      }
    );

  if (!subject) {
    return (
      'Puedo revisar si un cobro se repite, pero necesito que me indiques cuál cargo o paquete quieres comparar.'
    );
  }

  const recurrence =
    analyzeChargeRecurrence(
      history,
      subject
    );

  if (!recurrence ||
      recurrence.status === 'NOT_FOUND') {
    return (
      `No encontré el cargo "${subject.label || 'indicado'}" dentro de los recibos históricos disponibles.`
    );
  }

  if (
    recurrence.status ===
      'ALL_AVAILABLE'
  ) {
    return (
      `El cargo "${recurrence.label}" aparece en los ${recurrence.billCount} recibos disponibles que revisé. Dentro de este histórico se comporta como un cobro recurrente.`
    );
  }

  if (
    recurrence.status ===
      'RECURRING'
  ) {
    return (
      `El cargo "${recurrence.label}" aparece en ${recurrence.occurrenceCount} de ${recurrence.billCount} recibos disponibles. Se repite, pero no está presente en todos los recibos del histórico.`
    );
  }

  return (
    `El cargo "${recurrence.label}" aparece una sola vez dentro de los ${recurrence.billCount} recibos disponibles. En esta ventana se comporta como un cobro puntual; no puedo afirmar qué ocurrió fuera del histórico disponible.`
  );
}

function buildRentReply(
  experience
) {
  const current =
    experience
      ?.financialExplanation
      ?.rentContext
      ?.current;

  if (
    !current?.resolved ||
    !current?.rentType
  ) {
    return (
      'El tipo de renta no queda determinado de forma inequívoca con los datos disponibles, así que no voy a asumir si es RA o RV.'
    );
  }

  return (
    `${current.label} (${current.rentType}). ${current.definition}`
  );
}

function buildSummaryReply(
  experience
) {
  const facing =
    experience
      ?.financialExplanation
      ?.customerFacing;

  if (facing?.summary) {
    return sanitizeInternalTerms(
      facing.summary
    );
  }

  return buildCurrentTotalReply(
    experience
  );
}

function buildGeneralBillingEducationReply(
  message
) {
  const text =
    normalizeText(message);

  if (
    !isGeneralBillingEducationQuery(
      text
    )
  ) {
    return null;
  }

  if (
    hasAny(
      text,
      [
        'prorrateo',
        'prorrateado'
      ]
    )
  ) {
    return (
      'Un prorrateo es un cobro proporcional por un periodo parcial de servicio. Por ejemplo, puede aparecer cuando una línea se activa entre la fecha de alta y el siguiente ciclo. El monto exacto de un cliente solo se consulta después de iniciar sesión.'
    );
  }

  if (
    text.includes(
      'renta adelantada'
    )
  ) {
    return (
      'Renta adelantada (RA) significa que el periodo de servicio se factura por adelantado. Para decir si tu recibo específico es RA necesito consultar tus datos después del login.'
    );
  }

  if (
    text.includes(
      'renta vencida'
    )
  ) {
    return (
      'Renta vencida (RV) significa que el periodo de servicio se factura después de transcurrido. Para identificar tu caso particular necesito que inicies sesión.'
    );
  }

  if (
    GENERAL_HOW_TO_PREFIXES.some(
      (prefix) =>
        text.startsWith(prefix)
    ) &&
    hasAny(
      text,
      [
        'recibo',
        'factura',
        'estado de cuenta'
      ]
    )
  ) {
    return (
      'Puedes consultar la información personal del recibo iniciando sesión en Mi Movistar. Lucía seguirá disponible sin login para preguntas generales, pero te pedirá autenticarte antes de mostrar montos, cargos o causas de tu cuenta.'
    );
  }

  if (
    text.includes('descuento') ||
    text.includes('promocion')
  ) {
    return (
      'Los descuentos o promociones pueden tener una duración definida. Cuando terminan, el recibo puede aumentar aunque el plan no haya cambiado. Para confirmar si eso ocurrió en tu caso hay que revisar tu facturación autenticada.'
    );
  }

  return null;
}


function buildPersonalBillingReplyForIntent(
  experience,
  intent,
  {
    concise = false,
    detail = false,
    message = '',
    lastBillingIntent = null
  } = {}
) {
  switch (intent) {
    case 'CURRENT_TOTAL': {
      if (detail) {
        return buildCurrentBillDetailReply(
          experience
        );
      }

      if (!concise) {
        return buildCurrentTotalReply(
          experience,
          {
            debtQuestion:
              isOutstandingDebtQuestion(
                message
              ),
            paymentQuestion:
              isAmbiguousCurrentPaymentQuestion(
                message
              )
          }
        );
      }

      const bill =
        experience?.currentBill;

      if (!bill) {
        return 'No tengo un recibo actual disponible.';
      }

      if (
        isOutstandingDebtQuestion(
          message
        ) ||
        isAmbiguousCurrentPaymentQuestion(
          message
        )
      ) {
        return `Recibo actual: ${formatMoney(bill.total)}. El saldo pendiente exacto por pagar no está disponible de forma verificable en la fuente actual.`;
      }

      return `Recibo actual: ${formatMoney(bill.total)}${bill.status && bill.status !== 'Estado no disponible' ? ` · ${bill.status}` : ''}.`;
    }

    case 'PREVIOUS_BILL': {
      if (detail) {
        return buildPreviousBillDetailReply(
          experience
        );
      }

      if (!concise) {
        return buildPreviousBillReply(
          experience
        );
      }

      const bill =
        experience?.previousBill;

      return bill
        ? `Recibo anterior: ${formatMoney(bill.total)} (${bill.period}).`
        : 'No hay un recibo anterior comparable disponible.';
    }

    case 'BILL_HISTORY':
      return buildBillHistoryReply(
        experience
      );

    case 'HIGHEST_BILL':
      return buildHighestBillReply(
        experience
      );

    case 'LATEST_INCREASE':
      return buildLatestIncreaseReply(
        experience
      );

    case 'CHARGE_RECURRENCE':
      return buildChargeRecurrenceReply(
        experience,
        message,
        {
          lastBillingIntent
        }
      );

    case 'PRORATION':
      return buildProrationReply(
        experience
      );

    case 'DISCOUNT':
      return buildDiscountReply(
        experience
      );

    case 'PACKAGE_CHARGE':
      return buildPackageReply(
        experience
      );

    case 'SUSPENSION_ADJUSTMENT':
      return buildSuspensionAdjustmentReply(
        experience
      );

    case 'RENT_TYPE': {
      const current =
        experience
          ?.financialExplanation
          ?.rentContext
          ?.current;

      if (
        concise &&
        current?.resolved &&
        current?.rentType
      ) {
        return `Tipo de renta: ${current.label || current.rentType} (${current.rentType}).`;
      }

      return buildRentReply(
        experience
      );
    }

    case 'EXPLANATION': {
      if (detail) {
        return buildCurrentBillDetailReply(
          experience
        );
      }

      if (concise) {
        const summary =
          experience
            ?.financialExplanation
            ?.customerFacing
            ?.summary;

        if (summary) {
          return sanitizeInternalTerms(
            summary
          );
        }
      }

      return buildVariationReply(
        experience
      );
    }

    default:
      return buildSummaryReply(
        experience
      );
  }
}


function buildPersonalBillingRepairSummary(
  experience,
  intents,
  {
    includeIntro = true,
    message = '',
    lastBillingIntent = null
  } = {}
) {
  const uniqueIntents = Array.from(
    new Set(
      (intents || []).filter(Boolean)
    )
  );

  const sentences = uniqueIntents
    .map(
      (intent) =>
        buildPersonalBillingReplyForIntent(
          experience,
          intent,
          {
            concise: true,
            message,
            lastBillingIntent
          }
        )
    )
    .filter(Boolean);

  const body = sentences.join(' ');

  if (!body) {
    return null;
  }

  return includeIntro
    ? `Claro. En simple:\n\n${body}`
    : body;
}

function buildPersonalBillingMultiReply(
  experience,
  intents,
  {
    repair = false,
    detail = false,
    includeIntro = true,
    message = '',
    lastBillingIntent = null
  } = {}
) {
  const uniqueIntents = Array.from(
    new Set(
      (intents || []).filter(Boolean)
    )
  );

  if (!uniqueIntents.length) {
    return null;
  }

  if (uniqueIntents.length === 1) {
    return buildPersonalBillingReplyForIntent(
      experience,
      uniqueIntents[0],
      {
        concise: repair,
        detail,
        message,
        lastBillingIntent
      }
    );
  }

  if (repair) {
    return buildPersonalBillingRepairSummary(
      experience,
      uniqueIntents,
      {
        includeIntro,
        message,
        lastBillingIntent
      }
    );
  }

  const lines = uniqueIntents
    .map(
      (intent) =>
        buildPersonalBillingReplyForIntent(
          experience,
          intent,
          {
            concise: true,
            detail,
            message,
            lastBillingIntent
          }
        )
    )
    .filter(Boolean)
    .map((reply) => `• ${reply}`);

  const blocks = [];

  if (includeIntro) {
    blocks.push(
      repair
        ? 'Claro. En corto:'
        : 'Claro. Te respondo punto por punto:'
    );
  }

  blocks.push(lines.join('\n'));

  return blocks.join('\n\n');
}

function buildPersonalBillingReply(
  experience,
  message,
  options = {}
) {
  const intent =
    options.forcedIntent ||
    classifyPersonalBillingIntent(
      message,
      options
    );

  const reply =
    buildPersonalBillingReplyForIntent(
      experience,
      intent,
      {
        concise:
          isBillingRepairRequest(
            message
          ),
        detail:
          isBillingDetailRequest(
            message
          ),
        message,
        lastBillingIntent:
          options.lastBillingIntent ||
          null
      }
    );

  const resolution =
    aggregateBillingResolutions({
      experience,
      intents: [intent],
      message,
      lastBillingIntent:
        options.lastBillingIntent ||
        null
    });

  return {
    reply,
    intent,
    source:
      'DESAFIO1_DETERMINISTIC',
    financialReasoningByLlm:
      false,
    explanationStatus:
      experience
        ?.financialExplanation
        ?.status || null,
    coveragePercent:
      experience
        ?.financialExplanation
        ?.coveragePercent ?? null,
    resolution,
    resolutionStatus:
      resolution?.status || null,
    nextActions:
      resolution?.nextActions || []
  };
}

module.exports = {
  normalizeText,
  isGeneralBillingEducationQuery,
  isPersonalBillingFollowup,
  isBillingDetailRequest,
  isBillingRepairRequest,
  isOutstandingDebtQuestion,
  isAmbiguousCurrentPaymentQuestion,
  requiresPersonalBillingAccess,
  classifyPersonalBillingIntent,
  classifyPersonalBillingIntents,
  needsBillingHistoryForIntents,
  buildGeneralBillingEducationReply,
  buildBillHistoryReply,
  buildHighestBillReply,
  buildLatestIncreaseReply,
  buildChargeRecurrenceReply,
  buildPackageReply,
  buildSuspensionAdjustmentReply,
  buildCurrentBillDetailReply,
  buildPreviousBillDetailReply,
  buildPersonalBillingReply,
  buildPersonalBillingReplyForIntent,
  buildPersonalBillingMultiReply,
  buildPersonalBillingRepairSummary
};
