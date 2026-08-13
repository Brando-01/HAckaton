const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALL_PROFILE_DEFINITIONS,
  parseArgs,
  getRequestedDefinitions,
  hasUsableScenarios,
  buildDemoConfig
} = require(
  '../scripts/configurarDemoDesafio1'
);

function candidate(
  scenario,
  index
) {
  const labels = {
    RECONNECTION: 'Reconexión',
    PRORATION: 'Prorrateo',
    DISCOUNT_ENDED:
      'Fin de descuento',
    PLAN_CHANGE:
      'Cambio de plan'
  };

  return {
    subscriberKey:
      `${scenario}_SUB_${index}`,
    scenario,
    scenarioLabel:
      labels[scenario],
    score: 100 - index,
    evidenceLevel: 'HIGH',
    rentType:
      scenario === 'PRORATION'
        ? 'RA'
        : 'RV',
    eligible: true
  };
}

function rankingReport() {
  return {
    selectionVersion:
      'desafio1-demo-selection-v1',
    generatedAt:
      '2026-08-13T00:00:00.000Z',
    scenarios: {
      RECONNECTION: {
        top: [
          candidate(
            'RECONNECTION',
            1
          ),
          candidate(
            'RECONNECTION',
            2
          )
        ]
      },
      PRORATION: {
        top: [
          candidate(
            'PRORATION',
            1
          ),
          candidate(
            'PRORATION',
            2
          )
        ]
      },
      DISCOUNT_ENDED: {
        top: [
          candidate(
            'DISCOUNT_ENDED',
            1
          )
        ]
      },
      PLAN_CHANGE: {
        top: [
          candidate(
            'PLAN_CHANGE',
            1
          )
        ]
      }
    },
    dataLineage: [
      {
        datasetKey:
          'clientes',
        fileName:
          'PLANTA CLIENTES.csv',
        sha256: 'abc',
        importedRows: 20000
      }
    ]
  };
}

test(
  'por defecto el configurador prepara todos los perfiles versionados',
  () => {
    const options =
      parseArgs([]);

    assert.equal(
      options.profileCount,
      ALL_PROFILE_DEFINITIONS.length
    );
    assert.equal(
      options.profileCount,
      6
    );
  }
);

test(
  '--profiles permite reducir la demo sin volver a hardcodear Carlos y Ana en el script',
  () => {
    const options =
      parseArgs([
        '--profiles',
        '4'
      ]);

    const definitions =
      getRequestedDefinitions(
        options.profileCount
      );

    assert.equal(
      definitions.length,
      4
    );
    assert.deepEqual(
      definitions.map(
        (profile) =>
          profile.customerId
      ),
      [
        'CLI000001',
        'CLI000002',
        'CLI000003',
        'CLI000004'
      ]
    );
  }
);

test(
  '--profiles no permite eliminar los dos perfiles congelados del pitch ni pedir más que el catálogo',
  () => {
    assert.throws(
      () =>
        parseArgs([
          '--profiles',
          '1'
        ]),
      /entre 2 y 6/
    );

    assert.throws(
      () =>
        parseArgs([
          '--profiles',
          '7'
        ]),
      /entre 2 y 6/
    );
  }
);

test(
  'el reporte local solo se considera utilizable si cubre el rank requerido por todos los perfiles',
  () => {
    const report =
      rankingReport();

    assert.equal(
      hasUsableScenarios(
        report,
        ALL_PROFILE_DEFINITIONS
      ),
      true
    );

    report.scenarios.PRORATION
      .top =
        report.scenarios.PRORATION
          .top.slice(0, 1);

    assert.equal(
      hasUsableScenarios(
        report,
        ALL_PROFILE_DEFINITIONS
      ),
      false
    );
  }
);

test(
  'buildDemoConfig genera seis bindings únicos y conserva Carlos/Ana como los primeros casos',
  () => {
    const config =
      buildDemoConfig({
        report:
          rankingReport(),
        source:
          'UNIT_TEST',
        definitions:
          ALL_PROFILE_DEFINITIONS
      });

    assert.equal(
      config.schemaVersion,
      'desafio1-demo-users-v2'
    );
    assert.equal(
      config.profiles.length,
      6
    );
    assert.equal(
      new Set(
        config.profiles.map(
          (profile) =>
            profile.subscriberKey
        )
      ).size,
      6
    );
    assert.equal(
      config.profiles[0].scenario,
      'RECONNECTION'
    );
    assert.equal(
      config.profiles[1].scenario,
      'PRORATION'
    );
    assert.equal(
      config.profiles[2].scenario,
      'DISCOUNT_ENDED'
    );
    assert.equal(
      config.profiles[3].scenario,
      'PLAN_CHANGE'
    );
  }
);

test(
  'los perfiles repetidos por escenario usan candidatos distintos del ranking',
  () => {
    const config =
      buildDemoConfig({
        report:
          rankingReport(),
        source:
          'UNIT_TEST',
        definitions:
          ALL_PROFILE_DEFINITIONS
      });

    assert.notEqual(
      config.profiles[0]
        .subscriberKey,
      config.profiles[4]
        .subscriberKey
    );
    assert.notEqual(
      config.profiles[1]
        .subscriberKey,
      config.profiles[5]
        .subscriberKey
    );
  }
);
