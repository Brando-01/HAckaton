const path = require('path');

const {
  createPresenterCaseService
} = require(
  '../services/desafio1PresenterCaseService'
);

function readValue(
  argv,
  index,
  flag
) {
  const value = argv[index + 1];

  if (
    value === undefined ||
    String(value).startsWith('--')
  ) {
    throw new Error(
      `${flag} requiere un valor.`
    );
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    caseRef: null,
    scenario: null,
    quality: 'PREMIUM',
    coverageDbPath: null,
    dbPath: null,
    help: false
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];

    if (arg === '--case') {
      options.caseRef =
        readValue(
          argv,
          index,
          '--case'
        );
      index += 1;
      continue;
    }

    if (arg === '--scenario') {
      options.scenario =
        readValue(
          argv,
          index,
          '--scenario'
        );
      index += 1;
      continue;
    }

    if (arg === '--quality') {
      options.quality =
        readValue(
          argv,
          index,
          '--quality'
        );
      index += 1;
      continue;
    }

    if (arg === '--coverage-db') {
      options.coverageDbPath =
        path.resolve(
          process.cwd(),
          readValue(
            argv,
            index,
            '--coverage-db'
          )
        );
      index += 1;
      continue;
    }

    if (arg === '--db') {
      options.dbPath =
        path.resolve(
          process.cwd(),
          readValue(
            argv,
            index,
            '--db'
          )
        );
      index += 1;
      continue;
    }

    if (
      arg === '--help' ||
      arg === '-h'
    ) {
      options.help = true;
      continue;
    }

    throw new Error(
      `Argumento no reconocido: ${arg}`
    );
  }

  if (
    options.caseRef &&
    options.scenario
  ) {
    throw new Error(
      'Usa --case para resolver un caso exacto o --scenario para buscar uno; no ambos a la vez.'
    );
  }

  return options;
}

function printHelp() {
  console.log(`
Herramienta local del presentador · acceso a casos de cobertura

Uso:
  npm run demo:login-case:desafio1 -- --case 74
  npm run demo:login-case:desafio1 -- --case "Caso #000074"
  npm run demo:login-case:desafio1 -- --scenario RECONNECTION --quality PREMIUM
  npm run demo:login-case:desafio1 -- --scenario PRORATION --quality HIGH

Calidades:
  PREMIUM | HIGH | EXPLAINABLE | COMPARABLE | ANY

Qué hace:
  1. Resuelve el número de caso contra el índice local de cobertura.
  2. Recupera el mapping privado únicamente dentro del proceso CLI.
  3. Revalida COD_CLIENTE + NUM_ANEXO contra PLANTA y confirma facturación.
  4. Imprime la pareja para que el presentador la escriba manualmente en /login.

Seguridad:
  - No crea una sesión.
  - No expone credenciales mediante HTTP ni el Explorador web.
  - No escribe un archivo con los identificadores.
  - La salida contiene NUM_ANEXO completo: úsala solo en tu terminal local y no la publiques.
`);
}

function printResult(result) {
  const item = result.case;

  console.log('\n===================================================');
  console.log('  CASO DE COBERTURA · LOGIN DEL PRESENTADOR');
  console.log('===================================================');
  console.log(
    `Caso:              ${item.label}`
  );
  console.log(
    `Escenario:         ${item.scenario || 'Sin causa reconocida'}`
  );
  console.log(
    `Calidad:           ${item.qualityTier || 'Consultable'}`
  );
  console.log(
    `Evidencia:         ${item.evidenceLevel || 'No resuelta'}`
  );
  console.log(
    `Demo premium:      ${item.demoPremium ? 'Sí' : 'No'}`
  );
  console.log(
    `Comparable:        ${item.comparable ? 'Sí' : 'No'}`
  );
  console.log(
    `Recibos:           ${item.invoiceCount}`
  );
  console.log(
    `Renta:             ${item.rentType || 'No resuelta'}`
  );
  console.log(
    `Servicio:          ${[item.businessType, item.lobType].filter(Boolean).join(' · ') || 'No disponible'}`
  );

  if (
    item.coveragePercent !== null
  ) {
    console.log(
      `Conciliación:      ${item.coveragePercent.toFixed(2)}%`
    );
  }

  console.log('\n⚠ SOLO PARA LA TERMINAL LOCAL DEL PRESENTADOR');
  console.log(
    `COD_CLIENTE:       ${result.login.customerCode}`
  );
  console.log(
    `NUM_ANEXO:         ${result.login.serviceNumber}`
  );
  console.log('\nValidación:');
  console.log('  ✓ pareja exacta presente en PLANTA');
  console.log('  ✓ suscripción con facturación disponible');
  console.log('  ✓ el Explorador web no recibió estos identificadores');
  console.log('\nAbre /login e introduce manualmente esos dos valores.');
}

async function main() {
  const options =
    parseArgs(
      process.argv.slice(2)
    );

  if (options.help) {
    printHelp();
    return;
  }

  const service =
    createPresenterCaseService({
      coverageDbPath:
        options.coverageDbPath,
      dbPath:
        options.dbPath
    });

  const result =
    await service.resolveLogin({
      caseRef:
        options.caseRef,
      scenario:
        options.scenario,
      quality:
        options.quality
    });

  printResult(result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `\n❌ ${error.message}`
    );
    if (error.code) {
      console.error(
        `Código: ${error.code}`
      );
    }
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  printHelp,
  printResult
};
