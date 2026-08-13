const {
  createRelease1ReadinessService
} = require(
  '../services/release1ReadinessService'
);

function hasArg(name) {
  return process.argv.includes(name);
}

function symbol(ok) {
  return ok ? '✅' : '❌';
}

async function main() {
  const service =
    createRelease1ReadinessService();

  const report =
    await service.buildReport();

  if (hasArg('--json')) {
    process.stdout.write(
      `${JSON.stringify(report, null, 2)}\n`
    );
  } else {
    console.log(
      '\n==================================================='
    );
    console.log(
      '  RELEASE 1 · PREFLIGHT DESAFÍO 1'
    );
    console.log(
      '==================================================='
    );

    console.log(
      `${report.ready ? '✅' : '⚠️'} Estado: ${report.status}`
    );
    console.log(
      `Perfiles: ${report.summary.readyProfiles}/${report.summary.expectedProfiles}`
    );
    console.log(
      `Escenarios: ${(report.summary.scenarios || []).join(' · ') || '—'}`
    );
    console.log(
      `Fuentes trazadas: ${report.summary.lineageSources}/${report.summary.expectedLineageSources}`
    );

    console.log('\nControles:');

    report.checks.forEach(
      (check) => {
        console.log(
          `${symbol(check.ok)} ${check.label}`
        );
        console.log(
          `   ${check.detail}`
        );
      }
    );

    console.log('\nPerfiles demo:');

    report.profiles.forEach(
      (profile) => {
        console.log(
          `${symbol(profile.ready)} ${profile.name || profile.customerId} · ${profile.scenarioLabel || profile.scenario || 'sin escenario'} · ${profile.evidenceLevel || 'sin evidencia'}`
        );
      }
    );

    if (report.ready) {
      console.log(
        '\n🎉 Release 1 listo para el smoke test.'
      );
      console.log(
        '   Siguiente: npm run demo:smoke:desafio1'
      );
    } else {
      console.log(
        '\n⚠️ Revisa los controles fallidos antes de presentar.'
      );
    }
  }

  process.exitCode =
    report.ready ? 0 : 1;
}

main().catch(
  (error) => {
    console.error(
      '\n❌ No se pudo ejecutar el preflight:',
      error?.message || error
    );
    process.exitCode = 1;
  }
);
