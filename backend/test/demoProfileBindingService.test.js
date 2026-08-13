const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  validateBindingConfig,
  loadDemoProfileConfig,
  getDemoProfileBinding,
  getDemoMappingStatus
} = require(
  '../services/demoProfileBindingService'
);

function validConfig() {
  return {
    schemaVersion:
      'desafio1-demo-users-v1',
    generatedAt:
      '2026-08-13T00:00:00.000Z',
    profiles: [
      {
        customerId:
          'CLI000001',
        subscriberKey:
          'SUB_A',
        scenario:
          'RECONNECTION',
        scenarioLabel:
          'Reconexión',
        score: 100,
        evidenceLevel: 'HIGH',
        rentType: 'RV'
      },
      {
        customerId:
          'CLI000002',
        subscriberKey:
          'SUB_B',
        scenario:
          'PRORATION',
        scenarioLabel:
          'Prorrateo',
        score: 100,
        evidenceLevel: 'HIGH',
        rentType: 'RA'
      }
    ],
    dataLineage: []
  };
}

function withTempConfig(config) {
  const dir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'd1-demo-binding-'
      )
    );

  const configPath =
    path.join(
      dir,
      'demo-users.local.json'
    );

  fs.writeFileSync(
    configPath,
    JSON.stringify(config),
    'utf8'
  );

  return {
    dir,
    configPath
  };
}

test(
  'valida exactamente los alias Carlos y Ana sin convertirlos en 20 mil logins',
  () => {
    const result =
      validateBindingConfig(
        validConfig()
      );

    assert.equal(
      result.profiles.length,
      2
    );
    assert.equal(
      result.profiles[0]
        .customerId,
      'CLI000001'
    );
    assert.equal(
      result.profiles[1]
        .customerId,
      'CLI000002'
    );
  }
);

test(
  'rechaza que Carlos y Ana apunten al mismo suscriptor',
  () => {
    const config =
      validConfig();

    config.profiles[1]
      .subscriberKey =
        'SUB_A';

    assert.throws(
      () =>
        validateBindingConfig(
          config
        ),
      (error) =>
        error.code ===
        'DEMO_MAPPING_SUBSCRIBER_DUPLICATED'
    );
  }
);

test(
  'rechaza escenarios que no pertenezcan a la Fase 4',
  () => {
    const config =
      validConfig();

    config.profiles[0]
      .scenario =
        'ROAMING_FAKE';

    assert.throws(
      () =>
        validateBindingConfig(
          config
        ),
      (error) =>
        error.code ===
        'DEMO_MAPPING_SCENARIO_INVALID'
    );
  }
);

test(
  'carga el mapeo desde un archivo local explícito',
  (t) => {
    const {
      dir,
      configPath
    } =
      withTempConfig(
        validConfig()
      );

    t.after(
      () =>
        fs.rmSync(
          dir,
          {
            recursive: true,
            force: true
          }
        )
    );

    const config =
      loadDemoProfileConfig({
        configPath
      });

    assert.equal(
      config.profiles[0]
        .scenario,
      'RECONNECTION'
    );
  }
);

test(
  'resuelve un alias demo a un solo subscriberKey local',
  (t) => {
    const {
      dir,
      configPath
    } =
      withTempConfig(
        validConfig()
      );

    t.after(
      () =>
        fs.rmSync(
          dir,
          {
            recursive: true,
            force: true
          }
        )
    );

    const binding =
      getDemoProfileBinding(
        'CLI000002',
        { configPath }
      );

    assert.equal(
      binding.subscriberKey,
      'SUB_B'
    );
    assert.equal(
      binding.scenario,
      'PRORATION'
    );
  }
);

test(
  'un archivo ausente se reporta como configuración local pendiente',
  () => {
    const status =
      getDemoMappingStatus({
        configPath:
          path.join(
            os.tmpdir(),
            `missing-${Date.now()}.json`
          )
      });

    assert.equal(
      status.configured,
      false
    );
    assert.equal(
      status.code,
      'DEMO_MAPPING_NOT_CONFIGURED'
    );
  }
);
