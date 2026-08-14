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
    (value) => text.includes(value)
  );
}

const PROFILE_INTENT_RULES = [
  {
    intent: 'PROFILE_SUMMARY',
    values: [
      'que datos tienes de mi',
      'que sabes de mi',
      'muestrame mis datos',
      'dime mis datos',
      'cuales son mis datos',
      'informacion de mi perfil',
      'datos de mi perfil'
    ]
  },
  {
    intent: 'CUSTOMER_ID',
    values: [
      'cual es mi id',
      'cual es mi identificador',
      'mi identificador',
      'cual es mi codigo de cliente',
      'mi codigo de cliente',
      'que cliente soy',
      'quien soy'
    ]
  },
  {
    intent: 'ACTIVATION_DATE',
    values: [
      'fecha de activacion',
      'cuando active mi servicio',
      'cuando se activo mi servicio',
      'desde cuando tengo el servicio',
      'desde cuando soy cliente',
      'cuando empezo mi servicio'
    ]
  },
  {
    intent: 'BILLING_CYCLE',
    values: [
      'cual es mi ciclo',
      'mi ciclo de facturacion',
      'ciclo de facturacion tengo',
      'dia de ciclo',
      'que ciclo tengo'
    ]
  },
  {
    intent: 'SERVICE_TYPE',
    values: [
      'que tipo de servicio tengo',
      'cual es mi tipo de servicio',
      'que servicio tengo',
      'tipo de linea tengo',
      'que linea tengo'
    ]
  },
  {
    intent: 'BUSINESS_TYPE',
    values: [
      'cual es mi negocio',
      'que negocio tengo',
      'tipo de negocio',
      'segmento de negocio'
    ]
  },
  {
    intent: 'CURRENT_PLAN',
    values: [
      'cual es mi plan',
      'que plan tengo',
      'nombre de mi plan',
      'mi plan actual'
    ]
  },
  {
    intent: 'DEBT_STATUS',
    predicate(text) {
      return (
        !hasAny(text, ['cuanto debo']) &&
        hasAny(
          text,
          [
            'tengo deuda',
            'estoy con deuda',
            'estoy al dia',
            'estado de mi deuda',
            'estado de deuda',
            'debo algo'
          ]
        )
      );
    }
  },
  {
    intent: 'CURRENT_CHARGES',
    values: [
      'que cargos tengo',
      'cuales son mis cargos',
      'conceptos de mi recibo',
      'detalle de mi recibo',
      'que me cobran en mi recibo',
      'que conceptos me cobran'
    ]
  },
  {
    intent: 'RECONNECTION_STATUS',
    values: [
      'tuve una reconexion',
      'tuve reconexion',
      'tengo una reconexion',
      'me reconectaron',
      'hay cargo de reconexion',
      'tengo cargo de reconexion'
    ]
  },
  {
    intent: 'DATA_ORIGIN',
    values: [
      'de donde salen mis datos',
      'de donde sale mi informacion',
      'estos datos vienen del csv',
      'estos datos son del csv',
      'estos datos vienen del dataset',
      'estos datos son del dataset',
      'fueron generados por ia',
      'la ia inventa mis datos',
      'la ia genera mis datos',
      'de donde sale mi perfil',
      'de donde sale este dato',
      'cual es la fuente de mis datos'
    ]
  }
];

const REPAIR_MARKERS = [
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
  'en sencillo',
  'puedes explicarlo mejor',
  'puedes explicarmelo mejor'
];

function isConversationRepairRequest(
  message
) {
  const text = normalizeText(message);

  return REPAIR_MARKERS.some(
    (marker) =>
      text === marker ||
      text.startsWith(`${marker} `)
  );
}

function classifyCustomerProfileIntents(
  message
) {
  const text = normalizeText(message);

  if (!text) {
    return [];
  }

  const intents = [];

  for (const rule of PROFILE_INTENT_RULES) {
    const matched =
      typeof rule.predicate === 'function'
        ? rule.predicate(text)
        : hasAny(text, rule.values || []);

    if (
      matched &&
      !intents.includes(rule.intent)
    ) {
      intents.push(rule.intent);
    }
  }

  return intents;
}

function classifyCustomerProfileIntent(
  message
) {
  return (
    classifyCustomerProfileIntents(
      message
    )[0] || null
  );
}

function resolveCustomerProfileIntents(
  message,
  {
    lastIntents = []
  } = {}
) {
  const direct =
    classifyCustomerProfileIntents(
      message
    );

  if (direct.length) {
    return direct;
  }

  if (
    isConversationRepairRequest(
      message
    ) &&
    Array.isArray(lastIntents) &&
    lastIntents.length
  ) {
    return Array.from(
      new Set(
        lastIntents.filter(Boolean)
      )
    );
  }

  return [];
}

function formatDate(value) {
  const match = String(value || '')
    .match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (!match) {
    return value ||
      'no disponible';
  }

  return (
    `${match[3]}/${match[2]}/` +
    match[1]
  );
}

function formatMoney(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? `S/ ${number.toFixed(2)}`
    : 'monto no disponible';
}

function moneyMatches(
  first,
  second,
  tolerance = 0.011
) {
  const left = Number(first);
  const right = Number(second);

  return (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.abs(left - right) <= tolerance
  );
}

function stripMatchingEmbeddedPrice(
  label,
  structuredAmount
) {
  const original =
    String(label ?? '').trim();

  if (
    !original ||
    !Number.isFinite(
      Number(structuredAmount)
    )
  ) {
    return original;
  }

  let removed = false;

  const cleaned = original
    .replace(
      /S\/\.?\s*(\d+(?:[.,]\d{1,2})?)/gi,
      (match, numericText) => {
        const embeddedAmount =
          Number(
            String(numericText)
              .replace(',', '.')
          );

        if (
          moneyMatches(
            embeddedAmount,
            structuredAmount
          )
        ) {
          removed = true;
          return '';
        }

        return match;
      }
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/[\s\-–—:;,]+$/g, '')
    .trim();

  return removed && cleaned
    ? cleaned
    : original;
}

function getPlanDisplay(experience) {
  const rawPlan =
    String(
      experience?.customer?.plan || ''
    ).trim();

  if (!rawPlan) {
    return 'no disponible';
  }

  const normalizedPlan =
    normalizeText(rawPlan);

  const matchingItem =
    (experience?.currentBill?.items || [])
      .find(
        (item) =>
          normalizeText(item?.label) ===
          normalizedPlan
      );

  return stripMatchingEmbeddedPrice(
    rawPlan,
    matchingItem?.amount
  );
}

function getDebtStatusPresentation(experience) {
  const bill =
    experience?.currentBill;

  if (!bill) {
    return {
      available: false,
      hasBill: false,
      status: null
    };
  }

  const status =
    String(
      bill.status || ''
    ).trim();

  const normalized =
    normalizeText(status);

  if (
    !status ||
    normalized ===
      'estado no disponible'
  ) {
    return {
      available: false,
      hasBill: true,
      status: null
    };
  }

  return {
    available: true,
    hasBill: true,
    status
  };
}

function buildDebtStatusReply(
  experience,
  { concise = false } = {}
) {
  const debt =
    getDebtStatusPresentation(
      experience
    );

  if (!debt.hasBill) {
    return 'No tengo un recibo actual disponible para consultar el estado de deuda.';
  }

  if (!debt.available) {
    return concise
      ? 'No tengo un estado de deuda verificable disponible, así que no puedo afirmar si tienes deuda.'
      : 'No tengo información verificable sobre tu estado de deuda en este momento. Para no darte un dato incorrecto, no puedo confirmar si tienes deuda ni si estás al día.';
  }

  return `Tu recibo actual figura como ${debt.status.toLowerCase()}.`;
}

function serviceTypeLabel(lobType) {
  const code = String(
    lobType || ''
  ).trim();

  const labels = {
    WRLS: 'Móvil',
    BB: 'Banda ancha',
    TV: 'TV',
    VOIC: 'Voz'
  };

  if (!code) {
    return 'no disponible';
  }

  return labels[code]
    ? `${labels[code]} (${code})`
    : `${code} (código del dataset)`;
}

function currentRentLabel(experience) {
  const rent =
    experience
      ?.financialExplanation
      ?.rentContext
      ?.current;

  if (
    rent?.resolved &&
    rent?.rentType
  ) {
    return rent.label
      ? `${rent.label} (${rent.rentType})`
      : rent.rentType;
  }

  return null;
}

function scenarioCodes(experience) {
  return Array.from(
    new Set(
      [
        ...(experience?.comparison
          ?.causes || []),
        ...(experience?.findings || [])
      ]
        .map((item) => item?.code)
        .filter(Boolean)
    )
  );
}

function getChargeLines(experience) {
  const items =
    experience?.currentBill?.items || [];

  return items
    .slice(0, 8)
    .map((item) => {
      const label =
        stripMatchingEmbeddedPrice(
          item?.label,
          item?.amount
        ) ||
        'Concepto';

      return (
        `${label} — ` +
        formatMoney(item?.amount)
      );
    });
}

function buildProfileSummary({
  profile,
  experience
}) {
  const bill = experience?.currentBill;
  const rent =
    currentRentLabel(experience);

  const lines = [
    'Estos son los datos que tengo disponibles para tu perfil:',
    `• ID visible: ${profile.visibleId || 'no disponible'}`,
    `• Código de cliente anonimizado: ${profile.customerCode || 'no disponible'}`,
    `• Tipo de servicio: ${serviceTypeLabel(profile.lobType)}`,
    `• Negocio: ${profile.businessType || 'no disponible'}`,
    `• Fecha de activación: ${formatDate(profile.activationDate)}`,
    `• Ciclo de facturación: ${profile.billingCycleDay ? `día ${profile.billingCycleDay}` : 'no disponible'}`,
    `• Plan identificado: ${getPlanDisplay(experience)}`
  ];

  if (bill) {
    lines.push(
      `• Recibo actual: ${formatMoney(bill.total)}`
    );

    const debt =
      getDebtStatusPresentation(
        experience
      );

    lines.push(
      debt.available
        ? `• Estado de deuda: ${debt.status}`
        : '• Estado de deuda: no disponible para verificación'
    );
  }

  if (rent) {
    lines.push(
      `• Tipo de renta: ${rent}`
    );
  }

  lines.push(
    'Si quieres, también puedo explicarte cómo se validan estos datos.'
  );

  return lines.join('\n');
}

function buildCustomerProfileReply({
  intent,
  profile,
  experience,
  concise = false
}) {
  if (!intent || !profile) {
    return null;
  }

  switch (intent) {
    case 'PROFILE_SUMMARY':
      return buildProfileSummary({
        profile,
        experience
      });

    case 'CUSTOMER_ID':
      return concise
        ? `Tu ID visible es ${profile.visibleId || 'no disponible'} y tu código de cliente anonimizado es ${profile.customerCode || 'no disponible'}.`
        : `Tu identificador visible aquí es ${profile.visibleId || 'no disponible'}. También tengo asociado el código de cliente anonimizado ${profile.customerCode || 'no disponible'}.`;

    case 'ACTIVATION_DATE':
      return `Tu servicio figura activo desde el ${formatDate(profile.activationDate)}.`;

    case 'BILLING_CYCLE':
      return profile.billingCycleDay
        ? `Tu ciclo de facturación corresponde al día ${profile.billingCycleDay}.`
        : 'No tengo un día de ciclo disponible para este perfil.';

    case 'SERVICE_TYPE':
      return `Tu servicio corresponde a ${serviceTypeLabel(profile.lobType)}.`;

    case 'BUSINESS_TYPE':
      return `Tu servicio está registrado en el negocio ${profile.businessType || 'no disponible'}.`;

    case 'CURRENT_PLAN':
      return `El plan que aparece en tu recibo actual es “${getPlanDisplay(experience)}”.`;

    case 'DEBT_STATUS':
      return buildDebtStatusReply(
        experience,
        { concise }
      );

    case 'CURRENT_CHARGES': {
      const charges =
        getChargeLines(experience);

      if (!charges.length) {
        return 'No hay conceptos visibles disponibles para tu recibo actual.';
      }

      if (concise && charges.length === 1) {
        return `En tu recibo actual aparece: ${charges[0]}.`;
      }

      return (
        'Estos son los conceptos visibles de tu recibo actual:\n' +
        charges
          .map((line) => `• ${line}`)
          .join('\n')
      );
    }

    case 'RECONNECTION_STATUS': {
      const hasReconnection =
        scenarioCodes(experience)
          .includes('RECONNECTION');

      return hasReconnection
        ? 'Sí. En este caso hay una reconexión verificada con evidencia del dataset; su impacto aparece dentro de la explicación de tu recibo.'
        : 'No encuentro una reconexión verificada para este caso, así que no voy a afirmar que ocurrió una sin respaldo suficiente.';
    }

    case 'DATA_ORIGIN':
      return (
        'Los datos de tu perfil y facturación provienen del dataset entregado para el desafío. ' +
        'El alias DEMO sí lo crea la aplicación para la interfaz. ' +
        'La IA ayuda a entender y redactar la conversación, pero no calcula los montos ni decide las causas financieras: esas respuestas se obtienen de datos estructurados y reglas deterministas.'
      );

    default:
      return null;
  }
}


function buildCustomerProfileRepairReply({
  intents,
  profile,
  experience,
  includeIntro = true
}) {
  const requested = new Set(
    (intents || []).filter(Boolean)
  );

  const sentences = [];

  if (
    requested.has('PROFILE_SUMMARY')
  ) {
    requested.add('CUSTOMER_ID');
    requested.add('SERVICE_TYPE');
    requested.add('ACTIVATION_DATE');
    requested.add('BILLING_CYCLE');
    requested.add('CURRENT_PLAN');
    requested.add('DEBT_STATUS');
  }

  if (requested.has('CUSTOMER_ID')) {
    sentences.push(
      `Tu ID visible es ${profile.visibleId || 'no disponible'} y tu código de cliente anonimizado es ${profile.customerCode || 'no disponible'}.`
    );
  }

  const serviceParts = [];

  if (requested.has('SERVICE_TYPE')) {
    serviceParts.push(
      `tu servicio es ${serviceTypeLabel(profile.lobType)}`
    );
  }

  if (requested.has('ACTIVATION_DATE')) {
    serviceParts.push(
      `está activo desde el ${formatDate(profile.activationDate)}`
    );
  }

  if (requested.has('BILLING_CYCLE')) {
    serviceParts.push(
      profile.billingCycleDay
        ? `tu ciclo es el día ${profile.billingCycleDay}`
        : 'no tengo disponible tu día de ciclo'
    );
  }

  if (serviceParts.length) {
    const [first, ...rest] = serviceParts;
    sentences.push(
      `${first.charAt(0).toUpperCase()}${first.slice(1)}${
        rest.length
          ? `, ${rest.join(' y ')}`
          : ''
      }.`
    );
  }

  if (requested.has('BUSINESS_TYPE')) {
    sentences.push(
      `Tu servicio está registrado en el negocio ${profile.businessType || 'no disponible'}.`
    );
  }

  const planRequested =
    requested.has('CURRENT_PLAN');
  const chargesRequested =
    requested.has('CURRENT_CHARGES');
  const debtRequested =
    requested.has('DEBT_STATUS');
  const plan =
    getPlanDisplay(experience);
  const bill =
    experience?.currentBill;
  const items =
    bill?.items || [];

  if (planRequested || chargesRequested) {
    if (
      planRequested &&
      chargesRequested &&
      items.length === 1
    ) {
      const visiblePlan =
        plan !== 'no disponible'
          ? plan
          : stripMatchingEmbeddedPrice(
              items[0]?.label,
              items[0]?.amount
            ) ||
            'no disponible';

      sentences.push(
        `En tu recibo aparece el plan “${visiblePlan}”, por ${formatMoney(items[0]?.amount)}.`
      );
    } else {
      if (planRequested) {
        sentences.push(
          `En tu recibo aparece el plan “${plan || 'no disponible'}”.`
        );
      }

      if (chargesRequested) {
        const charges =
          getChargeLines(experience);

        if (!charges.length) {
          sentences.push(
            'No tengo conceptos visibles para tu recibo actual.'
          );
        } else if (charges.length === 1) {
          sentences.push(
            `Tu cargo visible es ${charges[0]}.`
          );
        } else {
          sentences.push(
            `Tus cargos visibles son ${charges
              .slice(0, 3)
              .join('; ')}${
                charges.length > 3
                  ? '; y otros conceptos del recibo'
                  : ''
              }.`
          );
        }
      }
    }
  }

  if (debtRequested) {
    sentences.push(
      buildDebtStatusReply(
        experience,
        { concise: true }
      )
    );
  }

  if (requested.has('RECONNECTION_STATUS')) {
    const reply =
      buildCustomerProfileReply({
        intent: 'RECONNECTION_STATUS',
        profile,
        experience,
        concise: true
      });

    if (reply) {
      sentences.push(reply);
    }
  }

  if (requested.has('DATA_ORIGIN')) {
    const reply =
      buildCustomerProfileReply({
        intent: 'DATA_ORIGIN',
        profile,
        experience,
        concise: true
      });

    if (reply) {
      sentences.push(reply);
    }
  }

  const body =
    sentences.filter(Boolean).join(' ');

  if (!body) {
    return null;
  }

  return includeIntro
    ? `Claro. En simple:\n\n${body}`
    : body;
}

function buildCustomerProfileMultiReply({
  intents,
  profile,
  experience,
  repair = false,
  includeIntro = true
}) {
  const uniqueIntents = Array.from(
    new Set(
      (intents || []).filter(Boolean)
    )
  );

  if (!uniqueIntents.length) {
    return null;
  }

  if (
    uniqueIntents.length === 1
  ) {
    return buildCustomerProfileReply({
      intent: uniqueIntents[0],
      profile,
      experience,
      concise: repair
    });
  }

  if (repair) {
    return buildCustomerProfileRepairReply({
      intents: uniqueIntents,
      profile,
      experience,
      includeIntro
    });
  }

  if (
    uniqueIntents.includes(
      'PROFILE_SUMMARY'
    )
  ) {
    const summary =
      buildProfileSummary({
        profile,
        experience
      });

    if (
      uniqueIntents.includes(
        'DATA_ORIGIN'
      )
    ) {
      return (
        `${summary}\n\n` +
        buildCustomerProfileReply({
          intent: 'DATA_ORIGIN',
          profile,
          experience
        })
      );
    }

    return summary;
  }

  const sourceRequested =
    uniqueIntents.includes(
      'DATA_ORIGIN'
    );

  const answerIntents =
    uniqueIntents.filter(
      (intent) =>
        intent !== 'DATA_ORIGIN'
    );

  const lines = [];

  for (const intent of answerIntents) {
    const answer =
      buildCustomerProfileReply({
        intent,
        profile,
        experience,
        concise: true
      });

    if (answer) {
      lines.push(`• ${answer}`);
    }
  }

  const blocks = [];

  if (includeIntro) {
    blocks.push(
      repair
        ? 'Claro. En corto:'
        : 'Claro. Te respondo punto por punto:'
    );
  }

  if (lines.length) {
    blocks.push(lines.join('\n'));
  }

  if (sourceRequested) {
    blocks.push(
      buildCustomerProfileReply({
        intent: 'DATA_ORIGIN',
        profile,
        experience
      })
    );
  }

  return blocks.join('\n\n');
}

module.exports = {
  normalizeText,
  classifyCustomerProfileIntent,
  classifyCustomerProfileIntents,
  resolveCustomerProfileIntents,
  isConversationRepairRequest,
  buildCustomerProfileReply,
  buildCustomerProfileMultiReply,
  buildCustomerProfileRepairReply,
  serviceTypeLabel,
  formatDate
};
