const {
  MONEY_EPSILON,
  roundMoney,
  sumMoney,
  uniqueValues
} = require(
  './desafio1BillingLogic'
);

const PHASE16_AUDIT_VERSION =
  'desafio1-phase16-financial-audit-v2';

const ASSERTION_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_EVALUABLE: 'NOT_EVALUABLE'
});

const ASSERTION_CATEGORY = Object.freeze({
  RETRIEVAL: 'RETRIEVAL',
  GROUNDING: 'GROUNDING',
  POLICY: 'POLICY'
});

const MONEY_TOLERANCE = 0.005;

function moneyMatches(
  left,
  right,
  tolerance = MONEY_TOLERANCE
) {
  return Math.abs(
    roundMoney(left) - roundMoney(right)
  ) < tolerance;
}

function normalizeSourceRows(values = []) {
  return uniqueValues(values)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

function makeAssertion({
  id,
  category,
  status,
  label,
  expected = null,
  actual = null,
  monetary = false,
  source = null,
  reason = null
}) {
  return {
    id,
    category,
    status,
    label,
    monetary: Boolean(monetary),
    ...(expected !== null
      ? { expected }
      : {}),
    ...(actual !== null
      ? { actual }
      : {}),
    ...(source
      ? { source }
      : {}),
    ...(reason
      ? { reason }
      : {})
  };
}

function passAssertion(options) {
  return makeAssertion({
    ...options,
    status: ASSERTION_STATUS.PASS
  });
}

function failAssertion(options) {
  return makeAssertion({
    ...options,
    status: ASSERTION_STATUS.FAIL
  });
}

function notEvaluableAssertion(options) {
  return makeAssertion({
    ...options,
    status: ASSERTION_STATUS.NOT_EVALUABLE
  });
}

function assertMoney({
  id,
  category,
  label,
  expected,
  actual,
  source = null,
  reason = null
}) {
  if (
    !Number.isFinite(Number(expected)) ||
    !Number.isFinite(Number(actual))
  ) {
    return notEvaluableAssertion({
      id,
      category,
      label,
      expected:
        Number.isFinite(Number(expected))
          ? roundMoney(expected)
          : null,
      actual:
        Number.isFinite(Number(actual))
          ? roundMoney(actual)
          : null,
      monetary: true,
      source,
      reason:
        reason || 'NON_NUMERIC_VALUE'
    });
  }

  const expectedMoney = roundMoney(expected);
  const actualMoney = roundMoney(actual);

  return moneyMatches(
    expectedMoney,
    actualMoney
  )
    ? passAssertion({
        id,
        category,
        label,
        expected: expectedMoney,
        actual: actualMoney,
        monetary: true,
        source
      })
    : failAssertion({
        id,
        category,
        label,
        expected: expectedMoney,
        actual: actualMoney,
        monetary: true,
        source,
        reason:
          reason || 'MONEY_MISMATCH'
      });
}

function assertBoolean({
  id,
  category,
  label,
  expected,
  actual,
  source = null,
  reason = null
}) {
  if (typeof actual !== 'boolean') {
    return failAssertion({
      id,
      category,
      label,
      expected: Boolean(expected),
      actual:
        actual === undefined
          ? 'missing'
          : actual,
      source,
      reason:
        reason || 'BOOLEAN_GUARD_MISSING'
    });
  }

  const matches =
    actual === Boolean(expected);

  return matches
    ? passAssertion({
        id,
        category,
        label,
        expected: Boolean(expected),
        actual: Boolean(actual),
        source
      })
    : failAssertion({
        id,
        category,
        label,
        expected: Boolean(expected),
        actual: Boolean(actual),
        source,
        reason:
          reason || 'BOOLEAN_MISMATCH'
      });
}

function sumRawTotal(rows = [], field) {
  return sumMoney(
    rows.map(
      (row) => row?.[field]
    )
  );
}

function groupRawCharges(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const code = String(
      row?.chargeCode || ''
    ).trim();

    if (!code) {
      continue;
    }

    if (!map.has(code)) {
      map.set(code, {
        chargeCode: code,
        amount: 0,
        netAmount: 0,
        sourceRows: []
      });
    }

    const item = map.get(code);
    item.amount = roundMoney(
      item.amount +
      Number(row?.chargeTotalAmount || 0)
    );
    item.netAmount = roundMoney(
      item.netAmount +
      Number(row?.chargeNetAmount || 0)
    );

    if (
      Number.isInteger(
        Number(row?.sourceRow)
      )
    ) {
      item.sourceRows.push(
        Number(row.sourceRow)
      );
    }
  }

  for (const item of map.values()) {
    item.sourceRows =
      normalizeSourceRows(
        item.sourceRows
      );
  }

  return map;
}

function buildRawChargeChanges(
  currentRows = [],
  previousRows = []
) {
  const current =
    groupRawCharges(currentRows);
  const previous =
    groupRawCharges(previousRows);

  const codes = uniqueValues([
    ...current.keys(),
    ...previous.keys()
  ]);

  const result = new Map();

  for (const code of codes) {
    const currentAmount =
      current.get(code)?.amount || 0;
    const previousAmount =
      previous.get(code)?.amount || 0;

    result.set(code, {
      chargeCode: code,
      presentInCurrent:
        current.has(code),
      presentInPrevious:
        previous.has(code),
      currentAmount:
        roundMoney(currentAmount),
      previousAmount:
        roundMoney(previousAmount),
      delta:
        roundMoney(
          currentAmount - previousAmount
        )
    });
  }

  return result;
}

function rowsBySource(rows = []) {
  return new Map(
    rows
      .filter(
        (row) =>
          Number.isInteger(
            Number(row?.sourceRow)
          )
      )
      .map(
        (row) => [
          Number(row.sourceRow),
          row
        ]
      )
  );
}

function assertSourceRowsExist({
  id,
  label,
  claimedRows = [],
  rawRows = [],
  source
}) {
  const claimed =
    normalizeSourceRows(claimedRows);

  if (!claimed.length) {
    return notEvaluableAssertion({
      id,
      category:
        ASSERTION_CATEGORY.GROUNDING,
      label,
      source,
      reason: 'NO_SOURCE_ROWS_DECLARED'
    });
  }

  const rawSet = new Set(
    normalizeSourceRows(
      rawRows.map(
        (row) => row?.sourceRow
      )
    )
  );

  const missing = claimed.filter(
    (row) => !rawSet.has(row)
  );

  return missing.length
    ? failAssertion({
        id,
        category:
          ASSERTION_CATEGORY.GROUNDING,
        label,
        expected:
          `${claimed.length} source rows present`,
        actual:
          `${missing.length} missing`,
        source,
        reason: 'SOURCE_ROW_NOT_FOUND'
      })
    : passAssertion({
        id,
        category:
          ASSERTION_CATEGORY.GROUNDING,
        label,
        expected:
          `${claimed.length} source rows present`,
        actual:
          `${claimed.length} source rows present`,
        source
      });
}

function auditInvoice({
  invoice,
  rawRows,
  prefix
}) {
  if (!invoice) {
    return [];
  }

  const assertions = [];
  const rawMap =
    groupRawCharges(rawRows);

  const expectedCodes =
    [...rawMap.keys()].sort();
  const actualCodes = uniqueValues(
    (invoice.items || []).map(
      (item) => item.chargeCode
    )
  ).sort();

  assertions.push(
    expectedCodes.join(',') ===
      actualCodes.join(',')
      ? passAssertion({
          id: `${prefix}_CHARGE_CODE_SET_EXACT`,
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            `${prefix} charge-code set matches raw FACTURACION`,
          expected: expectedCodes.join(','),
          actual: actualCodes.join(','),
          source: 'FACTURACION'
        })
      : failAssertion({
          id: `${prefix}_CHARGE_CODE_SET_EXACT`,
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            `${prefix} charge-code set matches raw FACTURACION`,
          expected: expectedCodes.join(','),
          actual: actualCodes.join(','),
          source: 'FACTURACION',
          reason: 'CHARGE_CODE_SET_MISMATCH'
        })
  );

  assertions.push(
    assertMoney({
      id: `${prefix}_TOTAL_EXACT`,
      category:
        ASSERTION_CATEGORY.RETRIEVAL,
      label:
        `${prefix} total equals raw FACTURACION sum`,
      expected:
        sumRawTotal(
          rawRows,
          'chargeTotalAmount'
        ),
      actual: invoice.total,
      source: 'FACTURACION'
    })
  );

  assertions.push(
    assertMoney({
      id: `${prefix}_NET_TOTAL_EXACT`,
      category:
        ASSERTION_CATEGORY.RETRIEVAL,
      label:
        `${prefix} net total equals raw FACTURACION sum`,
      expected:
        sumRawTotal(
          rawRows,
          'chargeNetAmount'
        ),
      actual: invoice.netTotal,
      source: 'FACTURACION'
    })
  );

  const rawCount = rawRows.length;
  const actualCount =
    Number(invoice.rawChargeRows || 0);

  assertions.push(
    rawCount === actualCount
      ? passAssertion({
          id: `${prefix}_ROW_COUNT_EXACT`,
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            `${prefix} raw charge row count is exact`,
          expected: rawCount,
          actual: actualCount,
          source: 'FACTURACION'
        })
      : failAssertion({
          id: `${prefix}_ROW_COUNT_EXACT`,
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            `${prefix} raw charge row count is exact`,
          expected: rawCount,
          actual: actualCount,
          source: 'FACTURACION',
          reason: 'ROW_COUNT_MISMATCH'
        })
  );

  for (const item of invoice.items || []) {
    const raw =
      rawMap.get(item.chargeCode);

    if (!raw) {
      assertions.push(
        failAssertion({
          id:
            `${prefix}_ITEM_${item.chargeCode}_EXISTS`,
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            `${prefix} item exists in raw FACTURACION`,
          expected: 'present',
          actual: 'missing',
          source: 'FACTURACION',
          reason: 'CHARGE_CODE_NOT_FOUND'
        })
      );
      continue;
    }

    assertions.push(
      assertMoney({
        id:
          `${prefix}_ITEM_${item.chargeCode}_AMOUNT`,
        category:
          ASSERTION_CATEGORY.RETRIEVAL,
        label:
          `${prefix} item amount matches raw charge-code aggregation`,
        expected: raw.amount,
        actual: item.amount,
        source: 'FACTURACION'
      })
    );

    assertions.push(
      assertMoney({
        id:
          `${prefix}_ITEM_${item.chargeCode}_NET_AMOUNT`,
        category:
          ASSERTION_CATEGORY.RETRIEVAL,
        label:
          `${prefix} item net amount matches raw charge-code aggregation`,
        expected: raw.netAmount,
        actual: item.netAmount,
        source: 'FACTURACION'
      })
    );

    const expectedRows =
      raw.sourceRows.join(',');
    const actualRows =
      normalizeSourceRows(
        item.sourceRows || []
      ).join(',');

    assertions.push(
      expectedRows === actualRows
        ? passAssertion({
            id:
              `${prefix}_ITEM_${item.chargeCode}_SOURCE_ROWS`,
            category:
              ASSERTION_CATEGORY.RETRIEVAL,
            label:
              `${prefix} item source rows are exact`,
            expected: expectedRows,
            actual: actualRows,
            source: 'FACTURACION'
          })
        : failAssertion({
            id:
              `${prefix}_ITEM_${item.chargeCode}_SOURCE_ROWS`,
            category:
              ASSERTION_CATEGORY.RETRIEVAL,
            label:
              `${prefix} item source rows are exact`,
            expected: expectedRows,
            actual: actualRows,
            source: 'FACTURACION',
            reason: 'SOURCE_ROW_SET_MISMATCH'
          })
    );
  }

  return assertions;
}

function auditComparison({
  explanation,
  rawCurrentCharges,
  rawPreviousCharges
}) {
  const comparison =
    explanation?.comparison;

  if (!comparison) {
    return [];
  }

  const assertions = [];
  const rawCurrentTotal =
    sumRawTotal(
      rawCurrentCharges,
      'chargeTotalAmount'
    );
  const rawPreviousTotal =
    sumRawTotal(
      rawPreviousCharges,
      'chargeTotalAmount'
    );
  const rawDifference =
    roundMoney(
      rawCurrentTotal -
      rawPreviousTotal
    );

  assertions.push(
    assertMoney({
      id: 'COMPARISON_CURRENT_TOTAL_EXACT',
      category:
        ASSERTION_CATEGORY.RETRIEVAL,
      label:
        'comparison current total matches raw FACTURACION',
      expected: rawCurrentTotal,
      actual: comparison.currentTotal,
      source: 'FACTURACION'
    }),
    assertMoney({
      id: 'COMPARISON_PREVIOUS_TOTAL_EXACT',
      category:
        ASSERTION_CATEGORY.RETRIEVAL,
      label:
        'comparison previous total matches raw FACTURACION',
      expected: rawPreviousTotal,
      actual: comparison.previousTotal,
      source: 'FACTURACION'
    }),
    assertMoney({
      id: 'COMPARISON_DIFFERENCE_EXACT',
      category:
        ASSERTION_CATEGORY.RETRIEVAL,
      label:
        'comparison difference is exact current minus previous',
      expected: rawDifference,
      actual: comparison.difference,
      source: 'FACTURACION'
    })
  );

  const rawChanges =
    buildRawChargeChanges(
      rawCurrentCharges,
      rawPreviousCharges
    );

  const expectedChangedCodes =
    [...rawChanges.values()]
      .filter(
        (change) =>
          change.presentInCurrent !==
            change.presentInPrevious ||
          Math.abs(change.delta) >=
            MONEY_EPSILON
      )
      .map(
        (change) => change.chargeCode
      )
      .sort();
  const actualChangedCodes =
    uniqueValues(
      (comparison.chargeChanges || [])
        .map(
          (change) => change.chargeCode
        )
    ).sort();

  assertions.push(
    expectedChangedCodes.join(',') ===
      actualChangedCodes.join(',')
      ? passAssertion({
          id: 'COMPARISON_CHANGE_CODE_SET_EXACT',
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            'comparison includes exactly the raw charge codes with structural or monetary changes',
          expected:
            expectedChangedCodes.join(','),
          actual:
            actualChangedCodes.join(','),
          source: 'FACTURACION'
        })
      : failAssertion({
          id: 'COMPARISON_CHANGE_CODE_SET_EXACT',
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            'comparison includes exactly the raw charge codes with structural or monetary changes',
          expected:
            expectedChangedCodes.join(','),
          actual:
            actualChangedCodes.join(','),
          source: 'FACTURACION',
          reason:
            'CHANGE_CODE_SET_MISMATCH'
        })
  );

  for (
    const change of
      comparison.chargeChanges || []
  ) {
    const raw =
      rawChanges.get(
        change.chargeCode
      );

    if (!raw) {
      assertions.push(
        failAssertion({
          id:
            `CHANGE_${change.chargeCode}_EXISTS`,
          category:
            ASSERTION_CATEGORY.RETRIEVAL,
          label:
            'charge change exists in raw aggregation',
          expected: 'present',
          actual: 'missing',
          source: 'FACTURACION',
          reason: 'RAW_CHANGE_NOT_FOUND'
        })
      );
      continue;
    }

    assertions.push(
      assertMoney({
        id:
          `CHANGE_${change.chargeCode}_PREVIOUS`,
        category:
          ASSERTION_CATEGORY.RETRIEVAL,
        label:
          'charge previous amount is exact',
        expected: raw.previousAmount,
        actual: change.previousAmount,
        source: 'FACTURACION'
      }),
      assertMoney({
        id:
          `CHANGE_${change.chargeCode}_CURRENT`,
        category:
          ASSERTION_CATEGORY.RETRIEVAL,
        label:
          'charge current amount is exact',
        expected: raw.currentAmount,
        actual: change.currentAmount,
        source: 'FACTURACION'
      }),
      assertMoney({
        id:
          `CHANGE_${change.chargeCode}_DELTA`,
        category:
          ASSERTION_CATEGORY.RETRIEVAL,
        label:
          'charge delta is exact',
        expected: raw.delta,
        actual: change.delta,
        source: 'FACTURACION'
      })
    );
  }

  assertions.push(
    assertMoney({
      id: 'COMPARISON_RECONCILIATION_RESIDUAL',
      category:
        ASSERTION_CATEGORY.GROUNDING,
      label:
        'sum of charge deltas reconciles the invoice difference',
      expected: 0,
      actual:
        comparison.reconciliationResidual,
      source: 'FACTURACION'
    })
  );

  return assertions;
}

function auditCauses({
  explanation,
  rawCurrentCharges,
  rawPreviousCharges,
  rawEvidenceCurrent = {},
  rawEvidencePrevious = {},
  rawOrders = []
}) {
  const assertions = [];
  const rawChanges =
    buildRawChargeChanges(
      rawCurrentCharges,
      rawPreviousCharges
    );

  for (
    const cause of
      explanation?.interpretation
        ?.causes || []
  ) {
    const codes =
      uniqueValues(
        cause.claimedChargeCodes || []
      );

    if (!codes.length) {
      assertions.push(
        failAssertion({
          id:
            `CAUSE_${cause.code}_CLAIMED_CODES`,
          category:
            ASSERTION_CATEGORY.GROUNDING,
          label:
            `${cause.code} declares the charge codes it claims`,
          expected: 'at least one charge code',
          actual: 'none',
          source: 'FACTURACION',
          reason: 'CAUSE_WITHOUT_CLAIMED_CHARGE_CODE'
        })
      );
      continue;
    }

    const missing = codes.filter(
      (code) => !rawChanges.has(code)
    );

    if (missing.length) {
      assertions.push(
        failAssertion({
          id:
            `CAUSE_${cause.code}_CODES_EXIST`,
          category:
            ASSERTION_CATEGORY.GROUNDING,
          label:
            `${cause.code} only claims raw charge changes`,
          expected:
            `${codes.length} raw changes`,
          actual:
            `${missing.length} missing`,
          source: 'FACTURACION',
          reason: 'CLAIMED_CHANGE_NOT_FOUND'
        })
      );
      continue;
    }

    const expectedImpact = sumMoney(
      codes.map(
        (code) =>
          rawChanges.get(code).delta
      )
    );

    assertions.push(
      assertMoney({
        id:
          `CAUSE_${cause.code}_IMPACT_GROUNDED`,
        category:
          ASSERTION_CATEGORY.GROUNDING,
        label:
          `${cause.code} impact is derived from raw charge deltas`,
        expected: expectedImpact,
        actual: cause.impactAmount,
        source: 'FACTURACION'
      })
    );

    if (cause.code === 'RECONNECTION') {
      const sourceRows = (
        cause.evidence
          ?.brainyReconnections || []
      ).flatMap(
        (item) =>
          item.sourceRows || []
      );

      assertions.push(
        assertSourceRowsExist({
          id:
            'CAUSE_RECONNECTION_EVIDENCE_ROWS',
          label:
            'reconnection cause points to raw reconnection evidence',
          claimedRows: sourceRows,
          rawRows:
            rawEvidenceCurrent
              .reconnections || [],
          source:
            'BRAINY_RECONEXIONES'
        })
      );
    } else if (
      cause.code === 'DISCOUNT_ENDED' ||
      cause.code === 'DISCOUNT_REMOVED'
    ) {
      assertions.push(
        assertSourceRowsExist({
          id:
            `CAUSE_${cause.code}_EVIDENCE_ROWS`,
          label:
            `${cause.code} points to raw previous discount evidence`,
          claimedRows:
            cause.evidence
              ?.previousDiscount
              ?.sourceRows || [],
          rawRows:
            rawEvidencePrevious
              .discounts || [],
          source:
            'BRAINY_DESCUENTOS_CUOTAS'
        })
      );
    } else if (
      cause.code === 'PLAN_CHANGE'
    ) {
      assertions.push(
        assertSourceRowsExist({
          id:
            'CAUSE_PLAN_CHANGE_ORDER_ROWS',
          label:
            'plan-change cause points to raw order evidence',
          claimedRows: (
            cause.evidence?.orders || []
          ).map(
            (order) => order.sourceRow
          ),
          rawRows: rawOrders,
          source: 'ORDENES'
        })
      );
    } else if (
      cause.code === 'PACKAGES'
    ) {
      const allRows = [
        ...rawCurrentCharges,
        ...rawPreviousCharges
      ];
      const packageRows = allRows.filter(
        (row) => {
          if (
            !codes.includes(
              String(
                row?.chargeCode || ''
              ).trim()
            )
          ) {
            return false;
          }

          const group = String(
            row?.group || ''
          ).trim().toUpperCase();
          const classification = String(
            row?.classification || ''
          ).toUpperCase();

          return (
            group === 'PAQUETES' ||
            /(^|\s)PAQUETE(S)?(\s|$)/
              .test(classification)
          );
        }
      );

      assertions.push(
        packageRows.length
          ? passAssertion({
              id:
                'CAUSE_PACKAGES_STRUCTURED_MARKER',
              category:
                ASSERTION_CATEGORY.GROUNDING,
              label:
                'package cause has a structured package marker in raw billing rows',
              expected:
                'structured marker present',
              actual:
                'structured marker present',
              source: 'FACTURACION'
            })
          : failAssertion({
              id:
                'CAUSE_PACKAGES_STRUCTURED_MARKER',
              category:
                ASSERTION_CATEGORY.GROUNDING,
              label:
                'package cause has a structured package marker in raw billing rows',
              expected:
                'structured marker present',
              actual: 'marker missing',
              source: 'FACTURACION',
              reason:
                'PACKAGE_STRUCTURED_MARKER_NOT_FOUND'
            })
      );
    }
  }

  const expectedExplained = sumMoney(
    (
      explanation?.interpretation
        ?.causes || []
    ).map(
      (cause) =>
        cause.impactAmount
    )
  );

  if (
    explanation?.comparison &&
    Number.isFinite(
      Number(
        explanation?.interpretation
          ?.explainedNetAmount
      )
    )
  ) {
    assertions.push(
      assertMoney({
        id: 'EXPLAINED_NET_AMOUNT_FROM_CAUSES',
        category:
          ASSERTION_CATEGORY.GROUNDING,
        label:
          'explained net amount equals the sum of grounded causes',
        expected: expectedExplained,
        actual:
          explanation.interpretation
            .explainedNetAmount,
        source: 'RULE_ENGINE'
      })
    );
  }

  return assertions;
}

function findRowsBySource(
  rawRows,
  sourceRows
) {
  const index = rowsBySource(rawRows);

  return normalizeSourceRows(
    sourceRows
  )
    .map((row) => index.get(row))
    .filter(Boolean);
}

function auditFindings({
  explanation,
  rawCurrentCharges,
  rawEvidence = {}
}) {
  const assertions = [];

  for (
    const finding of
      explanation?.interpretation
        ?.currentBillFindings || []
  ) {
    const code = finding.code;

    if (code === 'PRORATION') {
      const factRows =
        findRowsBySource(
          rawCurrentCharges,
          finding.sourceRows
            ?.facturacion || []
        );
      const brainyRows =
        findRowsBySource(
          rawEvidence.prorations || [],
          finding.sourceRows
            ?.brainy || []
        );

      assertions.push(
        assertSourceRowsExist({
          id:
            'FINDING_PRORATION_FACT_ROWS',
          label:
            'proration points to raw FACTURACION rows',
          claimedRows:
            finding.sourceRows
              ?.facturacion || [],
          rawRows:
            rawCurrentCharges,
          source: 'FACTURACION'
        }),
        assertSourceRowsExist({
          id:
            'FINDING_PRORATION_BRAINY_ROWS',
          label:
            'proration points to raw proration rows',
          claimedRows:
            finding.sourceRows
              ?.brainy || [],
          rawRows:
            rawEvidence.prorations || [],
          source: 'BRAINY_PRORRATEO'
        })
      );

      if (factRows.length) {
        assertions.push(
          assertMoney({
            id:
              'FINDING_PRORATION_FACT_AMOUNT',
            category:
              ASSERTION_CATEGORY.GROUNDING,
            label:
              'proration amount matches its raw billed component',
            expected:
              sumRawTotal(
                factRows,
                'chargeTotalAmount'
              ),
            actual: finding.amount,
            source: 'FACTURACION'
          })
        );
      }

      if (brainyRows.length) {
        assertions.push(
          assertMoney({
            id:
              'FINDING_PRORATION_BRAINY_AMOUNT',
            category:
              ASSERTION_CATEGORY.GROUNDING,
            label:
              'proration amount matches raw Brainy proration',
            expected:
              brainyRows[0]
                ?.proratedAmount,
            actual: finding.amount,
            source: 'BRAINY_PRORRATEO'
          })
        );
      }
    } else if (
      code === 'ACTIVE_DISCOUNT'
    ) {
      const factRows =
        findRowsBySource(
          rawCurrentCharges,
          finding.sourceRows
            ?.facturacion || []
        );
      const brainyRows =
        findRowsBySource(
          rawEvidence.discounts || [],
          finding.sourceRows
            ?.brainy || []
        );

      assertions.push(
        assertSourceRowsExist({
          id:
            'FINDING_DISCOUNT_FACT_ROWS',
          label:
            'active discount points to raw FACTURACION rows',
          claimedRows:
            finding.sourceRows
              ?.facturacion || [],
          rawRows:
            rawCurrentCharges,
          source: 'FACTURACION'
        }),
        assertSourceRowsExist({
          id:
            'FINDING_DISCOUNT_BRAINY_ROWS',
          label:
            'active discount points to raw discount rows',
          claimedRows:
            finding.sourceRows
              ?.brainy || [],
          rawRows:
            rawEvidence.discounts || [],
          source: 'BRAINY_DESCUENTOS_CUOTAS'
        })
      );

      if (factRows.length) {
        assertions.push(
          assertMoney({
            id:
              'FINDING_DISCOUNT_FACT_AMOUNT',
            category:
              ASSERTION_CATEGORY.GROUNDING,
            label:
              'discount amount matches the negative billed charge',
            expected:
              Math.abs(
                sumRawTotal(
                  factRows,
                  'chargeTotalAmount'
                )
              ),
            actual:
              finding.discountAmount,
            source: 'FACTURACION'
          })
        );
      }

      if (brainyRows.length) {
        assertions.push(
          assertMoney({
            id:
              'FINDING_DISCOUNT_BRAINY_AMOUNT',
            category:
              ASSERTION_CATEGORY.GROUNDING,
            label:
              'discount amount matches raw Brainy discount',
            expected:
              brainyRows[0]
                ?.discountAmount,
            actual:
              finding.discountAmount,
            source:
              'BRAINY_DESCUENTOS_CUOTAS'
          })
        );
      }
    } else if (
      code === 'SUSPENSION_ADJUSTMENT'
    ) {
      const noteRows =
        findRowsBySource(
          rawEvidence.creditNotes || [],
          finding.sourceRows
            ?.note || []
        );
      const reconnectionRows =
        findRowsBySource(
          rawEvidence.reconnections || [],
          finding.sourceRows
            ?.reconnection || []
        );

      assertions.push(
        assertSourceRowsExist({
          id:
            'FINDING_SUSPENSION_NOTE_ROWS',
          label:
            'suspension adjustment points to raw credit-note rows',
          claimedRows:
            finding.sourceRows
              ?.note || [],
          rawRows:
            rawEvidence.creditNotes || [],
          source: 'NOTAS_CREDITO'
        }),
        assertSourceRowsExist({
          id:
            'FINDING_SUSPENSION_RECONNECTION_ROWS',
          label:
            'suspension adjustment points to raw reconnection rows',
          claimedRows:
            finding.sourceRows
              ?.reconnection || [],
          rawRows:
            rawEvidence.reconnections || [],
          source: 'BRAINY_RECONEXIONES'
        })
      );

      if (noteRows.length) {
        assertions.push(
          assertMoney({
            id:
              'FINDING_SUSPENSION_NOTE_AMOUNT',
            category:
              ASSERTION_CATEGORY.GROUNDING,
            label:
              'suspension credit equals the raw negative credit note',
            expected:
              Math.abs(
                noteRows[0]?.amount
              ),
            actual: finding.amount,
            source: 'NOTAS_CREDITO'
          })
        );
      }

      if (reconnectionRows.length) {
        const reconnection =
          reconnectionRows[0];
        const timelineMatches =
          String(
            reconnection.cutDate || ''
          ).slice(0, 10) ===
            String(
              finding.cutDate || ''
            ).slice(0, 10) &&
          String(
            reconnection.reconnectionDate || ''
          ).slice(0, 10) ===
            String(
              finding.reconnectionDate || ''
            ).slice(0, 10);

        assertions.push(
          timelineMatches
            ? passAssertion({
                id:
                  'FINDING_SUSPENSION_TIMELINE',
                category:
                  ASSERTION_CATEGORY.GROUNDING,
                label:
                  'suspension timeline matches raw reconnection evidence',
                expected:
                  'cut/reconnection dates exact',
                actual:
                  'cut/reconnection dates exact',
                source:
                  'BRAINY_RECONEXIONES'
              })
            : failAssertion({
                id:
                  'FINDING_SUSPENSION_TIMELINE',
                category:
                  ASSERTION_CATEGORY.GROUNDING,
                label:
                  'suspension timeline matches raw reconnection evidence',
                expected:
                  'cut/reconnection dates exact',
                actual:
                  'timeline mismatch',
                source:
                  'BRAINY_RECONEXIONES',
                reason:
                  'SUSPENSION_TIMELINE_MISMATCH'
              })
        );
      }
    } else if (
      code === 'ADJUSTMENT_NOTE_CONTEXT'
    ) {
      const noteRows =
        findRowsBySource(
          rawEvidence.creditNotes || [],
          finding.sourceRows || []
        );

      assertions.push(
        assertSourceRowsExist({
          id:
            'FINDING_NOTE_CONTEXT_ROWS',
          label:
            'context-only note points to raw note rows',
          claimedRows:
            finding.sourceRows || [],
          rawRows:
            rawEvidence.creditNotes || [],
          source: 'NOTAS_CREDITO'
        })
      );

      if (noteRows.length) {
        assertions.push(
          assertMoney({
            id:
              'FINDING_NOTE_CONTEXT_AMOUNT',
            category:
              ASSERTION_CATEGORY.GROUNDING,
            label:
              'context-only note amount matches the raw note amount',
            expected:
              noteRows[0]?.amount,
            actual: finding.amount,
            source: 'NOTAS_CREDITO'
          })
        );
      }
    }
  }

  return assertions;
}

function auditPolicies(explanation) {
  const safeguards =
    explanation?.safeguards || {};

  return [
    assertBoolean({
      id: 'POLICY_NO_LLM_FINANCIAL_REASONING',
      category:
        ASSERTION_CATEGORY.POLICY,
      label:
        'LLM is not used for financial reasoning',
      expected: false,
      actual:
        safeguards
          .llmUsedForFinancialReasoning,
      source: 'SAFEGUARDS'
    }),
    assertBoolean({
      id: 'POLICY_CAUSE_AMOUNTS_FROM_CHARGE_DELTAS',
      category:
        ASSERTION_CATEGORY.POLICY,
      label:
        'cause amounts are derived from charge deltas',
      expected: true,
      actual:
        safeguards
          .causeAmountsDerivedFromChargeDeltas,
      source: 'SAFEGUARDS'
    }),
    assertBoolean({
      id: 'POLICY_NOTES_NOT_AUTO_CAUSES',
      category:
        ASSERTION_CATEGORY.POLICY,
      label:
        'credit/debit notes are not automatically converted to causes',
      expected: false,
      actual:
        safeguards
          .notesAddedAsCausesAutomatically,
      source: 'SAFEGUARDS'
    }),
    assertBoolean({
      id: 'POLICY_SUSPENSION_NOT_DOUBLE_COUNTED',
      category:
        ASSERTION_CATEGORY.POLICY,
      label:
        'suspension credits are not double-counted as variation causes',
      expected: false,
      actual:
        safeguards
          .suspensionCreditsAddedAsVariationCauses,
      source: 'SAFEGUARDS'
    })
  ];
}

function summarizeAssertions(
  assertions = []
) {
  const summary = {
    total: assertions.length,
    evaluable: 0,
    passed: 0,
    failed: 0,
    notEvaluable: 0,
    monetaryEvaluable: 0,
    monetaryFailed: 0,
    byCategory: {}
  };

  for (const assertion of assertions) {
    if (
      !summary.byCategory[
        assertion.category
      ]
    ) {
      summary.byCategory[
        assertion.category
      ] = {
        total: 0,
        evaluable: 0,
        passed: 0,
        failed: 0,
        notEvaluable: 0
      };
    }

    const bucket =
      summary.byCategory[
        assertion.category
      ];

    bucket.total += 1;

    if (
      assertion.status ===
      ASSERTION_STATUS.NOT_EVALUABLE
    ) {
      summary.notEvaluable += 1;
      bucket.notEvaluable += 1;
      continue;
    }

    summary.evaluable += 1;
    bucket.evaluable += 1;

    if (assertion.monetary) {
      summary.monetaryEvaluable += 1;
    }

    if (
      assertion.status ===
      ASSERTION_STATUS.PASS
    ) {
      summary.passed += 1;
      bucket.passed += 1;
    } else {
      summary.failed += 1;
      bucket.failed += 1;

      if (assertion.monetary) {
        summary.monetaryFailed += 1;
      }
    }
  }

  return summary;
}

function percentage(
  numerator,
  denominator
) {
  if (!denominator) {
    return null;
  }

  return Math.round(
    numerator /
    denominator *
    10000
  ) / 100;
}

function auditFinancialExplanation({
  explanation,
  rawCurrentCharges = [],
  rawPreviousCharges = [],
  rawEvidence = {},
  rawPreviousEvidence = {},
  rawOrders = []
}) {
  if (!explanation?.currentBill) {
    throw new Error(
      'Se requiere una explicación financiera con recibo actual'
    );
  }

  const assertions = [
    ...auditInvoice({
      invoice:
        explanation.currentBill,
      rawRows:
        rawCurrentCharges,
      prefix: 'CURRENT'
    }),
    ...auditInvoice({
      invoice:
        explanation.previousBill,
      rawRows:
        rawPreviousCharges,
      prefix: 'PREVIOUS'
    }),
    ...auditComparison({
      explanation,
      rawCurrentCharges,
      rawPreviousCharges
    }),
    ...auditCauses({
      explanation,
      rawCurrentCharges,
      rawPreviousCharges,
      rawEvidenceCurrent:
        rawEvidence,
      rawEvidencePrevious:
        rawPreviousEvidence,
      rawOrders
    }),
    ...auditFindings({
      explanation,
      rawCurrentCharges,
      rawEvidence
    }),
    ...auditPolicies(explanation)
  ];

  const summary =
    summarizeAssertions(assertions);

  const retrieval =
    summary.byCategory[
      ASSERTION_CATEGORY.RETRIEVAL
    ] || {
      evaluable: 0,
      passed: 0,
      failed: 0
    };

  const grounding =
    summary.byCategory[
      ASSERTION_CATEGORY.GROUNDING
    ] || {
      evaluable: 0,
      passed: 0,
      failed: 0
    };

  const policy =
    summary.byCategory[
      ASSERTION_CATEGORY.POLICY
    ] || {
      evaluable: 0,
      passed: 0,
      failed: 0
    };

  return {
    schemaVersion:
      PHASE16_AUDIT_VERSION,
    phase: 'PHASE_16',
    status:
      summary.failed === 0
        ? 'PASS'
        : 'FAIL',
    metrics: {
      retrievalAccuracyPct:
        percentage(
          retrieval.passed,
          retrieval.evaluable
        ),
      groundingAccuracyPct:
        percentage(
          grounding.passed,
          grounding.evaluable
        ),
      policyCompliancePct:
        percentage(
          policy.passed,
          policy.evaluable
        ),
      detectableFinancialHallucinationRatePct:
        percentage(
          summary.monetaryFailed,
          summary.monetaryEvaluable
        ),
      financialClaimViolations:
        summary.monetaryFailed,
      totalViolations:
        summary.failed
    },
    assertionSummary: summary,
    assertions
  };
}

function buildSafeFinancialResponseTrace(
  explanation
) {
  if (!explanation?.currentBill) {
    return null;
  }

  const interpretation =
    explanation.interpretation || {};
  const causes =
    interpretation.causes || [];
  const findings =
    interpretation
      .currentBillFindings || [];

  const rulesApplied = [
    ...causes.map(
      (cause) => ({
        kind: 'CAUSE',
        code: cause.code || null,
        ruleId: cause.ruleId || null,
        evidenceLevel:
          cause.evidenceLevel || null,
        impactAmount:
          Number.isFinite(
            Number(cause.impactAmount)
          )
            ? roundMoney(
                cause.impactAmount
              )
            : null
      })
    ),
    ...findings.map(
      (finding) => ({
        kind: 'FINDING',
        code:
          finding.code || null,
        ruleId:
          finding.ruleId || null,
        evidenceLevel:
          finding.evidenceLevel || null,
        impactAmount:
          Number.isFinite(
            Number(
              finding.amount ??
              finding.impactAmount ??
              finding.impactOnBill
            )
          )
            ? roundMoney(
                finding.amount ??
                finding.impactAmount ??
                finding.impactOnBill
              )
            : null
      })
    )
  ];

  const datasets = uniqueValues(
    (
      explanation.dataLineage
        ?.datasets || []
    ).map(
      (dataset) =>
        dataset.datasetKey
    )
  );

  return {
    schemaVersion:
      'desafio1-phase16-response-trace-v1',
    phase: 'PHASE_16',
    financialReasoning:
      'DETERMINISTIC',
    retrieval: {
      current: {
        cycleDate:
          explanation.currentBill
            .cycleDate || null,
        total:
          Number.isFinite(
            Number(
              explanation.currentBill
                .total
            )
          )
            ? roundMoney(
                explanation.currentBill
                  .total
              )
            : null,
        itemCount:
          (
            explanation.currentBill
              .items || []
          ).length,
        rawChargeRows:
          Number(
            explanation.currentBill
              .rawChargeRows || 0
          )
      },
      previous:
        explanation.previousBill
          ? {
              cycleDate:
                explanation.previousBill
                  .cycleDate || null,
              total:
                Number.isFinite(
                  Number(
                    explanation.previousBill
                      .total
                  )
                )
                  ? roundMoney(
                      explanation.previousBill
                        .total
                    )
                  : null,
              itemCount:
                (
                  explanation.previousBill
                    .items || []
                ).length,
              rawChargeRows:
                Number(
                  explanation.previousBill
                    .rawChargeRows || 0
                )
            }
          : null,
      difference:
        explanation.comparison &&
        Number.isFinite(
          Number(
            explanation.comparison
              .difference
          )
        )
          ? roundMoney(
              explanation.comparison
                .difference
            )
          : null
    },
    interpretation: {
      ruleVersion:
        interpretation.ruleVersion || null,
      status:
        interpretation.status || null,
      explainedNetAmount:
        Number.isFinite(
          Number(
            interpretation
              .explainedNetAmount
          )
        )
          ? roundMoney(
              interpretation
                .explainedNetAmount
            )
          : null,
      unexplainedAmount:
        Number.isFinite(
          Number(
            interpretation
              .unexplainedAmount
          )
        )
          ? roundMoney(
              interpretation
                .unexplainedAmount
            )
          : null,
      coveragePercent:
        interpretation
          .coveragePercent ?? null
    },
    rulesApplied,
    datasets,
    safeguards: {
      llmUsedForFinancialReasoning:
        explanation.safeguards
          ?.llmUsedForFinancialReasoning ===
        true,
      causeAmountsDerivedFromChargeDeltas:
        explanation.safeguards
          ?.causeAmountsDerivedFromChargeDeltas ===
        true,
      privateIdentifiersIncluded:
        false,
      sourceRowsIncluded: false,
      invoiceNumbersIncluded: false
    }
  };
}

function buildSafeCaseAudit(
  audit,
  {
    caseRef,
    explanation = null
  } = {}
) {
  const failed = (
    audit?.assertions || []
  )
    .filter(
      (assertion) =>
        assertion.status ===
        ASSERTION_STATUS.FAIL
    )
    .map(
      (assertion) => ({
        id: assertion.id,
        category:
          assertion.category,
        reason:
          assertion.reason || null,
        source:
          assertion.source || null
      })
    );

  const scenarios = uniqueValues([
    ...(
      explanation?.interpretation
        ?.causes || []
    ).map((item) => item.code),
    ...(
      explanation?.interpretation
        ?.currentBillFindings || []
    ).map((item) => item.code)
  ]);

  return {
    caseRef,
    status: audit.status,
    explanationStatus:
      explanation?.interpretation
        ?.status || null,
    scenarios,
    metrics: audit.metrics,
    assertions: {
      total:
        audit.assertionSummary.total,
      evaluable:
        audit.assertionSummary.evaluable,
      passed:
        audit.assertionSummary.passed,
      failed:
        audit.assertionSummary.failed,
      notEvaluable:
        audit.assertionSummary
          .notEvaluable
    },
    failedAssertions: failed
  };
}

function mergeAuditCases(
  cases = [],
  {
    requested = null,
    population = null,
    generatedAt = null
  } = {}
) {
  const evaluable = cases.reduce(
    (sum, item) =>
      sum +
      Number(
        item?.assertions
          ?.evaluable || 0
      ),
    0
  );
  const passed = cases.reduce(
    (sum, item) =>
      sum +
      Number(
        item?.assertions
          ?.passed || 0
      ),
    0
  );
  const failed = cases.reduce(
    (sum, item) =>
      sum +
      Number(
        item?.assertions
          ?.failed || 0
      ),
    0
  );

  const retrievalEvaluable =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._categorySummary
            ?.RETRIEVAL?.evaluable || 0
        ),
      0
    );
  const retrievalPassed =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._categorySummary
            ?.RETRIEVAL?.passed || 0
        ),
      0
    );
  const groundingEvaluable =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._categorySummary
            ?.GROUNDING?.evaluable || 0
        ),
      0
    );
  const groundingPassed =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._categorySummary
            ?.GROUNDING?.passed || 0
        ),
      0
    );
  const policyEvaluable =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._categorySummary
            ?.POLICY?.evaluable || 0
        ),
      0
    );
  const policyPassed =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._categorySummary
            ?.POLICY?.passed || 0
        ),
      0
    );
  const monetaryEvaluable =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._monetaryEvaluable || 0
        ),
      0
    );
  const monetaryFailed =
    cases.reduce(
      (sum, item) =>
        sum +
        Number(
          item?._monetaryFailed || 0
        ),
      0
    );

  const scenarioCounts = {};
  for (const item of cases) {
    for (
      const scenario of
        item.scenarios || []
    ) {
      scenarioCounts[scenario] =
        (scenarioCounts[scenario] || 0) + 1;
    }
  }

  const safeCases = cases.map(
    (item) => {
      const {
        _categorySummary,
        _monetaryEvaluable,
        _monetaryFailed,
        ...safe
      } = item;
      return safe;
    }
  );

  return {
    schemaVersion:
      PHASE16_AUDIT_VERSION,
    phase: 'PHASE_16',
    generatedAt:
      generatedAt ||
      new Date().toISOString(),
    status:
      failed === 0
        ? 'PASS'
        : 'FAIL',
    selection: {
      method:
        'EVENLY_SPACED_BILLABLE_SUBSCRIBERS',
      population:
        Number(population || 0),
      requested:
        Number(
          requested ?? cases.length
        ),
      evaluated: cases.length
    },
    metrics: {
      retrievalAccuracyPct:
        percentage(
          retrievalPassed,
          retrievalEvaluable
        ),
      groundingAccuracyPct:
        percentage(
          groundingPassed,
          groundingEvaluable
        ),
      policyCompliancePct:
        percentage(
          policyPassed,
          policyEvaluable
        ),
      detectableFinancialHallucinationRatePct:
        percentage(
          monetaryFailed,
          monetaryEvaluable
        ),
      financialClaimViolations:
        monetaryFailed,
      totalViolations: failed,
      evaluatedAssertions:
        evaluable,
      passedAssertions: passed
    },
    scenarioCoverage: scenarioCounts,
    safeguards: {
      identifiersPrinted: false,
      subscriberKeyExposed: false,
      customerKeyExposed: false,
      rawFinancialAccountExposed: false,
      llmUsedForScoring: false,
      benchmarkGroundTruth:
        'RAW_SQLITE_ROWS_AND_DETERMINISTIC_INVARIANTS',
      monetaryRounding:
        'SYMMETRIC_HALF_AWAY_FROM_ZERO_TO_CENTS',
      structuralZeroAmountChangesIncluded:
        true,
      zeroHallucinationClaimScope:
        'DETECTABLE_STRUCTURED_FINANCIAL_CLAIMS_ONLY'
    },
    cases: safeCases
  };
}

module.exports = {
  PHASE16_AUDIT_VERSION,
  ASSERTION_STATUS,
  ASSERTION_CATEGORY,
  MONEY_TOLERANCE,
  moneyMatches,
  groupRawCharges,
  buildRawChargeChanges,
  summarizeAssertions,
  percentage,
  auditFinancialExplanation,
  buildSafeFinancialResponseTrace,
  buildSafeCaseAudit,
  mergeAuditCases
};
