const {
  getDemoProfiles
} = require(
  '../services/authService'
);

const {
  getDemoMappingStatus
} = require(
  '../services/demoProfileBindingService'
);

function buildRows() {
  const profiles =
    getDemoProfiles();

  const mappingStatus =
    getDemoMappingStatus();

  return profiles.map(
    (profile) => {
      const mapping =
        mappingStatus.profiles
          ?.find(
            (item) =>
              item.customerId ===
                profile.customerId
          );

      return {
        customerId:
          profile.customerId,
        name:
          profile.name,
        email:
          profile.email,
        group:
          profile.release1Pitch
            ? 'PITCH R1'
            : 'COBERTURA',
        scenario:
          mapping?.scenarioLabel ||
          mapping?.scenario ||
          'Pendiente de mapeo',
        ready:
          Boolean(mapping)
      };
    }
  );
}

function main() {
  const rows = buildRows();
  const ready =
    rows.filter(
      (row) => row.ready
    ).length;

  console.log('\n===================================================');
  console.log('  FASE 8 · PERFILES DEMO DISPONIBLES');
  console.log('===================================================');
  console.log(
    `Mapeados con datos oficiales: ${ready}/${rows.length}`
  );
  console.log(
    'Los identificadores oficiales permanecen en el archivo local ignorado por Git.\n'
  );

  rows.forEach(
    (row) => {
      const state =
        row.ready
          ? '✅'
          : '⚠️';

      console.log(
        `${state} ${row.customerId} · ${row.name} · ${row.group}`
      );
      console.log(
        `   ${row.scenario} · ${row.email}`
      );
    }
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRows,
  main
};
