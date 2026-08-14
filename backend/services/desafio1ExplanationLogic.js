const {
  MONEY_EPSILON,
  roundMoney,
  sumMoney,
  uniqueValues
} = require(
  './desafio1BillingLogic'
);

const PHASE3_RULE_VERSION =
  'desafio1-phase3-rules-v2';

const MONEY_MATCH_TOLERANCE =
  0.011;

const PLAN_ORDER_REASONS =
  new Set([
    'cambio de plan',
    'hacia un plan menor retencion',
    'hacia un plan mayor retencion'
  ]);

const RENT_TYPE_DEFINITIONS = {
  RA: {
    code: 'RA',
    label: 'Renta adelantada',
    definition:
      'La renta está identificada como adelantada: el periodo de servicio se factura por adelantado.'
  },

  RV: {
    code: 'RV',
    label: 'Renta vencida',
    definition:
      'La renta está identificada como vencida: el periodo de servicio se factura después de transcurrido.'
  }
};

function normalizeText(value) {
  return String(
    value ?? ''
  )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .trim()
    .replace(/\s+/g, ' ');
}

function moneyMatches(
  a,
  b,
  tolerance =
    MONEY_MATCH_TOLERANCE
) {
  return Math.abs(
    roundMoney(a) -
    roundMoney(b)
  ) < tolerance;
}

function dateOnly(value) {
  const normalized =
    String(value ?? '')
      .trim();

  const match =
    normalized.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  return match
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

function compareDateStrings(
  a,
  b
) {
  const left = dateOnly(a);
  const right = dateOnly(b);

  if (!left || !right) {
    return null;
  }

  if (left === right) {
    return 0;
  }

  return left < right
    ? -1
    : 1;
}

function daysInclusive(
  startValue,
  endValue
) {
  const start = dateOnly(startValue);
  const end = dateOnly(endValue);

  if (!start || !end) {
    return null;
  }

  const startMs = Date.parse(
    `${start}T00:00:00.000Z`
  );
  const endMs = Date.parse(
    `${end}T00:00:00.000Z`
  );

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs < startMs
  ) {
    return null;
  }

  return Math.floor(
    (endMs - startMs) / 86400000
  ) + 1;
}

function previousDate(value) {
  const normalized = dateOnly(value);

  if (!normalized) {
    return null;
  }

  const milliseconds = Date.parse(
    `${normalized}T00:00:00.000Z`
  );

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return new Date(
    milliseconds - 86400000
  ).toISOString().slice(0, 10);
}

function periodContains(
  outerStart,
  outerEnd,
  innerStart,
  innerEnd
) {
  const outerStartDate = dateOnly(outerStart);
  const outerEndDate = dateOnly(outerEnd);
  const innerStartDate = dateOnly(innerStart);
  const innerEndDate = dateOnly(innerEnd);

  if (
    !outerStartDate ||
    !outerEndDate ||
    !innerStartDate ||
    !innerEndDate
  ) {
    return false;
  }

  return (
    outerStartDate <= innerStartDate &&
    outerEndDate >= innerEndDate
  );
}

function formatDateEs(value) {
  const normalized =
    dateOnly(value);

  if (!normalized) {
    return null;
  }

  const [
    year,
    month,
    day
  ] = normalized.split('-');

  return `${day}/${month}/${year}`;
}

function formatMoney(value) {
  const amount =
    roundMoney(value);

  return `S/ ${Math.abs(amount).toFixed(2)}`;
}

function getItemMap(invoice) {
  return new Map(
    (
      invoice?.items ||
      []
    ).map(
      (item) => [
        item.chargeCode,
        item
      ]
    )
  );
}

function getChangeItemContext(
  change,
  currentInvoice,
  previousInvoice
) {
  const currentMap =
    getItemMap(
      currentInvoice
    );

  const previousMap =
    getItemMap(
      previousInvoice
    );

  return {
    current:
      currentMap.get(
        change.chargeCode
      ) || null,

    previous:
      previousMap.get(
        change.chargeCode
      ) || null
  };
}

function itemTextValues(item) {
  if (!item) {
    return [];
  }

  return uniqueValues([
    item.description,
    ...(item.descriptions || []),
    item.classification,
    ...(item.classifications || []),
    item.group,
    ...(item.groups || []),
    item.subgroup,
    ...(item.subgroups || [])
  ]).map(normalizeText);
}

function isPlanItem(item) {
  const texts =
    itemTextValues(item);

  if (!texts.length) {
    return false;
  }

  const explicitClassification =
    texts.some(
      (value) =>
        value.includes(
          'cargo recurrente de plan'
        )
    );

  if (explicitClassification) {
    return true;
  }

  const looksLikeFixedCharge =
    texts.some(
      (value) =>
        value.includes(
          'cargo fijo'
        )
    );

  const mentionsPlan =
    texts.some(
      (value) =>
        /(^| )plan( |$)/.test(
          value
        )
    );

  return (
    looksLikeFixedCharge &&
    mentionsPlan
  );
}

function isPackageItem(item) {
  if (!item) {
    return false;
  }

  const groups = uniqueValues([
    item.group,
    ...(item.groups || [])
  ])
    .map(normalizeText);

  const classifications = uniqueValues([
    item.classification,
    ...(item.classifications || [])
  ])
    .map(normalizeText);

  return (
    groups.some(
      (value) =>
        value === 'paquetes'
    ) ||
    classifications.some(
      (value) =>
        /(^| )paquete(s)?( |$)/.test(
          value
        )
    )
  );
}

function isExplicitPackageOrder(order) {
  const text = normalizeText([
    order?.reason,
    order?.itemType
  ].filter(Boolean).join(' '));

  if (
    !/(^| )paquete(s)?( |$)/.test(
      text
    )
  ) {
    return false;
  }

  return [
    'activacion',
    'afiliacion',
    'desactivacion'
  ].some(
    (marker) =>
      text.includes(marker)
  );
}

function isDiscountDescription(
  value
) {
  const normalized =
    normalizeText(value);

  return (
    normalized.includes(
      'descuento'
    ) ||
    normalized.includes(
      'dscto'
    ) ||
    normalized.includes(
      'dsct'
    ) ||
    normalized.includes(
      'dcto'
    ) ||
    normalized.includes(
      'fideliza'
    )
  );
}

function isProportionalComponent(
  component
) {
  const text =
    normalizeText([
      component?.group,
      component?.subgroup
    ].filter(Boolean).join(' '));

  return text.includes(
    'proporcional'
  );
}

function buildRentContext(
  invoiceEvidence,
  invoice
) {
  const observed =
    uniqueValues([
      ...(
        invoiceEvidence
          ?.observedRentTypes ||
        []
      ),
      ...(
        invoice?.items ||
        []
      ).map(
        (item) =>
          item.rentType
      )
    ])
      .map(
        (value) =>
          String(value)
            .trim()
            .toUpperCase()
      )
      .filter(
        (value) =>
          value === 'RA' ||
          value === 'RV'
      );

  const sources =
    uniqueValues(
      (
        invoice?.items ||
        []
      )
        .filter(
          (item) =>
            item.rentType
        )
        .map(
          (item) =>
            item.rentTypeSource
        )
    );

  if (observed.length === 1) {
    return {
      resolved: true,
      ambiguous: false,
      rentType: observed[0],
      ...RENT_TYPE_DEFINITIONS[
        observed[0]
      ],
      sources
    };
  }

  return {
    resolved: false,
    ambiguous:
      observed.length > 1,
    rentType: null,
    label: null,
    definition: null,
    observedRentTypes:
      observed,
    sources
  };
}

function buildComponentIndex(invoice) {
  const components = [];

  for (
    const item of
      invoice?.items || []
  ) {
    for (
      const component of
        item.components || []
    ) {
      components.push({
        ...component,
        chargeCode:
          item.chargeCode,
        itemDescription:
          item.description,
        rentType:
          item.rentType,
        rentTypeSource:
          item.rentTypeSource,
        ignoreForExplanation:
          item.ignoreForExplanation
      });
    }
  }

  return components;
}

function matchProrationFindings({
  invoice,
  invoiceEvidence,
  rentContext
}) {
  const findings = [];
  const unmatchedEvidence = [];

  const proportionalComponents =
    buildComponentIndex(invoice)
      .filter(
        (component) =>
          !component.ignoreForExplanation &&
          isProportionalComponent(
            component
          )
      );

  const usedComponentRows =
    new Set();

  for (
    const evidence of
      invoiceEvidence?.proration || []
  ) {
    const match =
      proportionalComponents.find(
        (component) =>
          !usedComponentRows.has(
            component.sourceRow
          ) &&
          moneyMatches(
            component.amount,
            evidence.amount
          )
      );

    if (!match) {
      unmatchedEvidence.push(
        evidence
      );
      continue;
    }

    if (
      match.sourceRow !== null &&
      match.sourceRow !== undefined
    ) {
      usedComponentRows.add(
        match.sourceRow
      );
    }

    const periodStart =
      formatDateEs(
        evidence.periodStartDate
      );

    const periodEnd =
      formatDateEs(
        evidence.periodEndDate
      );

    const rentType =
      match.rentType ||
      (
        rentContext?.resolved
          ? rentContext.rentType
          : null
      );

    findings.push({
      code: 'PRORATION',
      label: 'Prorrateo',
      amount:
        roundMoney(
          evidence.amount
        ),
      evidenceLevel: 'HIGH',
      ruleId:
        'PRORATION_BRAINY_EXACT_PROPORTIONAL_COMPONENT',
      chargeCode:
        match.chargeCode,
      chargeDescription:
        match.description ||
        match.itemDescription ||
        null,
      periodStartDate:
        evidence.periodStartDate,
      periodEndDate:
        evidence.periodEndDate,
      rentType,
      sourceRows: {
        facturacion:
          match.sourceRow !== null &&
          match.sourceRow !== undefined
            ? [match.sourceRow]
            : [],
        brainy:
          evidence.sourceRows || []
      },
      explanation:
        periodStart && periodEnd
          ? `El recibo incluye ${formatMoney(evidence.amount)} de prorrateo por el periodo del ${periodStart} al ${periodEnd}. El monto proviene de Brainy Prorrateo y coincide con un cargo proporcional del recibo.`
          : `El recibo incluye ${formatMoney(evidence.amount)} de prorrateo. El monto proviene de Brainy Prorrateo y coincide con un cargo proporcional del recibo.`
    });
  }

  return {
    findings,
    unmatchedEvidence
  };
}

function normalizedDiscountKey(
  evidence
) {
  return [
    normalizeText(
      evidence?.description
    ),
    dateOnly(
      evidence?.startDate
    ) || '',
    String(
      evidence?.chargeCode || ''
    ).trim()
  ].join('|');
}

function findMatchingDiscountEvidence({
  change,
  previousEvidence,
  currentEvidence,
  currentCycleDate
}) {
  const targetDescription =
    normalizeText(
      change.description
    );

  const impact =
    roundMoney(
      change.delta
    );

  const previousCandidates =
    (
      previousEvidence
        ?.discountsAndInstallments ||
      []
    ).filter(
      (evidence) =>
        evidence.amount > 0 &&
        moneyMatches(
          evidence.amount,
          impact
        ) &&
        normalizeText(
          evidence.description
        ) ===
          targetDescription
    );

  if (
    previousCandidates.length !== 1
  ) {
    return null;
  }

  const previous =
    previousCandidates[0];

  const key =
    normalizedDiscountKey(
      previous
    );

  const equivalentCurrent =
    (
      currentEvidence
        ?.discountsAndInstallments ||
      []
    ).find(
      (evidence) =>
        normalizedDiscountKey(
          evidence
        ) === key
    ) || null;

  const finalInstallment =
    Number.isFinite(
      Number(
        previous.currentInstallment
      )
    ) &&
    Number.isFinite(
      Number(
        previous.promotionDuration
      )
    ) &&
    Number(
      previous.promotionDuration
    ) > 0 &&
    Number(
      previous.currentInstallment
    ) >=
      Number(
        previous.promotionDuration
      );

  const endComparison =
    compareDateStrings(
      previous.endDate,
      currentCycleDate
    );

  const endReached =
    endComparison !== null &&
    endComparison <= 0;

  return {
    previous,
    equivalentCurrent,
    finalInstallment,
    endReached
  };
}

function buildReconnectionCauses({
  analysis,
  claimedChargeCodes
}) {
  const causes = [];

  if (!analysis.comparison) {
    return causes;
  }

  const currentReconnections =
    analysis.evidence?.current
      ?.reconnection || [];

  const grouped = new Map();

  for (
    const evidence of
      currentReconnections
  ) {
    const code =
      String(
        evidence.code || ''
      ).trim();

    if (!code) {
      continue;
    }

    if (!grouped.has(code)) {
      grouped.set(code, []);
    }

    grouped.get(code).push(
      evidence
    );
  }

  for (
    const change of
      analysis.comparison
        .chargeChanges || []
  ) {
    if (
      claimedChargeCodes.has(
        change.chargeCode
      ) ||
      change.ignoreForExplanation ||
      change.delta <= MONEY_EPSILON ||
      change.previousAmount >
        MONEY_EPSILON
    ) {
      continue;
    }

    const evidenceRows =
      grouped.get(
        change.chargeCode
      ) || [];

    if (!evidenceRows.length) {
      continue;
    }

    const evidenceAmount =
      sumMoney(
        evidenceRows.map(
          (evidence) =>
            evidence.amount
        )
      );

    if (
      !moneyMatches(
        evidenceAmount,
        change.delta
      )
    ) {
      continue;
    }

    const supportingOrders =
      (
        analysis.evidence
          ?.ordersBetweenBills ||
        []
      ).filter((order) => {
        const reason =
          normalizeText(
            order.reason
          );

        return (
          reason.includes(
            'reactivacion'
          ) ||
          reason.includes(
            'suspension'
          )
        );
      });

    const reconnectionDate =
      evidenceRows
        .map(
          (evidence) =>
            formatDateEs(
              evidence.reconnectionDate
            )
        )
        .find(Boolean) ||
      null;

    claimedChargeCodes.add(
      change.chargeCode
    );

    causes.push({
      code: 'RECONNECTION',
      label: 'Cargo por reconexión',
      impactAmount:
        roundMoney(
          change.delta
        ),
      direction: 'INCREASE',
      evidenceLevel: 'HIGH',
      ruleId:
        'RECONNECTION_EXACT_CHARGE_AND_BRAINY',
      claimedChargeCodes: [
        change.chargeCode
      ],
      chargeChange: {
        chargeCode:
          change.chargeCode,
        description:
          change.description,
        previousAmount:
          change.previousAmount,
        currentAmount:
          change.currentAmount,
        delta:
          change.delta
      },
      evidence: {
        brainyReconnections:
          evidenceRows.map(
            (evidence) => ({
              amount:
                evidence.amount,
              code:
                evidence.code,
              description:
                evidence.description,
              reconnectionDate:
                evidence.reconnectionDate,
              cutDate:
                evidence.cutDate,
              occurrences:
                evidence.occurrences,
              sourceRows:
                evidence.sourceRows
            })
          ),
        orders:
          supportingOrders
      },
      explanation:
        reconnectionDate
          ? `Se agregó ${formatMoney(change.delta)} por reconexión. Brainy Reconexiones registra el mismo cargo y monto, con fecha de reconexión ${reconnectionDate}.`
          : `Se agregó ${formatMoney(change.delta)} por reconexión. Brainy Reconexiones registra el mismo cargo y monto.`
    });
  }

  return causes;
}

function buildDiscountEndCauses({
  analysis,
  claimedChargeCodes
}) {
  const causes = [];

  if (!analysis.comparison) {
    return causes;
  }

  for (
    const change of
      analysis.comparison
        .chargeChanges || []
  ) {
    if (
      claimedChargeCodes.has(
        change.chargeCode
      ) ||
      change.ignoreForExplanation ||
      change.delta <= MONEY_EPSILON ||
      change.previousAmount >=
        -MONEY_EPSILON ||
      !isDiscountDescription(
        change.description
      )
    ) {
      continue;
    }

    const match =
      findMatchingDiscountEvidence({
        change,
        previousEvidence:
          analysis.evidence
            ?.previous,
        currentEvidence:
          analysis.evidence
            ?.current,
        currentCycleDate:
          analysis.currentBill
            ?.cycleDate
      });

    if (!match) {
      continue;
    }

    if (
      match.equivalentCurrent
    ) {
      continue;
    }

    const ended =
      match.finalInstallment ||
      match.endReached;

    const evidenceLevel =
      ended
        ? 'HIGH'
        : 'MEDIUM';

    const code =
      ended
        ? 'DISCOUNT_ENDED'
        : 'DISCOUNT_REMOVED';

    const label =
      ended
        ? 'Fin de descuento/promoción'
        : 'Descuento retirado';

    const endDate =
      formatDateEs(
        match.previous.endDate
      );

    claimedChargeCodes.add(
      change.chargeCode
    );

    causes.push({
      code,
      label,
      impactAmount:
        roundMoney(
          change.delta
        ),
      direction: 'INCREASE',
      evidenceLevel,
      ruleId:
        ended
          ? 'DISCOUNT_NEGATIVE_CHARGE_REMOVED_AND_BRAINY_END_CONFIRMED'
          : 'DISCOUNT_NEGATIVE_CHARGE_REMOVED_AND_BRAINY_MATCHED',
      claimedChargeCodes: [
        change.chargeCode
      ],
      chargeChange: {
        chargeCode:
          change.chargeCode,
        description:
          change.description,
        previousAmount:
          change.previousAmount,
        currentAmount:
          change.currentAmount,
        delta:
          change.delta
      },
      evidence: {
        previousDiscount: {
          description:
            match.previous.description,
          translation:
            match.previous.translation,
          amount:
            match.previous.amount,
          rentType:
            match.previous.rentType,
          startDate:
            match.previous.startDate,
          endDate:
            match.previous.endDate,
          promotionDuration:
            match.previous
              .promotionDuration,
          currentInstallment:
            match.previous
              .currentInstallment,
          occurrences:
            match.previous
              .occurrences,
          sourceRows:
            match.previous
              .sourceRows
        },
        finalInstallment:
          match.finalInstallment,
        endReached:
          match.endReached
      },
      explanation:
        ended && endDate
          ? `El recibo aumentó ${formatMoney(change.delta)} porque dejó de aplicarse el descuento "${change.description}". Brainy registra que la promoción llegó a su tramo final y consigna fecha de término ${endDate}.`
          : ended
            ? `El recibo aumentó ${formatMoney(change.delta)} porque dejó de aplicarse el descuento "${change.description}". Brainy confirma que la promoción llegó a su tramo final.`
            : `El recibo aumentó ${formatMoney(change.delta)} porque el descuento "${change.description}" ya no aparece en el recibo actual. Brainy respalda el descuento del ciclo anterior, pero no se afirma una fecha exacta de término.`
    });
  }

  return causes;
}

function buildPlanChangeCauses({
  analysis,
  claimedChargeCodes
}) {
  const causes = [];

  if (!analysis.comparison) {
    return causes;
  }

  const explicitOrders =
    (
      analysis.evidence
        ?.ordersBetweenBills ||
      []
    ).filter((order) => {
      const reason =
        normalizeText(
          order.reason
        );

      return (
        PLAN_ORDER_REASONS.has(
          reason
        ) ||
        reason.includes(
          'cambio de plan'
        )
      );
    });

  if (!explicitOrders.length) {
    return causes;
  }

  const planChanges =
    (
      analysis.comparison
        .chargeChanges ||
      []
    ).filter((change) => {
      if (
        claimedChargeCodes.has(
          change.chargeCode
        ) ||
        change.ignoreForExplanation
      ) {
        return false;
      }

      const context =
        getChangeItemContext(
          change,
          analysis.currentBill,
          analysis.previousBill
        );

      return (
        isPlanItem(
          context.current
        ) ||
        isPlanItem(
          context.previous
        )
      );
    });

  if (!planChanges.length) {
    return causes;
  }

  const hasRemovedPlan =
    planChanges.some(
      (change) =>
        change.previousAmount >
          MONEY_EPSILON &&
        change.currentAmount <=
          MONEY_EPSILON
    );

  const hasAddedPlan =
    planChanges.some(
      (change) =>
        change.currentAmount >
          MONEY_EPSILON &&
        change.previousAmount <=
          MONEY_EPSILON
    );

  const hasChangedPlan =
    planChanges.some(
      (change) =>
        change.status ===
          'CHANGED'
    );

  if (
    !(
      (
        hasRemovedPlan &&
        hasAddedPlan
      ) ||
      hasChangedPlan
    )
  ) {
    return causes;
  }

  const impactAmount =
    sumMoney(
      planChanges.map(
        (change) =>
          change.delta
      )
    );

  if (
    Math.abs(
      impactAmount
    ) < MONEY_EPSILON
  ) {
    return causes;
  }

  for (
    const change of
      planChanges
  ) {
    claimedChargeCodes.add(
      change.chargeCode
    );
  }

  const oldPlans =
    planChanges
      .filter(
        (change) =>
          change.previousAmount >
            MONEY_EPSILON
      )
      .map(
        (change) => ({
          chargeCode:
            change.chargeCode,
          description:
            getChangeItemContext(
              change,
              analysis.currentBill,
              analysis.previousBill
            ).previous
              ?.description ||
            change.description,
          amount:
            change.previousAmount,
          rentType:
            change.previousRentType
        })
      );

  const newPlans =
    planChanges
      .filter(
        (change) =>
          change.currentAmount >
            MONEY_EPSILON
      )
      .map(
        (change) => ({
          chargeCode:
            change.chargeCode,
          description:
            getChangeItemContext(
              change,
              analysis.currentBill,
              analysis.previousBill
            ).current
              ?.description ||
            change.description,
          amount:
            change.currentAmount,
          rentType:
            change.currentRentType
        })
      );

  const direction =
    impactAmount > 0
      ? 'INCREASE'
      : 'DECREASE';

  causes.push({
    code: 'PLAN_CHANGE',
    label: 'Cambio de plan',
    impactAmount,
    direction,
    evidenceLevel: 'HIGH',
    ruleId:
      'PLAN_ORDER_AND_PLAN_CHARGE_TRANSITION',
    claimedChargeCodes:
      planChanges.map(
        (change) =>
          change.chargeCode
      ),
    evidence: {
      orders:
        explicitOrders,
      oldPlans,
      newPlans
    },
    explanation:
      impactAmount > 0
        ? `El cambio de plan registrado entre ambos ciclos incrementó el recibo en ${formatMoney(impactAmount)}. La orden de cambio y la sustitución de cargos de plan coinciden.`
        : `El cambio de plan registrado entre ambos ciclos redujo el recibo en ${formatMoney(impactAmount)}. La orden de cambio y la sustitución de cargos de plan coinciden.`
  });

  return causes;
}

function buildPackageCauses({
  analysis,
  claimedChargeCodes
}) {
  const causes = [];

  if (!analysis.comparison) {
    return causes;
  }

  const orders =
    analysis.evidence
      ?.ordersBetweenBills || [];

  for (
    const change of
      analysis.comparison
        .chargeChanges || []
  ) {
    if (
      claimedChargeCodes.has(
        change.chargeCode
      ) ||
      change.ignoreForExplanation ||
      Math.abs(change.delta) <
        MONEY_EPSILON
    ) {
      continue;
    }

    const context =
      getChangeItemContext(
        change,
        analysis.currentBill,
        analysis.previousBill
      );

    const currentIsPackage =
      isPackageItem(
        context.current
      );

    const previousIsPackage =
      isPackageItem(
        context.previous
      );

    if (
      !currentIsPackage &&
      !previousIsPackage
    ) {
      continue;
    }

    const sourceItem =
      currentIsPackage
        ? context.current
        : context.previous;

    const changeSubscribers =
      new Set(
        (
          change.subscriberKeys ||
          sourceItem?.subscriberKeys ||
          []
        )
          .map(
            (value) =>
              String(value || '')
                .trim()
          )
          .filter(Boolean)
      );

    const supportingOrders =
      orders.filter(
        (order) => {
          if (
            !isExplicitPackageOrder(
              order
            )
          ) {
            return false;
          }

          const orderSubscriber =
            String(
              order?.subscriberKey ||
              ''
            ).trim();

          return (
            !orderSubscriber ||
            !changeSubscribers.size ||
            changeSubscribers.has(
              orderSubscriber
            )
          );
        }
      );

    const impactAmount =
      roundMoney(change.delta);

    const direction =
      impactAmount > 0
        ? 'INCREASE'
        : 'DECREASE';

    const description =
      sourceItem?.description ||
      change.description ||
      'paquete adicional';

    let event = 'CHANGED';

    if (
      change.previousAmount <=
        MONEY_EPSILON &&
      change.currentAmount >
        MONEY_EPSILON
    ) {
      event = 'ADDED';
    } else if (
      change.previousAmount >
        MONEY_EPSILON &&
      change.currentAmount <=
        MONEY_EPSILON
    ) {
      event = 'REMOVED';
    }

    let explanation;

    if (event === 'ADDED') {
      explanation =
        `Apareció un nuevo cargo de paquete por ${formatMoney(impactAmount)}: "${description}". El importe coincide exactamente con la variación de ese concepto en la facturación.`;
    } else if (event === 'REMOVED') {
      explanation =
        `El recibo disminuyó ${formatMoney(impactAmount)} porque dejó de aparecer el cargo de paquete "${description}". La reducción coincide exactamente con la variación de ese concepto.`;
    } else if (impactAmount > 0) {
      explanation =
        `El cargo del paquete "${description}" aumentó ${formatMoney(impactAmount)} entre ambos recibos. Ese cambio coincide exactamente con la variación del concepto facturado.`;
    } else {
      explanation =
        `El cargo del paquete "${description}" disminuyó ${formatMoney(impactAmount)} entre ambos recibos. Ese cambio coincide exactamente con la variación del concepto facturado.`;
    }

    claimedChargeCodes.add(
      change.chargeCode
    );

    causes.push({
      code: 'PACKAGES',
      label: 'Paquete adicional',
      impactAmount,
      direction,
      evidenceLevel: 'HIGH',
      ruleId:
        supportingOrders.length
          ? 'PACKAGE_STRUCTURED_CHARGE_DELTA_WITH_ORDER'
          : 'PACKAGE_STRUCTURED_CHARGE_DELTA',
      claimedChargeCodes: [
        change.chargeCode
      ],
      chargeChange: {
        chargeCode:
          change.chargeCode,
        description,
        previousAmount:
          change.previousAmount,
        currentAmount:
          change.currentAmount,
        delta:
          change.delta,
        status:
          change.status
      },
      evidence: {
        packageMarker: {
          group:
            sourceItem?.group ||
            null,
          groups:
            sourceItem?.groups ||
            [],
          classification:
            sourceItem
              ?.classification ||
            null,
          classifications:
            sourceItem
              ?.classifications ||
            [],
          sourceRows:
            sourceItem?.sourceRows ||
            []
        },
        orders:
          supportingOrders
      },
      packageEvent: event,
      explanation
    });
  }

  return causes;
}

function buildProrationVariationCauses({
  analysis,
  prorationFindings,
  claimedChargeCodes
}) {
  const causes = [];

  if (!analysis.comparison) {
    return causes;
  }

  const grouped = new Map();

  for (
    const finding of
      prorationFindings
  ) {
    if (!finding.chargeCode) {
      continue;
    }

    if (
      !grouped.has(
        finding.chargeCode
      )
    ) {
      grouped.set(
        finding.chargeCode,
        []
      );
    }

    grouped.get(
      finding.chargeCode
    ).push(finding);
  }

  for (
    const change of
      analysis.comparison
        .chargeChanges || []
  ) {
    if (
      claimedChargeCodes.has(
        change.chargeCode
      ) ||
      change.ignoreForExplanation ||
      change.delta <= MONEY_EPSILON
    ) {
      continue;
    }

    const findings =
      grouped.get(
        change.chargeCode
      ) || [];

    if (!findings.length) {
      continue;
    }

    const amount =
      sumMoney(
        findings.map(
          (finding) =>
            finding.amount
        )
      );

    if (
      !moneyMatches(
        amount,
        change.delta
      )
    ) {
      continue;
    }

    claimedChargeCodes.add(
      change.chargeCode
    );

    causes.push({
      code: 'PRORATION',
      label: 'Prorrateo',
      impactAmount:
        roundMoney(
          change.delta
        ),
      direction: 'INCREASE',
      evidenceLevel: 'HIGH',
      ruleId:
        'PRORATION_EXACT_VARIATION_MATCH',
      claimedChargeCodes: [
        change.chargeCode
      ],
      evidence: {
        findings
      },
      explanation:
        findings.length === 1
          ? findings[0].explanation
          : `Se identificaron prorrateos por ${formatMoney(amount)} que coinciden exactamente con la variación del cargo proporcional.`
    });
  }

  return causes;
}

function matchActiveDiscountFindings({
  invoice,
  invoiceEvidence
}) {
  const findings = [];
  const items =
    invoice?.items || [];

  const usedItemCodes =
    new Set();

  for (
    const evidence of
      invoiceEvidence
        ?.discountsAndInstallments || []
  ) {
    const description =
      normalizeText(
        evidence.description
      );

    if (
      !description ||
      evidence.amount <=
        MONEY_EPSILON
    ) {
      continue;
    }

    const item =
      items.find(
        (candidate) =>
          !usedItemCodes.has(
            candidate.chargeCode
          ) &&
          candidate.amount <
            -MONEY_EPSILON &&
          normalizeText(
            candidate.description
          ) === description &&
          moneyMatches(
            Math.abs(
              candidate.amount
            ),
            evidence.amount
          )
      );

    if (!item) {
      continue;
    }

    usedItemCodes.add(
      item.chargeCode
    );

    findings.push({
      code: 'ACTIVE_DISCOUNT',
      label: 'Descuento vigente',
      discountAmount:
        roundMoney(
          evidence.amount
        ),
      impactOnBill:
        roundMoney(
          -Math.abs(
            evidence.amount
          )
        ),
      evidenceLevel: 'HIGH',
      ruleId:
        'ACTIVE_DISCOUNT_BRAINY_EXACT_NEGATIVE_CHARGE',
      chargeCode:
        item.chargeCode,
      description:
        evidence.description,
      translation:
        evidence.translation,
      rentType:
        evidence.rentType,
      startDate:
        evidence.startDate,
      endDate:
        evidence.endDate,
      promotionDuration:
        evidence.promotionDuration,
      currentInstallment:
        evidence.currentInstallment,
      sourceRows: {
        facturacion:
          item.sourceRows || [],
        brainy:
          evidence.sourceRows || []
      },
      explanation:
        `El recibo aplica un descuento de ${formatMoney(evidence.amount)} identificado como "${evidence.description}".`
    });
  }

  return findings;
}

function matchSuspensionAdjustmentFindings({
  analysis
}) {
  const notes =
    analysis?.evidence
      ?.current
      ?.creditDebitNotes || [];

  const reconnections =
    analysis?.evidence
      ?.current
      ?.reconnection || [];

  if (
    !notes.length ||
    !reconnections.length
  ) {
    return [];
  }

  const invoices = [
    analysis?.previousBill,
    analysis?.currentBill
  ].filter(Boolean);

  const findings = [];
  const usedNoteRows = new Set();

  for (const note of notes) {
    const noteAmount = Number(
      note?.amount
    );

    const noteStart = dateOnly(
      note?.periodStartDate
    );
    const noteEnd = dateOnly(
      note?.periodEndDate
    );

    if (
      !Number.isFinite(noteAmount) ||
      noteAmount >= -MONEY_EPSILON ||
      String(
        note?.cancelChargeType || ''
      ).toUpperCase() !== 'CRD' ||
      !note?.chargeCode ||
      !noteStart ||
      !noteEnd
    ) {
      continue;
    }

    const reconnection =
      reconnections.find(
        (candidate) => {
          const cutDate = dateOnly(
            candidate?.cutDate
          );
          const reconnectionDate =
            dateOnly(
              candidate
                ?.reconnectionDate
            );

          return (
            cutDate &&
            reconnectionDate &&
            noteStart === cutDate &&
            noteEnd ===
              previousDate(
                reconnectionDate
              )
          );
        }
      );

    if (!reconnection) {
      continue;
    }

    const candidates = [];

    for (const invoice of invoices) {
      const item =
        (invoice.items || []).find(
          (candidate) =>
            candidate.chargeCode ===
              note.chargeCode &&
            candidate.rentType === 'RA'
        );

      if (!item) {
        continue;
      }

      for (const component of
        item.components || []) {
        const netAmount = Number(
          component?.netAmount
        );

        if (
          !Number.isFinite(netAmount) ||
          netAmount <= MONEY_EPSILON ||
          !periodContains(
            component.periodStartDate,
            component.periodEndDate,
            noteStart,
            noteEnd
          )
        ) {
          continue;
        }

        const suspendedDays =
          daysInclusive(
            noteStart,
            noteEnd
          );
        const billedDays =
          daysInclusive(
            component.periodStartDate,
            component.periodEndDate
          );

        if (
          !suspendedDays ||
          !billedDays
        ) {
          continue;
        }

        const expectedCredit =
          Math.abs(netAmount) *
          suspendedDays /
          billedDays;

        if (
          !moneyMatches(
            Math.abs(noteAmount),
            expectedCredit
          )
        ) {
          continue;
        }

        candidates.push({
          item,
          component,
          suspendedDays,
          billedDays,
          expectedCredit,
          difference:
            Math.abs(
              Math.abs(noteAmount) -
              expectedCredit
            )
        });
      }
    }

    if (!candidates.length) {
      continue;
    }

    candidates.sort(
      (left, right) =>
        left.difference -
        right.difference
    );

    const match = candidates[0];
    const noteRows =
      note.sourceRows || [];

    if (
      noteRows.some(
        (row) =>
          usedNoteRows.has(row)
      )
    ) {
      continue;
    }

    noteRows.forEach(
      (row) =>
        usedNoteRows.add(row)
    );

    findings.push({
      code: 'SUSPENSION_ADJUSTMENT',
      label:
        'Ajuste por días de suspensión',
      amount:
        roundMoney(
          Math.abs(noteAmount)
        ),
      evidenceLevel: 'HIGH',
      ruleId:
        'SUSPENSION_RA_NOTE_EXACT_PERIOD_NET_PRORATION',
      chargeCode:
        note.chargeCode,
      chargeDescription:
        match.item.description || null,
      periodStartDate:
        noteStart,
      periodEndDate:
        noteEnd,
      cutDate:
        dateOnly(
          reconnection.cutDate
        ),
      reconnectionDate:
        dateOnly(
          reconnection
            .reconnectionDate
        ),
      rentType: 'RA',
      suspendedDays:
        match.suspendedDays,
      billedPeriodDays:
        match.billedDays,
      causalImpact: false,
      sourceRows: {
        facturacion: [
          match.component.sourceRow
        ].filter(
          (value) =>
            value !== null &&
            value !== undefined
        ),
        note: noteRows,
        reconnection:
          reconnection.sourceRows || []
      },
      explanation:
        `Se verificó un ajuste de ${formatMoney(Math.abs(noteAmount))} a favor por ${match.suspendedDays} día${match.suspendedDays === 1 ? '' : 's'} sin servicio, del ${formatDateEs(noteStart)} al ${formatDateEs(noteEnd)}. El periodo coincide con el corte y termina el día anterior a la reconexión; además, el importe se reconcilia proporcionalmente con el cargo neto de renta adelantada. Este ajuste se conserva como hallazgo verificable y no se suma otra vez como causa del cambio entre recibos.`
    });
  }

  return findings;
}

function buildAdjustmentFindings({
  invoiceEvidence,
  excludedSourceRows = []
}) {
  const excluded = new Set(
    excludedSourceRows
  );
  return (
    invoiceEvidence
      ?.creditDebitNotes || []
  )
    .filter(
      (evidence) =>
        !(evidence.sourceRows || [])
          .some(
            (row) =>
              excluded.has(row)
          )
    )
    .map(
    (evidence) => ({
      code:
        'ADJUSTMENT_NOTE_CONTEXT',
      label:
        'Nota de crédito/débito registrada',
      amount:
        roundMoney(
          evidence.amount
        ),
      evidenceLevel:
        evidence.matchedChargeCode
          ? 'MEDIUM'
          : 'LOW',
      ruleId:
        'NOTE_CONTEXT_ONLY_NO_CAUSAL_ASSIGNMENT',
      chargeCode:
        evidence.chargeCode,
      cancelChargeType:
        evidence.cancelChargeType,
      effectiveDate:
        evidence.effectiveDate,
      periodStartDate:
        evidence.periodStartDate,
      periodEndDate:
        evidence.periodEndDate,
      matchedChargeCode:
        evidence.matchedChargeCode,
      sourceRows:
        evidence.sourceRows || [],
      explanation:
        'Existe una nota/ajuste relacionado con el ciclo. Se conserva como contexto, pero no se suma automáticamente como causa de la variación porque el dataset no permite asumir de forma segura su efecto final en el recibo.'
    })
  );
}

function buildUnexplainedChanges({
  comparison,
  claimedChargeCodes
}) {
  if (!comparison) {
    return [];
  }

  return (
    comparison.chargeChanges || []
  )
    .filter(
      (change) =>
        !claimedChargeCodes.has(
          change.chargeCode
        )
    )
    .map(
      (change) => ({
        chargeCode:
          change.chargeCode,
        description:
          change.description,
        delta:
          change.delta,
        status:
          change.status,
        ignoredForExplanation:
          change.ignoreForExplanation
      })
    );
}

function calculateCoverage({
  comparison,
  claimedChargeCodes
}) {
  if (!comparison) {
    return null;
  }

  const changes =
    comparison.chargeChanges ||
    [];

  const totalAbsoluteMovement =
    changes.reduce(
      (sum, change) =>
        sum +
        Math.abs(
          Number(change.delta) ||
          0
        ),
      0
    );

  if (
    totalAbsoluteMovement <
      MONEY_EPSILON
  ) {
    return 100;
  }

  const explainedAbsoluteMovement =
    changes.reduce(
      (sum, change) =>
        claimedChargeCodes.has(
          change.chargeCode
        )
          ? sum +
            Math.abs(
              Number(change.delta) ||
              0
            )
          : sum,
      0
    );

  const ratio =
    explainedAbsoluteMovement /
    totalAbsoluteMovement;

  return Math.round(
    Math.max(
      0,
      Math.min(
        1,
        ratio
      )
    ) * 1000
  ) / 10;
}

function buildCustomerFacing({
  analysis,
  interpretation
}) {
  const difference =
    analysis.comparison
      ?.difference ?? null;

  const causes =
    interpretation.causes;

  const prorationFindings =
    interpretation.currentBillFindings
      .filter(
        (finding) =>
          finding.code ===
          'PRORATION'
      );

  let headline =
    'Análisis del recibo';

  if (
    difference !== null &&
    Math.abs(difference) >=
      MONEY_EPSILON
  ) {
    headline =
      difference > 0
        ? `Tu recibo aumentó ${formatMoney(difference)}`
        : `Tu recibo bajó ${formatMoney(difference)}`;
  } else if (
    difference !== null
  ) {
    headline =
      'Tu recibo mantiene el mismo total';
  } else if (
    prorationFindings.length
  ) {
    headline =
      `Tu recibo incluye un prorrateo de ${formatMoney(prorationFindings[0].amount)}`;
  }

  let summary =
    'No se encontró una causa financiera verificable para afirmar el motivo de la variación.';

  if (
    interpretation.status ===
      'NO_PREVIOUS_BILL'
  ) {
    summary =
      prorationFindings.length
        ? prorationFindings[0]
            .explanation
        : 'No existe un recibo anterior disponible en el dataset para hacer una comparación mensual.';
  } else if (
    interpretation.status ===
      'NO_VARIATION'
  ) {
    summary =
      'Los dos recibos comparados tienen el mismo total.';
  } else if (
    causes.length === 1 &&
    interpretation.status ===
      'FULLY_EXPLAINED'
  ) {
    summary =
      causes[0].explanation;
  } else if (
    causes.length > 1 &&
    interpretation.status ===
      'FULLY_EXPLAINED'
  ) {
    summary =
      `La variación de ${formatMoney(difference)} queda conciliada por ${causes.length} causas verificadas con datos de facturación y fuentes de respaldo.`;
  } else if (
    causes.length
  ) {
    summary =
      `Se verificó parte de la variación, pero queda ${formatMoney(interpretation.unexplainedAmount)} sin una causa suficientemente respaldada.`;
  }

  const details = [
    ...causes.map(
      (cause) =>
        cause.explanation
    ),
    ...prorationFindings
      .filter(
        (finding) =>
          !causes.some(
            (cause) =>
              cause.code ===
                'PRORATION' &&
              cause.claimedChargeCodes
                ?.includes(
                  finding.chargeCode
                )
          )
      )
      .map(
        (finding) =>
          finding.explanation
      )
  ];

  const limitations = [];

  if (
    interpretation.unexplainedAmount !==
      null &&
    Math.abs(
      interpretation
        .unexplainedAmount
    ) >= MONEY_EPSILON
  ) {
    limitations.push(
      `Queda una diferencia neta de ${formatMoney(interpretation.unexplainedAmount)} que el motor no asigna a una causa sin evidencia suficiente.`
    );
  }

  limitations.push(
    'El campo de ciclo se usa para ordenar y comparar recibos; no se interpreta automáticamente como fecha de emisión.'
  );

  return {
    headline,
    summary,
    details:
      uniqueValues(details),
    limitations:
      uniqueValues(
        limitations
      )
  };
}

function interpretBillingAnalysis(
  analysis
) {
  if (
    !analysis ||
    !analysis.currentBill
  ) {
    throw new Error(
      'Se requiere un análisis válido de la Fase 2'
    );
  }

  const currentRentContext =
    buildRentContext(
      analysis.evidence
        ?.current,
      analysis.currentBill
    );

  const previousRentContext =
    analysis.previousBill
      ? buildRentContext(
          analysis.evidence
            ?.previous,
          analysis.previousBill
        )
      : null;

  const proration =
    matchProrationFindings({
      invoice:
        analysis.currentBill,
      invoiceEvidence:
        analysis.evidence
          ?.current,
      rentContext:
        currentRentContext
    });

  const activeDiscounts =
    matchActiveDiscountFindings({
      invoice:
        analysis.currentBill,
      invoiceEvidence:
        analysis.evidence
          ?.current
    });

  const suspensionAdjustments =
    matchSuspensionAdjustmentFindings({
      analysis
    });

  const suspensionNoteRows =
    suspensionAdjustments.flatMap(
      (finding) =>
        finding.sourceRows?.note || []
    );

  const adjustments =
    buildAdjustmentFindings({
      invoiceEvidence:
        analysis.evidence
          ?.current,
      excludedSourceRows:
        suspensionNoteRows
    });

  const currentBillFindings = [
    ...proration.findings,
    ...activeDiscounts,
    ...suspensionAdjustments,
    ...adjustments
  ];

  const claimedChargeCodes =
    new Set();

  const causes = [];

  causes.push(
    ...buildReconnectionCauses({
      analysis,
      claimedChargeCodes
    })
  );

  causes.push(
    ...buildDiscountEndCauses({
      analysis,
      claimedChargeCodes
    })
  );

  causes.push(
    ...buildPlanChangeCauses({
      analysis,
      claimedChargeCodes
    })
  );

  causes.push(
    ...buildProrationVariationCauses({
      analysis,
      prorationFindings:
        proration.findings,
      claimedChargeCodes
    })
  );

  causes.push(
    ...buildPackageCauses({
      analysis,
      claimedChargeCodes
    })
  );

  const difference =
    analysis.comparison
      ?.difference ?? null;

  const explainedNetAmount =
    difference === null
      ? null
      : sumMoney(
          causes.map(
            (cause) =>
              cause.impactAmount
          )
        );

  const unexplainedAmount =
    difference === null
      ? null
      : roundMoney(
          difference -
          explainedNetAmount
        );

  let status =
    'UNEXPLAINED';

  if (!analysis.comparison) {
    status =
      'NO_PREVIOUS_BILL';
  } else if (
    Math.abs(
      difference
    ) < MONEY_EPSILON
  ) {
    status =
      'NO_VARIATION';
  } else if (
    Math.abs(
      unexplainedAmount
    ) < MONEY_EPSILON
  ) {
    status =
      'FULLY_EXPLAINED';
  } else if (
    causes.length
  ) {
    status =
      'PARTIALLY_EXPLAINED';
  }

  const interpretation = {
    ruleVersion:
      PHASE3_RULE_VERSION,
    status,
    difference,
    explainedNetAmount,
    unexplainedAmount,
    coveragePercent:
      calculateCoverage({
        comparison:
          analysis.comparison,
        claimedChargeCodes
      }),
    causes,
    currentBillFindings,
    rentContext: {
      current:
        currentRentContext,
      previous:
        previousRentContext
    },
    unexplainedChanges:
      buildUnexplainedChanges({
        comparison:
          analysis.comparison,
        claimedChargeCodes
      }),
    diagnostics: {
      unmatchedProrationEvidence:
        proration.unmatchedEvidence,
      claimedChargeCodes:
        Array.from(
          claimedChargeCodes
        )
    }
  };

  return {
    ...analysis,
    schemaVersion:
      'desafio1-billing-explanation-v1',
    phase:
      'PHASE_3',
    interpretation,
    customerFacing:
      buildCustomerFacing({
        analysis,
        interpretation
      }),
    safeguards: {
      ...(
        analysis.safeguards ||
        {}
      ),
      financialExplanationGenerated:
        true,
      evidenceAmountsSummedAsCauses:
        false,
      causeAmountsDerivedFromChargeDeltas:
        true,
      llmUsedForFinancialReasoning:
        false,
      notesAddedAsCausesAutomatically:
        false,
      suspensionCreditsRequireExactTimelineAndNetProration:
        true,
      suspensionCreditsAddedAsVariationCauses:
        false,
      packageCausesRequireStructuredMarker:
        true,
      packageCauseAmountsDerivedFromChargeDelta:
        true,
      cycleDateAssumedAsIssueDate:
        false,
      note:
        'Fase 3 asigna causas solo a cambios de cargos conciliados y respaldados por reglas deterministas. Evidencias potencialmente ambiguas permanecen como contexto o sin explicar.'
    }
  };
}

module.exports = {
  PHASE3_RULE_VERSION,
  RENT_TYPE_DEFINITIONS,
  normalizeText,
  moneyMatches,
  dateOnly,
  daysInclusive,
  previousDate,
  periodContains,
  formatDateEs,
  formatMoney,
  isPlanItem,
  isPackageItem,
  isExplicitPackageOrder,
  isDiscountDescription,
  isProportionalComponent,
  buildRentContext,
  matchProrationFindings,
  findMatchingDiscountEvidence,
  buildReconnectionCauses,
  buildDiscountEndCauses,
  buildPlanChangeCauses,
  buildPackageCauses,
  buildProrationVariationCauses,
  matchActiveDiscountFindings,
  matchSuspensionAdjustmentFindings,
  buildAdjustmentFindings,
  calculateCoverage,
  interpretBillingAnalysis
};
