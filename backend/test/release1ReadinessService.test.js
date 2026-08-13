const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectForbiddenKeys,
  collectInternalTerms,
  evaluateProfile,
  getDefaultLineage,
  createRelease1ReadinessService
} = require(
  '../services/release1ReadinessService'
);

function buildExperience({
  customerId = 'CLI000001',
  name = 'Carlos Mendoza',
  scenario = 'RECONNECTION',
  evidenceLevel = 'HIGH',
  rentType = 'RV',
  hasPreviousBill = true,
  includeBrainy = false,
  includeForbiddenKey = false,
  llmUsed = false
} = {}) {
  const isProration =
    scenario === 'PRORATION';

  const cause = {
    code: scenario,
    title:
      scenario === 'RECONNECTION'
        ? 'Cargo por reconexión'
        : scenario,
    description:
      includeBrainy
        ? 'Brainy confirma el cargo.'
        : 'El cargo está respaldado por los registros disponibles.',
    impact: 4.58,
    impactPresentation:
      'VARIATION',
    evidenceLevel
  };

  const finding = {
    code: 'PRORATION',
    title: 'Prorrateo',
    description:
      includeBrainy
        ? 'Brainy confirma el prorrateo.'
        : 'El importe proporcional ya está incluido en el total.',
    impact: 21.92,
    impactPresentation:
      'INCLUDED_IN_TOTAL',
    evidenceLevel
  };

  const experience = {
    schemaVersion:
      'desafio1-demo-experience-v1',
    dataSource:
      'DESAFIO1_OFFICIAL_LOCAL',
    customer: {
      customerId,
      name,
      plan: 'Plan demo',
      demoScenario: scenario,
      demoScenarioLabel:
        isProration
          ? 'Prorrateo'
          : 'Reconexión'
    },
    currentBill: {
      period: 'Ciclo 30/06/2026',
      total:
        isProration
          ? 51.83
          : 67.47,
      items: []
    },
    previousBill:
      hasPreviousBill
        ? {
            period:
              'Ciclo 30/05/2026',
            total: 62.89,
            items: []
          }
        : null,
    comparison:
      hasPreviousBill
        ? {
            difference: 4.58,
            percentage: 7.3,
            direction: 'UP',
            causes:
              isProration
                ? []
                : [cause]
          }
        : {
            difference: null,
            percentage: null,
            direction: null,
            causes: []
          },
    findings:
      isProration
        ? [finding]
        : [],
    financialExplanation: {
      status:
        hasPreviousBill
          ? 'FULLY_EXPLAINED'
          : 'NO_PREVIOUS_BILL',
      explainedNetAmount:
        hasPreviousBill
          ? 4.58
          : 0,
      unexplainedAmount: 0,
      coveragePercent:
        hasPreviousBill
          ? 100
          : 0,
      rentContext: {
        current: {
          resolved: true,
          rentType
        }
      },
      customerFacing: {
        headline:
          isProration
            ? 'Tu recibo incluye un prorrateo'
            : 'Tu recibo aumentó S/ 4.58',
        summary:
          includeBrainy
            ? 'Brainy confirma la explicación.'
            : 'Explicación orientada al cliente.'
      },
      safeguards: {
        llmUsedForFinancialReasoning:
          llmUsed
      }
    }
  };

  if (includeForbiddenKey) {
    experience.currentBill.subscriberKey =
      'SECRET_SUBSCRIBER';
  }

  return experience;
}

function buildConfig() {
  return {
    schemaVersion:
      'desafio1-demo-users-v1',
    dataLineage:
      Array.from(
        { length: 8 },
        (_, index) => ({
          datasetKey: `source_${index + 1}`,
          fileName: `source_${index + 1}.csv`,
          sha256:
            `${index + 1}`.repeat(64),
          importedRows: index + 1
        })
      )
  };
}

function buildDependencies({
  carlosExperience = buildExperience(),
  anaExperience = buildExperience({
    customerId: 'CLI000002',
    name: 'Ana Torres',
    scenario: 'PRORATION',
    rentType: 'RA',
    hasPreviousBill: false
  }),
  configured = true,
  config = buildConfig()
} = {}) {
  const profiles = [
    {
      customerId: 'CLI000001',
      name: 'Carlos Mendoza'
    },
    {
      customerId: 'CLI000002',
      name: 'Ana Torres'
    }
  ];

  const mappings = [
    {
      customerId: 'CLI000001',
      scenario: 'RECONNECTION',
      scenarioLabel: 'Reconexión',
      evidenceLevel: 'HIGH',
      rentType: 'RV'
    },
    {
      customerId: 'CLI000002',
      scenario: 'PRORATION',
      scenarioLabel: 'Prorrateo',
      evidenceLevel: 'HIGH',
      rentType: 'RA'
    }
  ];

  const experiences = {
    CLI000001: carlosExperience,
    CLI000002: anaExperience
  };

  return {
    officialDemoExperienceService: {
      async getExperienceForUser(
        user
      ) {
        return experiences[
          user.customerId
        ];
      }
    },
    mappingStatusProvider: () => ({
      configured,
      code:
        configured
          ? 'OK'
          : 'DEMO_MAPPING_NOT_CONFIGURED',
      profiles:
        configured
          ? mappings
          : []
    }),
    lineageProvider: async () =>
      configured
        ? config.dataLineage
        : [],
    demoProfilesProvider: () =>
      profiles,
    now: () =>
      new Date(
        '2026-08-13T02:00:00.000Z'
      )
  };
}

test(
  'detecta claves oficiales que no deben salir en el payload público',
  () => {
    const findings =
      collectForbiddenKeys({
        currentBill: {
          subscriberKey: '123'
        }
      });

    assert.deepEqual(
      findings,
      ['currentBill.subscriberKey']
    );
  }
);

test(
  'detecta nombres internos Brainy en textos visibles',
  () => {
    const findings =
      collectInternalTerms({
        summary:
          'Brainy confirma el monto'
      });

    assert.equal(
      findings.length,
      1
    );
    assert.equal(
      findings[0].path,
      'summary'
    );
  }
);

test(
  'un caso de reconexión HIGH totalmente explicado queda listo',
  () => {
    const result =
      evaluateProfile({
        profile: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        mapping: {
          scenario:
            'RECONNECTION',
          scenarioLabel:
            'Reconexión'
        },
        experience:
          buildExperience()
      });

    assert.equal(
      result.ready,
      true
    );
    assert.equal(
      result.checks
        .financiallyReconciled,
      true
    );
  }
);

test(
  'un primer recibo con prorrateo HIGH es válido sin inventar comparación',
  () => {
    const result =
      evaluateProfile({
        profile: {
          customerId:
            'CLI000002',
          name:
            'Ana Torres'
        },
        mapping: {
          scenario:
            'PRORATION',
          scenarioLabel:
            'Prorrateo'
        },
        experience:
          buildExperience({
            customerId:
              'CLI000002',
            name: 'Ana Torres',
            scenario:
              'PRORATION',
            rentType: 'RA',
            hasPreviousBill:
              false
          })
      });

    assert.equal(
      result.ready,
      true
    );
    assert.equal(
      result.financialStatus,
      'NO_PREVIOUS_BILL'
    );
  }
);

test(
  'evidencia MEDIUM impide marcar el perfil como listo',
  () => {
    const result =
      evaluateProfile({
        profile: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        mapping: {
          scenario:
            'RECONNECTION'
        },
        experience:
          buildExperience({
            evidenceLevel:
              'MEDIUM'
          })
      });

    assert.equal(
      result.ready,
      false
    );
    assert.equal(
      result.checks.evidenceHigh,
      false
    );
  }
);

test(
  'si el LLM participa en razonamiento financiero el perfil no pasa preflight',
  () => {
    const result =
      evaluateProfile({
        profile: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        mapping: {
          scenario:
            'RECONNECTION'
        },
        experience:
          buildExperience({
            llmUsed: true
          })
      });

    assert.equal(
      result.ready,
      false
    );
    assert.equal(
      result.checks
        .deterministicFinancialReasoning,
      false
    );
  }
);

test(
  'un término interno visible impide declarar listo el copy de cliente',
  () => {
    const result =
      evaluateProfile({
        profile: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        mapping: {
          scenario:
            'RECONNECTION'
        },
        experience:
          buildExperience({
            includeBrainy: true
          })
      });

    assert.equal(
      result.ready,
      false
    );
    assert.equal(
      result.checks
        .customerCopySafe,
      false
    );
  }
);

test(
  'una clave oficial filtrada impide declarar seguro el payload',
  () => {
    const result =
      evaluateProfile({
        profile: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        mapping: {
          scenario:
            'RECONNECTION'
        },
        experience:
          buildExperience({
            includeForbiddenKey:
              true
          })
      });

    assert.equal(
      result.ready,
      false
    );
    assert.equal(
      result.checks
        .publicPayloadSafe,
      false
    );
  }
);

test(
  'el reporte queda READY con dos perfiles, dos escenarios y ocho fuentes trazadas',
  async () => {
    const service =
      createRelease1ReadinessService(
        buildDependencies()
      );

    const report =
      await service.buildReport();

    assert.equal(
      report.ready,
      true
    );
    assert.equal(
      report.status,
      'READY'
    );
    assert.equal(
      report.summary.readyProfiles,
      2
    );
    assert.equal(
      report.summary.distinctScenarios,
      2
    );
    assert.equal(
      report.summary.lineageSources,
      8
    );
    assert.equal(
      report.profiles.length,
      2
    );
  }
);

test(
  'el reporte no expone subscriberKey, customerKey ni hashes del lineage',
  async () => {
    const service =
      createRelease1ReadinessService(
        buildDependencies()
      );

    const report =
      await service.buildReport();

    const serialized =
      JSON.stringify(report);

    assert.doesNotMatch(
      serialized,
      /subscriberKey|customerKey|sha256|SECRET_SUBSCRIBER/
    );
  }
);

test(
  'sin mapeo local el Release 1 queda en REVIEW_REQUIRED sin lanzar excepción',
  async () => {
    const service =
      createRelease1ReadinessService(
        buildDependencies({
          configured: false
        })
      );

    const report =
      await service.buildReport();

    assert.equal(
      report.ready,
      false
    );
    assert.equal(
      report.status,
      'REVIEW_REQUIRED'
    );
    assert.equal(
      report.summary.readyProfiles,
      0
    );
  }
);

test(
  'lineage incompleto bloquea el preflight aunque los casos financieros sean válidos',
  async () => {
    const config =
      buildConfig();

    config.dataLineage.pop();

    const service =
      createRelease1ReadinessService(
        buildDependencies({
          config
        })
      );

    const report =
      await service.buildReport();

    const lineageCheck =
      report.checks.find(
        (check) =>
          check.id ===
          'DATA_LINEAGE'
      );

    assert.equal(
      report.ready,
      false
    );
    assert.equal(
      lineageCheck.ok,
      false
    );
  }
);



test(
  'el lineage por defecto abre el repositorio antes de consultar metadata y lo cierra al terminar',
  async () => {
    const calls = [];
    const expected = [
      {
        datasetKey: 'PLANTA_CLIENTES',
        fileName: 'PLANTA CLIENTES.csv',
        sha256: 'abc',
        importedRows: 20000
      }
    ];

    const repository = {
      async open() {
        calls.push('open');
        return this;
      },
      async getImportMetadata() {
        calls.push('metadata');
        return expected;
      },
      async close() {
        calls.push('close');
      }
    };

    const rows =
      await getDefaultLineage(
        repository
      );

    assert.deepEqual(
      calls,
      ['open', 'metadata', 'close']
    );
    assert.deepEqual(
      rows,
      expected
    );
  }
);

test('cachea el preflight para no recalcular los dos casos en cada refresco del dashboard', async () => {
  let calls = 0;

  const deps = buildDependencies();
  const original =
    deps.officialDemoExperienceService;

  deps.officialDemoExperienceService = {
    async getExperienceForUser(user) {
      calls += 1;
      return original.getExperienceForUser(user);
    }
  };
  deps.cacheTtlMs = 30000;

  const service =
    createRelease1ReadinessService(deps);

  await service.buildReport();
  await service.buildReport();

  assert.equal(
    calls,
    2
  );
});

test(
  'Fase 8 mantiene el preflight R1 congelado en Carlos y Ana aunque existan perfiles extendidos',
  async () => {
    const calls = [];

    const profiles = [
      {
        customerId: 'CLI000001',
        name: 'Carlos Mendoza',
        release1Pitch: true
      },
      {
        customerId: 'CLI000002',
        name: 'Ana Torres',
        release1Pitch: true
      },
      {
        customerId: 'CLI000003',
        name: 'Luis Ramírez',
        release1Pitch: false
      },
      {
        customerId: 'CLI000004',
        name: 'María López',
        release1Pitch: false
      }
    ];

    const mappings = [
      {
        customerId: 'CLI000001',
        scenario: 'RECONNECTION',
        scenarioLabel: 'Reconexión',
        evidenceLevel: 'HIGH',
        rentType: 'RV'
      },
      {
        customerId: 'CLI000002',
        scenario: 'PRORATION',
        scenarioLabel: 'Prorrateo',
        evidenceLevel: 'HIGH',
        rentType: 'RA'
      },
      {
        customerId: 'CLI000003',
        scenario: 'DISCOUNT_ENDED',
        scenarioLabel: 'Fin de descuento',
        evidenceLevel: 'HIGH',
        rentType: 'RA'
      },
      {
        customerId: 'CLI000004',
        scenario: 'PLAN_CHANGE',
        scenarioLabel: 'Cambio de plan',
        evidenceLevel: 'HIGH',
        rentType: 'RA'
      }
    ];

    const experiences = {
      CLI000001:
        buildExperience(),
      CLI000002:
        buildExperience({
          customerId: 'CLI000002',
          name: 'Ana Torres',
          scenario: 'PRORATION',
          rentType: 'RA',
          hasPreviousBill: false
        })
    };

    const service =
      createRelease1ReadinessService({
        officialDemoExperienceService: {
          async getExperienceForUser(
            user
          ) {
            calls.push(
              user.customerId
            );
            return experiences[
              user.customerId
            ];
          }
        },
        mappingStatusProvider:
          () => ({
            configured: true,
            code: 'OK',
            profiles: mappings
          }),
        lineageProvider:
          async () =>
            buildConfig()
              .dataLineage,
        demoProfilesProvider:
          () => profiles,
        now: () =>
          new Date(
            '2026-08-13T02:00:00.000Z'
          ),
        cacheTtlMs: 0
      });

    const report =
      await service.buildReport();

    assert.equal(
      report.ready,
      true
    );
    assert.equal(
      report.summary.expectedProfiles,
      2
    );
    assert.equal(
      report.summary.availableDemoProfiles,
      4
    );
    assert.equal(
      report.summary.mappedDemoProfiles,
      4
    );
    assert.deepEqual(
      calls,
      [
        'CLI000001',
        'CLI000002'
      ]
    );
    assert.equal(
      report.profiles.length,
      2
    );
  }
);
