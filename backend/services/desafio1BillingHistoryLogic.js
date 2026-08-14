const MAX_HISTORY_BILLS = 6;
const MAX_PREVIOUS_BILLS = 5;
const MONEY_EPSILON = 0.005;

function roundMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const sign =
    number < 0 ? -1 : 1;
  const roundedMagnitude =
    Math.round(
      (Math.abs(number) +
        Number.EPSILON) * 100
    ) / 100;
  const result =
    sign * roundedMagnitude;

  return Object.is(result, -0)
    ? 0
    : result;
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

function directionFor(value) {
  const amount = roundMoney(value);

  if (amount > MONEY_EPSILON) {
    return 'UP';
  }

  if (amount < -MONEY_EPSILON) {
    return 'DOWN';
  }

  return 'FLAT';
}

function safeBillReference(bill) {
  if (!bill) {
    return null;
  }

  return {
    cycleDate:
      bill.cycleDate || null,
    period:
      bill.period || null,
    total:
      roundMoney(bill.total)
  };
}

function normalizeHistoryBills(
  bills = []
) {
  return (bills || [])
    .filter(
      (bill) =>
        bill &&
        Number.isFinite(
          Number(bill.total)
        )
    )
    .map(
      (bill) => ({
        ...bill,
        total:
          roundMoney(bill.total),
        items:
          (bill.items || [])
            .map(
              (item) => ({
                ...item,
                amount:
                  roundMoney(
                    item?.amount
                  )
              })
            )
      })
    )
    .sort(
      (left, right) =>
        String(
          right.cycleDate || ''
        ).localeCompare(
          String(
            left.cycleDate || ''
          )
        )
    )
    .slice(0, MAX_HISTORY_BILLS);
}

function buildChanges(
  billsNewestFirst
) {
  const chronological = [
    ...billsNewestFirst
  ].reverse();

  const changes = [];

  for (
    let index = 1;
    index < chronological.length;
    index += 1
  ) {
    const from =
      chronological[index - 1];
    const to =
      chronological[index];
    const difference =
      roundMoney(
        to.total - from.total
      );

    const percentage =
      Math.abs(from.total) >
        MONEY_EPSILON
        ? roundMoney(
            difference /
              from.total *
              100
          )
        : null;

    changes.push({
      from:
        safeBillReference(from),
      to:
        safeBillReference(to),
      difference,
      percentage,
      direction:
        directionFor(difference)
    });
  }

  return changes;
}

function findMostRecentIncrease(
  billsNewestFirst
) {
  for (
    let index = 0;
    index <
      billsNewestFirst.length - 1;
    index += 1
  ) {
    const newer =
      billsNewestFirst[index];
    const older =
      billsNewestFirst[index + 1];
    const difference =
      roundMoney(
        newer.total - older.total
      );

    if (
      difference > MONEY_EPSILON
    ) {
      return {
        from:
          safeBillReference(older),
        to:
          safeBillReference(newer),
        difference,
        isCurrentChange:
          index === 0
      };
    }
  }

  return null;
}

function buildBillingHistoryView(
  bills = []
) {
  const normalizedBills =
    normalizeHistoryBills(bills);

  const availableBills =
    normalizedBills.length;

  if (!availableBills) {
    return {
      schemaVersion:
        'desafio1-billing-history-v1',
      maxBills:
        MAX_HISTORY_BILLS,
      maxPreviousBills:
        MAX_PREVIOUS_BILLS,
      availableBills: 0,
      previousBills: 0,
      completeWindow: false,
      bills: [],
      changes: [],
      summary: {
        averageTotal: null,
        highestBill: null,
        lowestBill: null,
        oldestBill: null,
        newestBill: null,
        netChange: null,
        netDirection: null,
        latestChange: null,
        mostRecentIncrease: null
      }
    };
  }

  const totals =
    normalizedBills.map(
      (bill) => bill.total
    );

  const highest =
    normalizedBills.reduce(
      (best, bill) =>
        !best ||
        bill.total > best.total
          ? bill
          : best,
      null
    );

  const lowest =
    normalizedBills.reduce(
      (best, bill) =>
        !best ||
        bill.total < best.total
          ? bill
          : best,
      null
    );

  const newest =
    normalizedBills[0];
  const oldest =
    normalizedBills[
      normalizedBills.length - 1
    ];

  const netChange =
    availableBills >= 2
      ? roundMoney(
          newest.total -
          oldest.total
        )
      : null;

  const changes =
    buildChanges(normalizedBills);

  const latestChange =
    changes.length
      ? changes[
          changes.length - 1
        ]
      : null;

  return {
    schemaVersion:
      'desafio1-billing-history-v1',
    maxBills:
      MAX_HISTORY_BILLS,
    maxPreviousBills:
      MAX_PREVIOUS_BILLS,
    availableBills,
    previousBills:
      Math.max(
        0,
        availableBills - 1
      ),
    completeWindow:
      availableBills ===
      MAX_HISTORY_BILLS,
    bills:
      normalizedBills,
    changes,
    summary: {
      averageTotal:
        roundMoney(
          totals.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          totals.length
        ),
      highestBill:
        safeBillReference(highest),
      lowestBill:
        safeBillReference(lowest),
      oldestBill:
        safeBillReference(oldest),
      newestBill:
        safeBillReference(newest),
      netChange,
      netDirection:
        netChange === null
          ? null
          : directionFor(netChange),
      latestChange,
      mostRecentIncrease:
        findMostRecentIncrease(
          normalizedBills
        )
    }
  };
}

function historyItems(history) {
  return (
    history?.bills || []
  ).flatMap(
    (bill) =>
      (bill.items || [])
        .map(
          (item) => ({
            ...item,
            cycleDate:
              bill.cycleDate || null,
            period:
              bill.period || null
          })
        )
  );
}

const CHARGE_QUERY_STOP_WORDS =
  new Set([
    'el', 'la', 'los', 'las',
    'un', 'una', 'de', 'del',
    'mi', 'mis', 'este', 'esta',
    'ese', 'esa', 'cargo', 'cobro',
    'recibo', 'factura', 'aparece',
    'todos', 'todas', 'mes', 'meses',
    'cada', 'unico', 'unica',
    'recurrente', 'repite', 'se',
    'es', 'fue', 'sigue', 'si'
  ]);

function findHistoryChargeByText(
  history,
  message
) {
  const normalizedMessage =
    normalizeText(message);

  if (!normalizedMessage) {
    return null;
  }

  const messageTokens =
    new Set(
      normalizedMessage
        .split(' ')
        .filter(
          (token) =>
            token &&
            !CHARGE_QUERY_STOP_WORDS
              .has(token)
        )
    );

  const uniqueItems =
    new Map();

  for (
    const item of
      historyItems(history)
  ) {
    const key =
      String(
        item.chargeCode ||
        normalizeText(item.label)
      );

    if (
      key &&
      !uniqueItems.has(key)
    ) {
      uniqueItems.set(key, item);
    }
  }

  const candidates = [];

  for (
    const item of
      uniqueItems.values()
  ) {
    const label =
      normalizeText(
        item.label || ''
      );

    if (!label) {
      continue;
    }

    if (
      normalizedMessage.includes(
        label
      )
    ) {
      candidates.push({
        item,
        score: 1000
      });
      continue;
    }

    const itemTokens =
      label
        .split(' ')
        .filter(
          (token) =>
            token &&
            !CHARGE_QUERY_STOP_WORDS
              .has(token)
        );

    const matched =
      itemTokens.filter(
        (token) =>
          messageTokens.has(token)
      );

    const distinctive =
      matched.filter(
        (token) =>
          /\d/.test(token) ||
          token.length >= 6
      );

    if (
      matched.length >= 2 ||
      distinctive.length >= 1
    ) {
      candidates.push({
        item,
        score:
          matched.length * 10 +
          distinctive.length * 5
      });
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score
  );

  if (!candidates.length) {
    return null;
  }

  if (
    candidates.length > 1 &&
    candidates[0].score ===
      candidates[1].score
  ) {
    return null;
  }

  const best =
    candidates[0].item;

  return {
    chargeCode:
      best.chargeCode || null,
    label:
      best.label || null
  };
}

function analyzeChargeRecurrence(
  history,
  subject
) {
  const bills =
    history?.bills || [];

  if (
    !bills.length ||
    !subject
  ) {
    return null;
  }

  const targetCode =
    String(
      subject.chargeCode || ''
    ).trim();
  const targetLabel =
    normalizeText(
      subject.label || ''
    );

  if (
    !targetCode &&
    !targetLabel
  ) {
    return null;
  }

  const occurrences = [];

  for (const bill of bills) {
    const item =
      (bill.items || [])
        .find(
          (candidate) => {
            if (
              targetCode &&
              String(
                candidate.chargeCode || ''
              ).trim() === targetCode
            ) {
              return true;
            }

            return (
              !targetCode &&
              targetLabel &&
              normalizeText(
                candidate.label || ''
              ) === targetLabel
            );
          }
        );

    if (!item) {
      continue;
    }

    occurrences.push({
      cycleDate:
        bill.cycleDate || null,
      period:
        bill.period || null,
      amount:
        roundMoney(item.amount),
      label:
        item.label ||
        subject.label ||
        'Cargo'
    });
  }

  const occurrenceCount =
    occurrences.length;
  const allAvailable =
    occurrenceCount > 0 &&
    occurrenceCount === bills.length;
  const recurring =
    occurrenceCount >= 2;

  let status = 'NOT_FOUND';

  if (allAvailable) {
    status = 'ALL_AVAILABLE';
  } else if (recurring) {
    status = 'RECURRING';
  } else if (occurrenceCount === 1) {
    status = 'ONE_TIME_IN_WINDOW';
  }

  const chronological = [
    ...occurrences
  ].reverse();

  return {
    status,
    billCount:
      bills.length,
    occurrenceCount,
    allAvailable,
    recurring,
    label:
      occurrences[0]?.label ||
      subject.label ||
      'Cargo',
    firstSeen:
      chronological[0] || null,
    lastSeen:
      occurrences[0] || null,
    amounts:
      Array.from(
        new Set(
          occurrences.map(
            (entry) =>
              entry.amount
          )
        )
      )
  };
}

module.exports = {
  MAX_HISTORY_BILLS,
  MAX_PREVIOUS_BILLS,
  roundMoney,
  normalizeText,
  buildBillingHistoryView,
  findHistoryChargeByText,
  analyzeChargeRecurrence
};
