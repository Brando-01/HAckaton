const fs = require('fs');
const path = require('path');

const {
  rankDemoCases
} = require(
  '../services/demoCaseSelectionService'
);

const {
  DEFAULT_DEMO_PROFILE_CONFIG_PATH
} = require(
  '../services/demoProfileBindingService'
);

const DEFAULT_SELECTION_REPORT =
  path.resolve(
    __dirname,
    '../data/demo-case-selection.local.json'
  );

function parseArgs(argv) {
  const options = {
    selectionPath:
      DEFAULT_SELECTION_REPORT,
    outputPath:
      DEFAULT_DEMO_PROFILE_CONFIG_PATH,
    pool: 2000,
    forceRank: false
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];

    if (
      arg === '--selection'
    ) {
      options.selectionPath =
        path.resolve(
          process.cwd(),
          argv[index + 1]
        );
      index += 1;
      continue;
    }

    if (arg === '--output') {
      options.outputPath =
        path.resolve(
          process.cwd(),
          argv[index + 1]
        );
      index += 1;
      continue;
    }

    if (arg === '--pool') {
      options.pool =
        Math.min(
          Math.max(
            Number.parseInt(
              argv[index + 1],
              10
            ) || 2000,
            1
          ),
          2000
        );
      index += 1;
      continue;
    }

    if (arg === '--force-rank') {
      options.forceRank = true;
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
FASE 5 · Configuración local de Carlos y Ana

Uso:
  npm run demo:configure:desafio1
  npm run demo:configure:desafio1 -- --force-rank

Comportamiento:
  Carlos (CLI000001) -> mejor caso RECONNECTION
  Ana    (CLI000002) -> mejor caso PRORATION

Los subscriberKey quedan únicamente en backend/data/demo-users.local.json,
archivo ignorado por Git. El código versionado conserva solo los alias demo.
`);
}

function readSelectionReport(
  filePath
) {
  if (
    !fs.existsSync(filePath)
  ) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        'utf8'
      )
    );
  } catch (error) {
    return null;
  }
}

function hasUsableScenarios(
  report
) {
  return Boolean(
    report?.scenarios
      ?.RECONNECTION
      ?.top?.[0] &&
    report?.scenarios
      ?.PRORATION
      ?.top?.[0]
  );
}

async function resolveSelectionReport(
  options
) {
  if (!options.forceRank) {
    const existing =
      readSelectionReport(
        options.selectionPath
      );

    if (
      hasUsableScenarios(
        existing
      )
    ) {
      return {
        report: existing,
        source:
          'LOCAL_SELECTION_REPORT'
      };
    }
  }

  console.log(
    '🔎 El reporte local no contiene ambos escenarios; recalculando RECONNECTION y PRORATION...'
  );

  const report =
    await rankDemoCases({
      scenarios: [
        'RECONNECTION',
        'PRORATION'
      ],
      prefilterLimit:
        options.pool,
      limit: 5
    });

  return {
    report,
    source: 'LIVE_RANKING'
  };
}

function selectTopCandidate(
  report,
  scenario
) {
  const candidate =
    report?.scenarios
      ?.[scenario]
      ?.top?.find(
        (item) =>
          item?.eligible !== false
      );

  if (!candidate) {
    throw new Error(
      `No se encontró un caso elegible para ${scenario}.`
    );
  }

  return candidate;
}

function buildProfile(
  customerId,
  candidate
) {
  return {
    customerId,
    subscriberKey:
      String(
        candidate.subscriberKey
      ),
    scenario:
      candidate.scenario,
    scenarioLabel:
      candidate.scenarioLabel,
    score:
      candidate.score,
    evidenceLevel:
      candidate.evidenceLevel,
    rentType:
      candidate.rentType
  };
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

  const {
    report,
    source
  } =
    await resolveSelectionReport(
      options
    );

  const carlos =
    selectTopCandidate(
      report,
      'RECONNECTION'
    );

  const ana =
    selectTopCandidate(
      report,
      'PRORATION'
    );

  const config = {
    schemaVersion:
      'desafio1-demo-users-v1',
    generatedAt:
      new Date().toISOString(),
    source:
      source,
    sourceSelectionVersion:
      report.selectionVersion ||
      null,
    sourceSelectionGeneratedAt:
      report.generatedAt || null,
    profiles: [
      buildProfile(
        'CLI000001',
        carlos
      ),
      buildProfile(
        'CLI000002',
        ana
      )
    ],
    dataLineage:
      Array.isArray(
        report.dataLineage
      )
        ? report.dataLineage
        : []
  };

  fs.mkdirSync(
    path.dirname(
      options.outputPath
    ),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    options.outputPath,
    JSON.stringify(
      config,
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log('\n===================================================');
  console.log('  FASE 5 · PERFILES DEMO CONFIGURADOS');
  console.log('===================================================');
  console.log(
    `Fuente de selección: ${source}`
  );
  console.log(
    `Carlos -> ${carlos.scenarioLabel} · score ${carlos.score}/100 · evidencia ${carlos.evidenceLevel}`
  );
  console.log(
    `Ana    -> ${ana.scenarioLabel} · score ${ana.score}/100 · evidencia ${ana.evidenceLevel}`
  );
  console.log(
    `\n💾 Mapeo local guardado en: ${options.outputPath}`
  );
  console.log(
    '🔒 El archivo contiene identificadores oficiales y está ignorado por Git.'
  );
}

main().catch((error) => {
  console.error(
    `❌ ${error.message}`
  );
  process.exitCode = 1;
});
