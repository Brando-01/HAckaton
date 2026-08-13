const fs = require('fs');
const path = require('path');

const {
  DEFAULT_DEMO_PROFILE_CONFIG_PATH
} = require(
  '../services/demoProfileBindingService'
);

const {
  getDemoProfileDefinitions,
  getConfiguredScenarioRequirements
} = require(
  '../config/demoProfiles'
);

const DEFAULT_SELECTION_REPORT =
  path.resolve(
    __dirname,
    '../data/demo-case-selection.local.json'
  );

const ALL_PROFILE_DEFINITIONS =
  getDemoProfileDefinitions();

function parseArgs(argv) {
  const options = {
    selectionPath:
      DEFAULT_SELECTION_REPORT,
    outputPath:
      DEFAULT_DEMO_PROFILE_CONFIG_PATH,
    pool: 2000,
    profileCount:
      ALL_PROFILE_DEFINITIONS.length,
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

    if (arg === '--profiles') {
      const requested =
        Number.parseInt(
          argv[index + 1],
          10
        );

      if (
        !Number.isInteger(
          requested
        ) ||
        requested < 2 ||
        requested >
          ALL_PROFILE_DEFINITIONS.length
      ) {
        throw new Error(
          `--profiles debe estar entre 2 y ${ALL_PROFILE_DEFINITIONS.length}.`
        );
      }

      options.profileCount =
        requested;
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
FASE 8 · Configuración local de perfiles demo 2 -> N

Uso:
  npm run demo:configure:desafio1
  npm run demo:configure:desafio1 -- --profiles 4
  npm run demo:configure:desafio1 -- --profiles 6 --force-rank

Perfiles versionados disponibles: ${ALL_PROFILE_DEFINITIONS.length}
Por defecto se configuran todos. Los dos primeros siguen reservados para
el pitch del Release 1; el resto amplía la cobertura funcional.

Los subscriberKey quedan únicamente en backend/data/demo-users.local.json,
archivo ignorado por Git. El código versionado conserva solo identidades
ficticias, escenario deseado y posición dentro del ranking.
`);
}

function getRequestedDefinitions(
  profileCount
) {
  return ALL_PROFILE_DEFINITIONS
    .slice(
      0,
      profileCount
    )
    .map(
      (profile) => ({
        ...profile
      })
    );
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

function getEligibleCandidates(
  report,
  scenario
) {
  return (
    report?.scenarios
      ?.[scenario]
      ?.top || []
  ).filter(
    (item) =>
      item?.eligible !== false &&
      item?.subscriberKey !== null &&
      item?.subscriberKey !== undefined
  );
}

function hasUsableScenarios(
  report,
  definitions
) {
  if (!report) {
    return false;
  }

  const requirements =
    getConfiguredScenarioRequirements(
      definitions
    );

  for (
    const [
      scenario,
      minimumCandidates
    ] of requirements
  ) {
    if (
      getEligibleCandidates(
        report,
        scenario
      ).length <
        minimumCandidates
    ) {
      return false;
    }
  }

  return true;
}

async function resolveSelectionReport(
  options,
  definitions
) {
  if (!options.forceRank) {
    const existing =
      readSelectionReport(
        options.selectionPath
      );

    if (
      hasUsableScenarios(
        existing,
        definitions
      )
    ) {
      return {
        report: existing,
        source:
          'LOCAL_SELECTION_REPORT'
      };
    }
  }

  const requirements =
    getConfiguredScenarioRequirements(
      definitions
    );

  const scenarios =
    Array.from(
      requirements.keys()
    );

  const rankingLimit =
    Math.max(
      5,
      ...requirements.values()
    );

  console.log(
    `🔎 El reporte local no cubre los ${scenarios.length} escenarios requeridos; recalculando ranking...`
  );

  // Carga diferida: consultar un reporte local o probar la lógica de
  // configuración no debería exigir sqlite3 ni abrir la base oficial.
  const {
    rankDemoCases
  } = require(
    '../services/demoCaseSelectionService'
  );

  const report =
    await rankDemoCases({
      scenarios,
      prefilterLimit:
        options.pool,
      limit: rankingLimit
    });

  return {
    report,
    source: 'LIVE_RANKING'
  };
}

function selectCandidate(
  report,
  definition,
  usedSubscriberKeys =
    new Set()
) {
  const candidates =
    getEligibleCandidates(
      report,
      definition.scenario
    );

  const desiredIndex =
    Math.max(
      0,
      Number.parseInt(
        definition.selectionRank,
        10
      ) - 1 || 0
    );

  const orderedCandidates = [
    ...candidates.slice(
      desiredIndex
    ),
    ...candidates.slice(
      0,
      desiredIndex
    )
  ];

  const candidate =
    orderedCandidates.find(
      (item) =>
        !usedSubscriberKeys.has(
          String(
            item.subscriberKey
          )
        )
    );

  if (!candidate) {
    throw new Error(
      `No se encontró un caso elegible y único para ${definition.name} (${definition.scenario}, rank ${definition.selectionRank}).`
    );
  }

  return candidate;
}

function buildProfile(
  definition,
  candidate
) {
  return {
    customerId:
      definition.customerId,
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

function buildDemoConfig({
  report,
  source,
  definitions
}) {
  const usedSubscriberKeys =
    new Set();

  const profiles =
    definitions.map(
      (definition) => {
        const candidate =
          selectCandidate(
            report,
            definition,
            usedSubscriberKeys
          );

        usedSubscriberKeys.add(
          String(
            candidate.subscriberKey
          )
        );

        return buildProfile(
          definition,
          candidate
        );
      }
    );

  return {
    schemaVersion:
      'desafio1-demo-users-v2',
    generatedAt:
      new Date().toISOString(),
    source,
    sourceSelectionVersion:
      report.selectionVersion ||
      null,
    sourceSelectionGeneratedAt:
      report.generatedAt || null,
    profiles,
    dataLineage:
      Array.isArray(
        report.dataLineage
      )
        ? report.dataLineage
        : []
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

  const definitions =
    getRequestedDefinitions(
      options.profileCount
    );

  const {
    report,
    source
  } =
    await resolveSelectionReport(
      options,
      definitions
    );

  const config =
    buildDemoConfig({
      report,
      source,
      definitions
    });

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
  console.log('  FASE 8 · PERFILES DEMO GENERALIZADOS');
  console.log('===================================================');
  console.log(
    `Fuente de selección: ${source}`
  );
  console.log(
    `Perfiles configurados: ${config.profiles.length}/${ALL_PROFILE_DEFINITIONS.length}`
  );

  definitions.forEach(
    (definition, index) => {
      const profile =
        config.profiles[index];
      const pitch =
        definition.release1Pitch
          ? ' · PITCH R1'
          : '';

      console.log(
        `${definition.name.padEnd(16)} -> ${profile.scenarioLabel || profile.scenario} · score ${profile.score}/100 · evidencia ${profile.evidenceLevel}${pitch}`
      );
    }
  );

  console.log(
    `\n💾 Mapeo local guardado en: ${options.outputPath}`
  );
  console.log(
    '🔒 El archivo contiene identificadores oficiales y está ignorado por Git.'
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `❌ ${error.message}`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  ALL_PROFILE_DEFINITIONS,
  parseArgs,
  getRequestedDefinitions,
  readSelectionReport,
  getEligibleCandidates,
  hasUsableScenarios,
  resolveSelectionReport,
  selectCandidate,
  buildProfile,
  buildDemoConfig,
  main
};
