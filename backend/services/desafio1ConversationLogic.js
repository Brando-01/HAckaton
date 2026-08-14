const {
  sanitizeInternalTerms
} = require(
  './desafio1CustomerPresentation'
);

const {
  findHistoryChargeByText,
  analyzeChargeRecurrence
} = require(
  './desafio1BillingHistoryLogic'
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
    isPersonalBillingFollowup(
      text
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

  return [
    'no entendi',
    'no lo entendi',
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
        'monto actual',
        'total actual',
        'total de mi recibo',
        'total de mi factura',
        'cuanto es mi recibo',
        'cuanto cuesta mi recibo'
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

function buildCurrentTotalReply(
  experience,
  {
    debtQuestion = false
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

function causeSubjectForContext(
  experience,
  lastBillingIntent
) {
  const causes =
    experience?.comparison
      ?.causes || [];

  if (lastBillingIntent === 'PACKAGE_CHARGE') {
    return causes.find(
      (cause) =>
        cause.code === 'PACKAGES' &&
        cause.subject
    )?.subject || null;
  }

  const withSubject =
    causes.filter(
      (cause) =>
        cause.subject
    );

  if (withSubject.length === 1) {
    return withSubject[0].subject;
  }

  const currentItems =
    experience?.currentBill
      ?.items || [];

  if (currentItems.length === 1) {
    return {
      chargeCode:
        currentItems[0]
          .chargeCode || null,
      label:
        currentItems[0]
          .label || null
    };
  }

  return null;
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
    findHistoryChargeByText(
      history,
      message
    ) ||
    causeSubjectForContext(
      experience,
      lastBillingIntent
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
    message = '',
    lastBillingIntent = null
  } = {}
) {
  switch (intent) {
    case 'CURRENT_TOTAL': {
      if (!concise) {
        return buildCurrentTotalReply(
          experience,
          {
            debtQuestion:
              isOutstandingDebtQuestion(
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
        )
      ) {
        return `Recibo actual: ${formatMoney(bill.total)}. No tengo un saldo pendiente verificable separado del total.`;
      }

      return `Recibo actual: ${formatMoney(bill.total)}${bill.status && bill.status !== 'Estado no disponible' ? ` · ${bill.status}` : ''}.`;
    }

    case 'PREVIOUS_BILL': {
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
        message,
        lastBillingIntent:
          options.lastBillingIntent ||
          null
      }
    );

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
        ?.coveragePercent ?? null
  };
}

module.exports = {
  normalizeText,
  isGeneralBillingEducationQuery,
  isPersonalBillingFollowup,
  isBillingRepairRequest,
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
  buildPersonalBillingReply,
  buildPersonalBillingReplyForIntent,
  buildPersonalBillingMultiReply,
  buildPersonalBillingRepairSummary
};
