const fs = require('fs');
const path = require('path');

const {
  createDemoCaseSelectionService
} = require(
  '../services/demoCaseSelectionService'
);

const {
  DEFAULT_SCENARIO_ORDER,
  normalizeScenarioCode
} = require(
  '../services/desafio1DemoSelectionLogic'
);

function parseArgs(argv) {
  const options = {
    scenarios: [],
    limit: 5,
    prefilterLimit: 300,
    json: false,
    write: false,
    outputPath: null
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];

    if (
      arg === '--scenario' ||
      arg === '-s'
    ) {
      const value =
        argv[index + 1];
      index += 1;

      const scenario =
        normalizeScenarioCode(
          value
        );

      if (!scenario) {
        throw new Error(
          `Escenario inválido: ${value}`
        );
      }

      options.scenarios.push(
        scenario
      );
      continue;
    }

    if (
      arg === '--limit' ||
      arg === '-n'
    ) {
      options.limit =
        Number.parseInt(
          argv[index + 1],
          10
        );
      index += 1;
      continue;
    }

    if (arg === '--pool') {
      options.prefilterLimit =
        Number.parseInt(
          argv[index + 1],
          10
        );
      index += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--write') {
      options.write = true;

      const next =
        argv[index + 1];

      if (
        next &&
        !next.startsWith('-')
      ) {
        options.outputPath = next;
        index += 1;
      }
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

  options.scenarios =
    options.scenarios.length
      ? Array.from(
          new Set(
            options.scenarios
          )
        )
      : [
          ...DEFAULT_SCENARIO_ORDER
        ];

  options.limit =
    Math.min(
      Math.max(
        Number.isFinite(
          options.limit
        )
          ? options.limit
          : 5,
        1
      ),
      20
    );

  options.prefilterLimit =
    Math.min(
      Math.max(
        Number.isFinite(
          options.prefilterLimit
        )
          ? options.prefilterLimit
          : 300,
        options.limit
      ),
      2000
    );

  return options;
}

function printHelp() {
  console.log(`
FASE 4 · Selector de casos demo del Desafío 1

Uso:
  npm run demo:rank:desafio1
  npm run demo:rank:desafio1 -- --scenario RECONNECTION
  npm run demo:rank:desafio1 -- --limit 3 --pool 500
  npm run demo:rank:desafio1 -- --json
  npm run demo:rank:desafio1 -- --write
  npm run demo:rank:desafio1 -- --write ruta/local.json

Escenarios:
  RECONNECTION
  DISCOUNT_ENDED
  PLAN_CHANGE
  PRORATION

Notas:
  --pool limita la preselección SQL por escenario.
  --write guarda un reporte LOCAL ignorado por Git por defecto.
  Esta fase no modifica Carlos/Ana ni crea cuentas de login.
`);
}

function signedMoney(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return 'N/A';
  }

  const amount = Number(value);
  const sign =
    amount > 0
      ? '+'
      : amount < 0
        ? '-'
        : '';

  return `${sign}S/ ${Math.abs(amount).toFixed(2)}`;
}

function printCandidate(
  candidate,
  index
) {
  console.log(
    `   #${index + 1} · score ${candidate.score}/100 · subscriber ${candidate.subscriberKey}`
  );
  console.log(
    `      ${candidate.businessType || 'N/A'} · ${candidate.lobType || 'N/A'} · ${candidate.status}`
  );

  if (
    candidate.difference !== null
  ) {
    console.log(
      `      Variación: ${signedMoney(candidate.difference)} · cobertura ${candidate.coveragePercent ?? 'N/A'}%`
    );
  } else {
    console.log(
      `      Recibo actual: ${signedMoney(candidate.currentTotal)} · sin recibo anterior comparable`
    );
  }

  console.log(
    `      ${candidate.primaryLabel || candidate.scenarioLabel} · evidencia ${candidate.evidenceLevel || 'N/A'}`
  );

  if (candidate.rentType) {
    console.log(
      `      Renta: ${candidate.rentType}`
    );
  }

  if (candidate.safeSummary) {
    console.log(
      `      ${candidate.safeSummary}`
    );
  }
}

function printReport(report) {
  console.log('\n===================================================');
  console.log('  FASE 4 · RANKING DE CASOS DEMO DESAFÍO 1');
  console.log('===================================================');
  console.log(
    `Pool máximo por escenario: ${report.configuration.prefilterLimit}`
  );
  console.log(
    `Top solicitado por escenario: ${report.configuration.topLimit}`
  );

  for (
    const [
      scenario,
      result
    ] of Object.entries(
      report.scenarios
    )
  ) {
    console.log(`\n${scenario}`);
    console.log(
      `   Preseleccionados: ${result.prefiltered} · evaluados: ${result.evaluated} · elegibles: ${result.eligible} · errores: ${result.errors.length}`
    );

    if (!result.top.length) {
      console.log(
        '   (sin casos elegibles con los criterios estrictos actuales)'
      );
      continue;
    }

    result.top.forEach(
      printCandidate
    );
  }

  console.log('\nℹ️ Los identificadores mostrados son para selección local.');
  console.log('   No los copies a código o documentación que vaya a un repositorio público.');
  console.log('   Fase 4 NO cambia los logins demo ni el frontend.');
}

async function main() {
  const options = parseArgs(
    process.argv.slice(2)
  );

  if (options.help) {
    printHelp();
    return;
  }

  const service =
    createDemoCaseSelectionService();

  const progressState =
    new Map();

  try {
    const report =
      await service.rankAll({
        scenarios:
          options.scenarios,
        prefilterLimit:
          options.prefilterLimit,
        limit:
          options.limit,
        onProgress: ({
          scenario,
          processed,
          total
        }) => {
          if (
            options.json ||
            total < 25
          ) {
            return;
          }

          const last =
            progressState.get(
              scenario
            ) || 0;

          if (
            processed === total ||
            processed - last >= 25
          ) {
            process.stderr.write(
              `\r${scenario}: ${processed}/${total}`
            );
            progressState.set(
              scenario,
              processed
            );

            if (
              processed === total
            ) {
              process.stderr.write(
                '\n'
              );
            }
          }
        }
      });

    if (options.write) {
      const outputPath =
        path.resolve(
          options.outputPath ||
          path.join(
            __dirname,
            '../data/demo-case-selection.local.json'
          )
        );

      fs.mkdirSync(
        path.dirname(outputPath),
        {
          recursive: true
        }
      );

      fs.writeFileSync(
        outputPath,
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
      );

      if (!options.json) {
        console.log(
          `\n💾 Reporte local guardado en: ${outputPath}`
        );
      }
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          report,
          null,
          2
        )
      );
    } else {
      printReport(report);
    }
  } finally {
    await service.close();
  }
}

main().catch((error) => {
  console.error(
    `\n❌ ${error.message}`
  );

  if (error.code) {
    console.error(
      `   Código: ${error.code}`
    );
  }

  process.exitCode = 1;
});
