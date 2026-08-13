const {
  analyzeSubscriberBilling
} = require(
  '../services/billingAnalysisService'
);

function parseArgs(
  argv
) {
  const args = {
    subscriber: null,
    json: false
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const token =
      argv[index];

    if (
      token === '--subscriber' ||
      token === '-s'
    ) {
      args.subscriber =
        argv[index + 1] ||
        null;

      index += 1;
      continue;
    }

    if (token === '--json') {
      args.json = true;
    }
  }

  return args;
}

function formatMoney(
  value
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return 'N/D';
  }

  return `S/ ${Number(value).toFixed(2)}`;
}

function formatSignedMoney(
  value
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return 'N/D';
  }

  const number =
    Number(value);

  const sign =
    number > 0
      ? '+'
      : number < 0
        ? '-'
        : '';

  return `${sign}S/ ${Math.abs(number).toFixed(2)}`;
}

function printEvidenceCounts(
  label,
  evidence
) {
  if (!evidence) {
    console.log(
      `   ${label}: sin recibo`
    );

    return;
  }

  const counts =
    evidence.counts
      .uniqueRecords;

  console.log(
    `   ${label}: `
    + `${counts.proration} prorrateo(s), `
    + `${counts.reconnection} reconexión(es), `
    + `${counts.discountsAndInstallments} descuento/cuota(s), `
    + `${counts.creditDebitNotes} nota(s)`
  );
}

function printHumanSummary(
  analysis
) {
  const {
    subscriber,
    currentBill,
    previousBill,
    comparison,
    evidence
  } = analysis;

  console.log(
    '==================================================='
  );

  console.log(
    '  FASE 2 · INSPECCIÓN DE FACTURACIÓN DESAFÍO 1'
  );

  console.log(
    '==================================================='
  );

  console.log(
    `Suscriptor: ${subscriber.subscriberKey}`
  );

  console.log(
    `Cliente: ${subscriber.customerKey}`
  );

  console.log(
    `Producto: ${subscriber.lobType || 'N/D'} · ${subscriber.businessType || 'N/D'}`
  );

  console.log('');

  console.log(
    `Recibo actual: ${currentBill.invoiceNumber}`
  );

  console.log(
    `   Ciclo: ${currentBill.cycleDate || 'N/D'}`
  );

  console.log(
    `   Total reconstruido: ${formatMoney(currentBill.total)}`
  );

  console.log(
    `   Filas de cargos: ${currentBill.rawChargeRows}`
  );

  console.log(
    `   Conceptos agrupados: ${currentBill.items.length}`
  );

  if (previousBill) {
    console.log('');

    console.log(
      `Recibo anterior: ${previousBill.invoiceNumber}`
    );

    console.log(
      `   Ciclo: ${previousBill.cycleDate || 'N/D'}`
    );

    console.log(
      `   Total reconstruido: ${formatMoney(previousBill.total)}`
    );
  }

  if (comparison) {
    console.log('');

    console.log(
      `Variación: ${formatSignedMoney(comparison.difference)} · ${comparison.direction}`
    );

    console.log(
      `Conciliación de diferencias: ${comparison.reconciled ? 'OK' : 'REVISAR'}`
    );

    console.log(
      `Residual: ${formatMoney(comparison.reconciliationResidual)}`
    );

    console.log('');

    console.log(
      'Cambios de cargos más relevantes:'
    );

    const visibleChanges =
      comparison
        .chargeChanges
        .filter(
          (change) =>
            !change
              .ignoreForExplanation
        )
        .slice(0, 12);

    if (!visibleChanges.length) {
      console.log(
        '   Sin cambios materiales fuera de NO CONSIDERAR.'
      );
    } else {
      for (
        const change of
          visibleChanges
      ) {
        console.log(
          `   ${formatSignedMoney(change.delta)} · `
          + `${change.chargeCode} · `
          + `${change.description || 'Sin descripción'}`
        );
      }
    }
  }

  console.log('');

  console.log(
    'Evidencia estructurada encontrada:'
  );

  printEvidenceCounts(
    'Recibo actual',
    evidence.current
  );

  printEvidenceCounts(
    'Recibo anterior',
    evidence.previous
  );

  console.log(
    `   Órdenes entre ambos ciclos: ${evidence.ordersBetweenBills.length}`
  );

  console.log('');

  console.log(
    'ℹ️ Esta fase NO asigna todavía causas financieras.'
  );

  console.log(
    '   La interpretación con reglas de negocio y videos corresponde a Fase 3.'
  );
}

async function main() {
  const args =
    parseArgs(
      process.argv.slice(2)
    );

  if (!args.subscriber) {
    console.error(
      'Uso: npm run billing:inspect:desafio1 -- --subscriber <SUBSCRIBER_KEY> [--json]'
    );

    process.exitCode = 1;

    return;
  }

  try {
    const analysis =
      await analyzeSubscriberBilling(
        args.subscriber
      );

    if (args.json) {
      console.log(
        JSON.stringify(
          analysis,
          null,
          2
        )
      );

      return;
    }

    printHumanSummary(
      analysis
    );
  } catch (error) {
    console.error(
      `❌ ${error.code ? `[${error.code}] ` : ''}${error.message}`
    );

    process.exitCode = 1;
  }
}

if (
  require.main === module
) {
  main();
}

module.exports = {
  parseArgs,
  formatMoney,
  formatSignedMoney,
  printHumanSummary
};
