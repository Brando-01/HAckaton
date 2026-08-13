const MONEY_PRECISION = 2;
const MONEY_EPSILON = 0.005;

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function roundMoney(value) {
  const number = toFiniteNumber(value, 0);

  return Math.round(
    (number + Number.EPSILON) *
    10 ** MONEY_PRECISION
  ) / 10 ** MONEY_PRECISION;
}

function sumMoney(values) {
  return roundMoney(
    values.reduce(
      (sum, value) =>
        sum + toFiniteNumber(value, 0),
      0
    )
  );
}

function uniqueValues(values) {
  return Array.from(
    new Set(
      values
        .filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ''
        )
        .map(
          (value) =>
            typeof value === 'string'
              ? value.trim()
              : value
        )
    )
  );
}

function firstValue(values) {
  const unique =
    uniqueValues(values);

  return unique.length
    ? unique[0]
    : null;
}

function buildCatalogMap(entries = []) {
  const byCode = new Map();

  for (const entry of entries) {
    const code =
      String(
        entry.chargeCode || ''
      ).trim();

    if (!code) {
      continue;
    }

    if (!byCode.has(code)) {
      byCode.set(code, {
        rentTypes: [],
        rates: [],
        sourceRows: []
      });
    }

    const record =
      byCode.get(code);

    const normalizedRentType =
      String(
        entry.rentType || ''
      )
        .trim()
        .toUpperCase();

    if (
      normalizedRentType === 'RA' ||
      normalizedRentType === 'RV'
    ) {
      record.rentTypes.push(
        normalizedRentType
      );
    }

    if (
      entry.rateFinal !== null &&
      entry.rateFinal !== undefined &&
      Number.isFinite(
        Number(entry.rateFinal)
      )
    ) {
      record.rates.push(
        roundMoney(entry.rateFinal)
      );
    }

    if (
      Number.isInteger(
        Number(entry.sourceRow)
      )
    ) {
      record.sourceRows.push(
        Number(entry.sourceRow)
      );
    }
  }

  for (const record of byCode.values()) {
    record.rentTypes =
      uniqueValues(record.rentTypes);

    record.rates =
      uniqueValues(record.rates)
        .sort(
          (a, b) =>
            Number(a) -
            Number(b)
        );

    record.sourceRows =
      uniqueValues(record.sourceRows)
        .map(Number)
        .sort(
          (a, b) => a - b
        );
  }

  return byCode;
}

function resolveRentType({
  catalogRecord = null,
  descriptions = []
} = {}) {
  const catalogRentTypes =
    catalogRecord
      ? uniqueValues(
          catalogRecord.rentTypes
        )
      : [];

  if (catalogRentTypes.length === 1) {
    return {
      rentType:
        catalogRentTypes[0],
      source:
        'CATALOGO_OFERTAS'
    };
  }

  const normalizedDescriptions =
    descriptions
      .map(
        (description) =>
          String(
            description || ''
          ).trim().toUpperCase()
      )
      .filter(Boolean);

  const hasRA =
    normalizedDescriptions.some(
      (description) =>
        /(^|\s)RA(\s|$)/.test(
          description
        )
    );

  const hasRV =
    normalizedDescriptions.some(
      (description) =>
        /(^|\s)RV(\s|$)/.test(
          description
        )
    );

  if (hasRA && !hasRV) {
    return {
      rentType: 'RA',
      source:
        'CHARGE_DESCRIPTION'
    };
  }

  if (hasRV && !hasRA) {
    return {
      rentType: 'RV',
      source:
        'CHARGE_DESCRIPTION'
    };
  }

  return {
    rentType: null,
    source: null
  };
}

function aggregateInvoice({
  header,
  charges = [],
  catalogEntries = []
}) {
  if (
    !header ||
    !header.invoiceNumber
  ) {
    throw new Error(
      'Se requiere un encabezado de factura válido'
    );
  }

  if (!charges.length) {
    throw new Error(
      `La factura ${header.invoiceNumber} no tiene cargos`
    );
  }

  const invalidInvoiceRow =
    charges.find(
      (charge) =>
        charge.invoiceNumber !==
        header.invoiceNumber
    );

  if (invalidInvoiceRow) {
    throw new Error(
      'Se intentaron mezclar cargos de facturas diferentes'
    );
  }

  const catalogMap =
    buildCatalogMap(
      catalogEntries
    );

  const itemMap =
    new Map();

  for (const charge of charges) {
    const code =
      String(
        charge.chargeCode || ''
      ).trim();

    if (!code) {
      throw new Error(
        `La factura ${header.invoiceNumber} contiene un cargo sin código`
      );
    }

    if (!itemMap.has(code)) {
      itemMap.set(code, {
        chargeCode: code,
        amountValues: [],
        netAmountValues: [],
        descriptions: [],
        classifications: [],
        groups: [],
        subgroups: [],
        subscriberKeys: [],
        sourceRows: [],
        components: []
      });
    }

    const item =
      itemMap.get(code);

    item.amountValues.push(
      charge.chargeTotalAmount
    );

    item.netAmountValues.push(
      charge.chargeNetAmount
    );

    item.descriptions.push(
      charge.description
    );

    item.classifications.push(
      charge.classification
    );

    item.groups.push(
      charge.group
    );

    item.subgroups.push(
      charge.subgroup
    );

    item.subscriberKeys.push(
      charge.subscriberKey
    );

    item.components.push({
      amount:
        roundMoney(
          charge.chargeTotalAmount
        ),

      netAmount:
        roundMoney(
          charge.chargeNetAmount
        ),

      description:
        charge.description ||
        null,

      classification:
        charge.classification ||
        null,

      group:
        charge.group ||
        null,

      subgroup:
        charge.subgroup ||
        null,

      subscriberKey:
        charge.subscriberKey ||
        null,

      periodStartDate:
        charge.periodStartDate ||
        null,

      periodEndDate:
        charge.periodEndDate ||
        null,

      sourceRow:
        Number.isInteger(
          Number(charge.sourceRow)
        )
          ? Number(
              charge.sourceRow
            )
          : null
    });

    if (
      Number.isInteger(
        Number(charge.sourceRow)
      )
    ) {
      item.sourceRows.push(
        Number(charge.sourceRow)
      );
    }
  }

  const items =
    Array.from(
      itemMap.values()
    )
      .map((item) => {
        const descriptions =
          uniqueValues(
            item.descriptions
          );

        const groups =
          uniqueValues(
            item.groups
          );

        const catalogRecord =
          catalogMap.get(
            item.chargeCode
          ) || null;

        const rent =
          resolveRentType({
            catalogRecord,
            descriptions
          });

        const normalizedGroups =
          groups.map(
            (group) =>
              String(group)
                .trim()
                .toUpperCase()
          );

        return {
          chargeCode:
            item.chargeCode,

          description:
            firstValue(
              descriptions
            ),

          descriptions,

          classification:
            firstValue(
              item.classifications
            ),

          classifications:
            uniqueValues(
              item.classifications
            ),

          group:
            firstValue(groups),

          groups,

          subgroup:
            firstValue(
              item.subgroups
            ),

          subgroups:
            uniqueValues(
              item.subgroups
            ),

          amount:
            sumMoney(
              item.amountValues
            ),

          netAmount:
            sumMoney(
              item.netAmountValues
            ),

          quantity:
            item.amountValues.length,

          subscriberKeys:
            uniqueValues(
              item.subscriberKeys
            ),

          sourceRows:
            uniqueValues(
              item.sourceRows
            )
              .map(Number)
              .sort(
                (a, b) => a - b
              ),

          components:
            item.components
              .slice()
              .sort(
                (a, b) =>
                  (
                    Number(a.sourceRow) ||
                    0
                  ) -
                  (
                    Number(b.sourceRow) ||
                    0
                  )
              ),

          ignoreForExplanation:
            normalizedGroups.length > 0 &&
            normalizedGroups.every(
              (group) =>
                group ===
                'NO CONSIDERAR'
            ),

          rentType:
            rent.rentType,

          rentTypeSource:
            rent.source,

          catalogRates:
            catalogRecord
              ? catalogRecord.rates
              : [],

          catalogSourceRows:
            catalogRecord
              ? catalogRecord.sourceRows
              : []
        };
      })
      .sort(
        (a, b) =>
          Math.abs(b.amount) -
          Math.abs(a.amount)
      );

  const billingArrangements =
    uniqueValues(
      charges.map(
        (charge) =>
          charge.billingArrangement
      )
    );

  const customerKeys =
    uniqueValues(
      charges.map(
        (charge) =>
          charge.customerKey
      )
    );

  const financialAccounts =
    uniqueValues(
      charges.map(
        (charge) =>
          charge.financialAccount
      )
    );

  const cycleDates =
    uniqueValues(
      charges.map(
        (charge) =>
          charge.cycleDate
      )
    );

  const dueDates =
    uniqueValues(
      charges.map(
        (charge) =>
          charge.dueDate
      )
    );

  const debtStatuses =
    uniqueValues(
      charges.map(
        (charge) =>
          charge.debtStatus
      )
    );

  const integrityWarnings = [];

  if (
    billingArrangements.length !== 1
  ) {
    integrityWarnings.push(
      'INVOICE_MULTIPLE_BILLING_ARRANGEMENTS'
    );
  }

  if (customerKeys.length !== 1) {
    integrityWarnings.push(
      'INVOICE_MULTIPLE_CUSTOMERS'
    );
  }

  if (cycleDates.length !== 1) {
    integrityWarnings.push(
      'INVOICE_MULTIPLE_CYCLES'
    );
  }

  return {
    invoiceNumber:
      header.invoiceNumber,

    anchorSubscriberKey:
      header.anchorSubscriberKey ||
      null,

    billingArrangement:
      firstValue(
        billingArrangements
      ) ||
      header.billingArrangement ||
      null,

    customerKey:
      firstValue(
        customerKeys
      ) ||
      header.customerKey ||
      null,

    financialAccount:
      firstValue(
        financialAccounts
      ) ||
      header.financialAccount ||
      null,

    cycleDate:
      firstValue(cycleDates) ||
      header.cycleDate ||
      null,

    dueDate:
      firstValue(dueDates) ||
      header.dueDate ||
      null,

    debtStatuses,

    subscriberKeys:
      uniqueValues(
        charges.map(
          (charge) =>
            charge.subscriberKey
        )
      ),

    total:
      sumMoney(
        charges.map(
          (charge) =>
            charge.chargeTotalAmount
        )
      ),

    netTotal:
      sumMoney(
        charges.map(
          (charge) =>
            charge.chargeNetAmount
        )
      ),

    rawChargeRows:
      charges.length,

    items,

    integrityWarnings
  };
}

function compareInvoices(
  currentInvoice,
  previousInvoice
) {
  if (
    !currentInvoice ||
    !previousInvoice
  ) {
    return null;
  }

  const currentByCode =
    new Map(
      currentInvoice.items.map(
        (item) => [
          item.chargeCode,
          item
        ]
      )
    );

  const previousByCode =
    new Map(
      previousInvoice.items.map(
        (item) => [
          item.chargeCode,
          item
        ]
      )
    );

  const codes =
    uniqueValues([
      ...currentByCode.keys(),
      ...previousByCode.keys()
    ]);

  const chargeChanges =
    codes
      .map((chargeCode) => {
        const current =
          currentByCode.get(
            chargeCode
          ) || null;

        const previous =
          previousByCode.get(
            chargeCode
          ) || null;

        const currentAmount =
          current
            ? current.amount
            : 0;

        const previousAmount =
          previous
            ? previous.amount
            : 0;

        const delta =
          roundMoney(
            currentAmount -
            previousAmount
          );

        let status =
          'UNCHANGED';

        if (
          !previous &&
          current
        ) {
          status = 'ADDED';
        } else if (
          previous &&
          !current
        ) {
          status = 'REMOVED';
        } else if (
          Math.abs(delta) >=
          MONEY_EPSILON
        ) {
          status = 'CHANGED';
        }

        return {
          chargeCode,

          description:
            current?.description ||
            previous?.description ||
            null,

          previousAmount:
            roundMoney(
              previousAmount
            ),

          currentAmount:
            roundMoney(
              currentAmount
            ),

          delta,

          status,

          ignoreForExplanation:
            Boolean(
              (
                current &&
                current.ignoreForExplanation
              ) ||
              (
                previous &&
                previous.ignoreForExplanation
              )
            ),

          currentRentType:
            current?.rentType ||
            null,

          previousRentType:
            previous?.rentType ||
            null,

          subscriberKeys:
            uniqueValues([
              ...(
                current?.subscriberKeys ||
                []
              ),
              ...(
                previous?.subscriberKeys ||
                []
              )
            ])
        };
      })
      .filter(
        (change) =>
          change.status !==
          'UNCHANGED'
      )
      .sort(
        (a, b) =>
          Math.abs(b.delta) -
          Math.abs(a.delta)
      );

  const difference =
    roundMoney(
      currentInvoice.total -
      previousInvoice.total
    );

  const summedChargeDeltas =
    sumMoney(
      chargeChanges.map(
        (change) =>
          change.delta
      )
    );

  const reconciliationResidual =
    roundMoney(
      difference -
      summedChargeDeltas
    );

  let direction = 'SAME';

  if (
    difference >=
    MONEY_EPSILON
  ) {
    direction = 'UP';
  } else if (
    difference <=
    -MONEY_EPSILON
  ) {
    direction = 'DOWN';
  }

  const percentage =
    Math.abs(
      previousInvoice.total
    ) >= MONEY_EPSILON
      ? Math.round(
          (
            difference /
            previousInvoice.total
          ) *
          1000
        ) / 10
      : null;

  return {
    previousInvoiceNumber:
      previousInvoice.invoiceNumber,

    currentInvoiceNumber:
      currentInvoice.invoiceNumber,

    previousTotal:
      previousInvoice.total,

    currentTotal:
      currentInvoice.total,

    difference,

    percentage,

    direction,

    chargeChanges,

    summedChargeDeltas,

    reconciliationResidual,

    reconciled:
      Math.abs(
        reconciliationResidual
      ) < MONEY_EPSILON
  };
}

function collapseDuplicateRows(
  rows,
  {
    keyFields,
    mapRow
  }
) {
  const groups =
    new Map();

  for (const row of rows) {
    const key =
      JSON.stringify(
        keyFields.map(
          (field) =>
            row[field] ?? null
        )
      );

    if (!groups.has(key)) {
      groups.set(key, {
        row,
        occurrences: 0,
        sourceRows: []
      });
    }

    const group =
      groups.get(key);

    group.occurrences += 1;

    if (
      Number.isInteger(
        Number(row.sourceRow)
      )
    ) {
      group.sourceRows.push(
        Number(row.sourceRow)
      );
    }
  }

  return Array.from(
    groups.values()
  ).map(
    ({
      row,
      occurrences,
      sourceRows
    }) => ({
      ...mapRow(row),

      occurrences,

      sourceRows:
        uniqueValues(
          sourceRows
        )
          .map(Number)
          .sort(
            (a, b) => a - b
          )
    })
  );
}

function buildInvoiceEvidence({
  invoice,
  prorations = [],
  reconnections = [],
  discounts = [],
  creditNotes = []
}) {
  const chargeCodes =
    new Set(
      invoice.items.map(
        (item) =>
          item.chargeCode
      )
    );

  const prorationEvidence =
    collapseDuplicateRows(
      prorations,
      {
        keyFields: [
          'billingArrangement',
          'financialAccount',
          'numberValue',
          'invoiceNumber',
          'cycleDate',
          'periodStartDate',
          'periodEndDate',
          'proratedAmount',
          'chargeCount',
          'numberType'
        ],

        mapRow: (row) => ({
          source:
            'BRAINY_PRORRATEO',

          type:
            'PRORATION',

          billingArrangement:
            row.billingArrangement,

          financialAccount:
            row.financialAccount,

          invoiceNumber:
            row.invoiceNumber,

          cycleDate:
            row.cycleDate,

          periodStartDate:
            row.periodStartDate,

          periodEndDate:
            row.periodEndDate,

          amount:
            roundMoney(
              row.proratedAmount
            ),

          chargeCount:
            row.chargeCount,

          numberType:
            row.numberType
        })
      }
    );

  const reconnectionEvidence =
    collapseDuplicateRows(
      reconnections,
      {
        keyFields: [
          'billingArrangement',
          'financialAccount',
          'numberValue',
          'code',
          'invoiceNumber',
          'description',
          'reconnectionDate',
          'amount',
          'cycleDate',
          'cutDate'
        ],

        mapRow: (row) => ({
          source:
            'BRAINY_RECONEXIONES',

          type:
            'RECONNECTION',

          billingArrangement:
            row.billingArrangement,

          financialAccount:
            row.financialAccount,

          invoiceNumber:
            row.invoiceNumber,

          code:
            row.code,

          description:
            row.description,

          reconnectionDate:
            row.reconnectionDate,

          cutDate:
            row.cutDate,

          cycleDate:
            row.cycleDate,

          amount:
            roundMoney(
              row.amount
            ),

          matchedChargeCode:
            row.code
              ? chargeCodes.has(
                  row.code
                )
              : false
        })
      }
    );

  const discountEvidence =
    collapseDuplicateRows(
      discounts,
      {
        keyFields: [
          'processType',
          'invoiceFlag',
          'rentType',
          'billingArrangement',
          'cycleDate',
          'startDate',
          'promotionDuration',
          'promotionPercentage',
          'chargeCode',
          'endDate',
          'overdueDays',
          'prepaidDays',
          'cycleStartFlag',
          'currentInstallment',
          'translation',
          'description',
          'fullDiscountFlag',
          'discountType',
          'financialAccount',
          'discountAmount',
          'numberType'
        ],

        mapRow: (row) => ({
          source:
            'BRAINY_DESCUENTOS_CUOTAS',

          type:
            'DISCOUNT_OR_INSTALLMENT',

          processType:
            row.processType,

          invoiceFlag:
            row.invoiceFlag,

          rentType:
            row.rentType,

          billingArrangement:
            row.billingArrangement,

          financialAccount:
            row.financialAccount,

          cycleDate:
            row.cycleDate,

          startDate:
            row.startDate,

          endDate:
            row.endDate,

          promotionDuration:
            row.promotionDuration,

          promotionPercentage:
            row.promotionPercentage,

          chargeCode:
            row.chargeCode,

          overdueDays:
            row.overdueDays,

          prepaidDays:
            row.prepaidDays,

          currentInstallment:
            row.currentInstallment,

          translation:
            row.translation,

          description:
            row.description,

          discountType:
            row.discountType,

          amount:
            roundMoney(
              row.discountAmount
            ),

          matchedChargeCode:
            row.chargeCode
              ? chargeCodes.has(
                  row.chargeCode
                )
              : false
        })
      }
    );

  const creditNoteEvidence =
    collapseDuplicateRows(
      creditNotes,
      {
        keyFields: [
          'receiverCustomer',
          'billingArrangement',
          'serviceReceiverId',
          'chargeCode',
          'cancelChargeType',
          'effectiveDate',
          'amount',
          'periodStartDate',
          'periodEndDate',
          'cycleDate'
        ],

        mapRow: (row) => ({
          source:
            'NOTAS_CREDITO',

          type:
            'CREDIT_DEBIT_NOTE',

          receiverCustomer:
            row.receiverCustomer,

          billingArrangement:
            row.billingArrangement,

          serviceReceiverId:
            row.serviceReceiverId,

          chargeCode:
            row.chargeCode,

          cancelChargeType:
            row.cancelChargeType,

          effectiveDate:
            row.effectiveDate,

          periodStartDate:
            row.periodStartDate,

          periodEndDate:
            row.periodEndDate,

          cycleDate:
            row.cycleDate,

          amount:
            roundMoney(
              row.amount
            ),

          matchedChargeCode:
            row.chargeCode
              ? chargeCodes.has(
                  row.chargeCode
                )
              : false
        })
      }
    );

  const observedRentTypes =
    uniqueValues([
      ...invoice.items
        .map(
          (item) =>
            item.rentType
        ),
      ...discountEvidence
        .map(
          (evidence) =>
            evidence.rentType
        )
    ]);

  return {
    invoiceNumber:
      invoice.invoiceNumber,

    cycleDate:
      invoice.cycleDate,

    proration:
      prorationEvidence,

    reconnection:
      reconnectionEvidence,

    discountsAndInstallments:
      discountEvidence,

    creditDebitNotes:
      creditNoteEvidence,

    observedRentTypes,

    counts: {
      rawRows: {
        proration:
          prorations.length,

        reconnection:
          reconnections.length,

        discountsAndInstallments:
          discounts.length,

        creditDebitNotes:
          creditNotes.length
      },

      uniqueRecords: {
        proration:
          prorationEvidence.length,

        reconnection:
          reconnectionEvidence.length,

        discountsAndInstallments:
          discountEvidence.length,

        creditDebitNotes:
          creditNoteEvidence.length
      }
    }
  };
}

function normalizeOrderContext(
  rows = []
) {
  return rows.map(
    (row) => ({
      subscriberKey:
        row.subscriberKey,

      customerKey:
        row.customerKey,

      startDate:
        row.startDate,

      completionDate:
        row.completionDate,

      reason:
        row.reason,

      reasonId:
        row.reasonId,

      itemType:
        row.itemType,

      status:
        row.status,

      sourceRow:
        row.sourceRow
    })
  );
}

module.exports = {
  MONEY_EPSILON,
  roundMoney,
  sumMoney,
  uniqueValues,
  buildCatalogMap,
  resolveRentType,
  aggregateInvoice,
  compareInvoices,
  collapseDuplicateRows,
  buildInvoiceEvidence,
  normalizeOrderContext
};
