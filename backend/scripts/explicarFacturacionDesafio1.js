const {
  createBillingExplanationService
} = require(
  '../services/billingExplanationService'
);

function getArgValue(
  name
) {
  const index =
    process.argv.indexOf(
      name
    );

  if (
    index === -1 ||
    index ===
      process.argv.length - 1
  ) {
    return null;
  }

  return process.argv[
    index + 1
  ];
}

function formatSignedMoney(
  value
) {
  const number =
    Number(value) || 0;

  const sign =
    number > 0
      ? '+'
      : number < 0
        ? '-'
        : '';

  return `${sign}S/ ${Math.abs(number).toFixed(2)}`;
}

function printHumanReadable(
  result
) {
  const {
    subscriber,
    currentBill,
    previousBill,
    comparison,
    interpretation,
    customerFacing
  } = result;

  console.log(
    '==================================================='
  );
  console.log(
    '  FASE 3 · EXPLICACIÓN VERIFICABLE DESAFÍO 1'
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
    `Producto: ${subscriber.lobType || '-'} · ${subscriber.businessType || '-'}`
  );
  console.log('');

  console.log(
    `Recibo actual: ${currentBill.invoiceNumber}`
  );
  console.log(
    `   Ciclo: ${currentBill.cycleDate || '-'}`
  );
  console.log(
    `   Total reconstruido: S/ ${Number(currentBill.total).toFixed(2)}`
  );

  if (previousBill) {
    console.log('');
    console.log(
      `Recibo anterior: ${previousBill.invoiceNumber}`
    );
    console.log(
      `   Ciclo: ${previousBill.cycleDate || '-'}`
    );
    console.log(
      `   Total reconstruido: S/ ${Number(previousBill.total).toFixed(2)}`
    );
  }

  console.log('');

  if (comparison) {
    console.log(
      `Variación: ${formatSignedMoney(comparison.difference)} · ${comparison.direction}`
    );
    console.log(
      `Estado: ${interpretation.status}`
    );
    console.log(
      `Monto explicado (neto): ${formatSignedMoney(interpretation.explainedNetAmount)}`
    );
    console.log(
      `Monto sin causa verificada: ${formatSignedMoney(interpretation.unexplainedAmount)}`
    );
    console.log(
      `Cobertura: ${interpretation.coveragePercent}%`
    );
  } else {
    console.log(
      `Estado: ${interpretation.status}`
    );
    console.log(
      'No hay un recibo anterior disponible para calcular una variación.'
    );
  }

  console.log('');
  console.log('Causas verificadas:');

  if (!interpretation.causes.length) {
    console.log(
      '   (ninguna causa asignada a la variación)'
    );
  }

  for (
    const cause of
      interpretation.causes
  ) {
    console.log(
      `   • ${cause.label} · ${formatSignedMoney(cause.impactAmount)} · evidencia ${cause.evidenceLevel}`
    );
    console.log(
      `     ${cause.explanation}`
    );
  }

  console.log('');
  console.log(
    'Hallazgos del recibo actual:'
  );

  const usefulFindings =
    interpretation
      .currentBillFindings
      .filter(
        (finding) =>
          finding.code !==
            'ADJUSTMENT_NOTE_CONTEXT' ||
          finding.evidenceLevel !==
            'LOW'
      );

  if (!usefulFindings.length) {
    console.log(
      '   (sin hallazgos adicionales)'
    );
  }

  for (
    const finding of
      usefulFindings
  ) {
    const amount =
      finding.amount ??
      finding.impactOnBill ??
      finding.discountAmount ??
      null;

    console.log(
      `   • ${finding.label}${amount !== null ? ` · ${formatSignedMoney(amount)}` : ''} · evidencia ${finding.evidenceLevel}`
    );
    console.log(
      `     ${finding.explanation}`
    );
  }

  console.log('');
  console.log(
    'Contexto de renta:'
  );

  const rent =
    interpretation.rentContext
      .current;

  if (rent?.resolved) {
    console.log(
      `   ${rent.label} (${rent.rentType})`
    );
    console.log(
      `   ${rent.definition}`
    );
  } else if (
    rent?.ambiguous
  ) {
    console.log(
      `   Mixto/ambiguo: ${rent.observedRentTypes.join(', ')}`
    );
  } else {
    console.log(
      '   No determinado con evidencia suficiente.'
    );
  }

  console.log('');
  console.log(
    'Texto seguro para una capa conversacional:'
  );
  console.log(
    `   ${customerFacing.headline}`
  );
  console.log(
    `   ${customerFacing.summary}`
  );

  for (
    const limitation of
      customerFacing.limitations
  ) {
    console.log(
      `   ⚠ ${limitation}`
    );
  }

  console.log('');
  console.log(
    'ℹ️ No se utilizó un LLM para calcular montos ni descubrir causas.'
  );
  console.log(
    '   Las causas se asignan a cambios de cargos mediante reglas deterministas y evidencia estructurada.'
  );
}

async function main() {
  const subscriberKey =
    getArgValue(
      '--subscriber'
    );

  const jsonMode =
    process.argv.includes(
      '--json'
    );

  if (!subscriberKey) {
    console.error(
      'Uso: npm run billing:explain:desafio1 -- --subscriber <SUBSCRIBER_KEY> [--json]'
    );
    process.exitCode = 1;
    return;
  }

  const service =
    createBillingExplanationService();

  try {
    const result =
      await service
        .explainSubscriber(
          subscriberKey
        );

    if (jsonMode) {
      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );
      return;
    }

    printHumanReadable(
      result
    );
  } catch (error) {
    console.error(
      `❌ ${error.code || error.name || 'ERROR'}: ${error.message}`
    );
    process.exitCode = 1;
  } finally {
    await service.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getArgValue,
  formatSignedMoney,
  printHumanReadable
};
