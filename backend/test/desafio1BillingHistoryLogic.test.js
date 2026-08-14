const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_HISTORY_BILLS,
  roundMoney,
  buildBillingHistoryView,
  findHistoryChargeByText,
  analyzeChargeRecurrence
} = require(
  '../services/desafio1BillingHistoryLogic'
);

function bill(
  cycleDate,
  total,
  items = []
) {
  return {
    cycleDate,
    period:
      `Ciclo ${cycleDate}`,
    total,
    status: 'Sin deuda',
    items
  };
}

function item(
  chargeCode,
  label,
  amount
) {
  return {
    chargeCode,
    label,
    amount
  };
}


test(
  'histórico conserva redondeo monetario simétrico en importes negativos',
  () => {
    assert.equal(
      roundMoney(-5.635),
      -5.64
    );
  }
);

test(
  'Fase 14 limita el histórico al recibo actual y cinco anteriores',
  () => {
    const history =
      buildBillingHistoryView([
        bill('2026-07-15', 70),
        bill('2026-06-15', 60),
        bill('2026-05-15', 50),
        bill('2026-04-15', 40),
        bill('2026-03-15', 30),
        bill('2026-02-15', 20),
        bill('2026-01-15', 10)
      ]);

    assert.equal(
      MAX_HISTORY_BILLS,
      6
    );
    assert.equal(
      history.availableBills,
      6
    );
    assert.equal(
      history.previousBills,
      5
    );
    assert.equal(
      history.completeWindow,
      true
    );
    assert.equal(
      history.bills.at(-1).cycleDate,
      '2026-02-15'
    );
  }
);

test(
  'calcula tendencia, promedio y extremos sin usar texto generativo',
  () => {
    const history =
      buildBillingHistoryView([
        bill('2026-07-15', 82.9),
        bill('2026-06-15', 72.9),
        bill('2026-05-15', 92.9),
        bill('2026-04-15', 62.9)
      ]);

    assert.equal(
      history.summary.netChange,
      20
    );
    assert.equal(
      history.summary.netDirection,
      'UP'
    );
    assert.equal(
      history.summary.highestBill.total,
      92.9
    );
    assert.equal(
      history.summary.lowestBill.total,
      62.9
    );
    assert.equal(
      history.summary.averageTotal,
      77.9
    );
  }
);

test(
  'identifica el aumento más reciente y distingue si corresponde al ciclo actual',
  () => {
    const currentIncrease =
      buildBillingHistoryView([
        bill('2026-07-15', 90),
        bill('2026-06-15', 80),
        bill('2026-05-15', 100)
      ]);

    assert.equal(
      currentIncrease.summary
        .mostRecentIncrease
        .difference,
      10
    );
    assert.equal(
      currentIncrease.summary
        .mostRecentIncrease
        .isCurrentChange,
      true
    );

    const olderIncrease =
      buildBillingHistoryView([
        bill('2026-07-15', 80),
        bill('2026-06-15', 90),
        bill('2026-05-15', 70)
      ]);

    assert.equal(
      olderIncrease.summary
        .mostRecentIncrease
        .difference,
      20
    );
    assert.equal(
      olderIncrease.summary
        .mostRecentIncrease
        .isCurrentChange,
      false
    );
  }
);

test(
  'un solo recibo no inventa tendencia ni aumento',
  () => {
    const history =
      buildBillingHistoryView([
        bill('2026-07-15', 49.9)
      ]);

    assert.equal(
      history.summary.netChange,
      null
    );
    assert.equal(
      history.summary.latestChange,
      null
    );
    assert.equal(
      history.summary.mostRecentIncrease,
      null
    );
  }
);

test(
  'recurrencia exige presencia real del mismo charge code en los recibos disponibles',
  () => {
    const history =
      buildBillingHistoryView([
        bill(
          '2026-07-15',
          49.89,
          [
            item(
              'PKG_3GB',
              'Paquete 3GB de Internet',
              9.99
            )
          ]
        ),
        bill(
          '2026-06-15',
          49.89,
          [
            item(
              'PKG_3GB',
              'Paquete 3GB de Internet',
              9.99
            )
          ]
        ),
        bill(
          '2026-05-15',
          39.9,
          []
        )
      ]);

    const result =
      analyzeChargeRecurrence(
        history,
        {
          chargeCode: 'PKG_3GB',
          label:
            'Paquete 3GB de Internet'
        }
      );

    assert.equal(
      result.status,
      'RECURRING'
    );
    assert.equal(
      result.occurrenceCount,
      2
    );
    assert.equal(
      result.billCount,
      3
    );
    assert.equal(
      result.allAvailable,
      false
    );
  }
);

test(
  'un cargo presente una sola vez se clasifica solo dentro de la ventana disponible',
  () => {
    const history =
      buildBillingHistoryView([
        bill(
          '2026-07-15',
          49.89,
          [
            item(
              'PKG_ONESHOT',
              'Paquete datos OneShot',
              9.99
            )
          ]
        ),
        bill(
          '2026-06-15',
          39.9,
          []
        )
      ]);

    const result =
      analyzeChargeRecurrence(
        history,
        {
          chargeCode:
            'PKG_ONESHOT',
          label:
            'Paquete datos OneShot'
        }
      );

    assert.equal(
      result.status,
      'ONE_TIME_IN_WINDOW'
    );
    assert.equal(
      result.recurring,
      false
    );
  }
);

test(
  'puede resolver un cargo mencionado por nombre sin revelar identificadores del suscriptor',
  () => {
    const history =
      buildBillingHistoryView([
        bill(
          '2026-07-15',
          49.89,
          [
            item(
              'PKG_3GB',
              'Paquete 3GB de Internet 10dias x S/10',
              9.99
            )
          ]
        )
      ]);

    const subject =
      findHistoryChargeByText(
        history,
        '¿El paquete 3GB aparece todos los meses?'
      );

    assert.equal(
      subject.chargeCode,
      'PKG_3GB'
    );
  }
);
