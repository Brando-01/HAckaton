const path = require('path');

const {
  DEFAULT_COVERAGE_DB_PATH,
  readCoverageMeta
} = require(
  '../services/datasetCoverageStore'
);

const {
  printSummary
} = require(
  './generarCoberturaDesafio1'
);

function parseArgs(argv) {
  const options = {
    dbPath:
      DEFAULT_COVERAGE_DB_PATH,
    json: false
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];

    if (arg === '--db') {
      options.dbPath =
        path.resolve(
          process.cwd(),
          argv[index + 1]
        );
      index += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
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

  return options;
}

function printHelp() {
  console.log(`
FASE 9 · Resumen del índice de cobertura

Uso:
  npm run demo:coverage:summary:desafio1
  npm run demo:coverage:summary:desafio1 -- --json
  npm run demo:coverage:summary:desafio1 -- --db ruta/local.db

No muestra subscriberKey ni customerKey; solo métricas agregadas.
`);
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

  const meta =
    await readCoverageMeta({
      dbPath: options.dbPath
    });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          schemaVersion:
            meta.schemaVersion,
          phase: meta.phase,
          generatedAt:
            meta.generatedAt,
          storedProfiles:
            meta.storedProfiles,
          summary: meta.summary,
          safeguards:
            meta.safeguards
        },
        null,
        2
      )
    );
    return;
  }

  printSummary(meta.summary);
  console.log(
    `\nPerfiles almacenados: ${Number(meta.storedProfiles).toLocaleString('es-PE')}`
  );
  console.log(
    `Generado: ${meta.generatedAt}`
  );
}

if (require.main === module) {
  main().catch(
    (error) => {
      console.error(
        `\n❌ ${error.message}`
      );
      process.exitCode = 1;
    }
  );
}

module.exports = {
  parseArgs
};
