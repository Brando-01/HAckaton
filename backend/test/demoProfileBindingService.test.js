const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getDemoProfileDefinitions
} = require(
  '../config/demoProfiles'
);

const {
  validateBindingConfig,
  loadDemoProfileConfig,
  getDemoProfileBinding,
  getDemoMappingStatus
} = require(
  '../services/demoProfileBindingService'
);

const SCENARIOS = [
  'RECONNECTION',
  'PRORATION',
  'DISCOUNT_ENDED',
  'PLAN_CHANGE',
  'RECONNECTION',
  'PRORATION'
];

function validConfig({
  schemaVersion =
    'desafio1-demo-users-v2',
  profileCount = 6
} = {}) {
  const definitions =
    getDemoProfileDefinitions()
      .slice(0, profileCount);

  return {
    schemaVersion,
    generatedAt:
      '2026-08-13T00:00:00.000Z',
    profiles:
      definitions.map(
        (definition, index) => ({
          customerId:
            definition.customerId,
          subscriberKey:
            `SUB_${index + 1}`,
          scenario:
            SCENARIOS[index],
          scenarioLabel:
            `Escenario ${index + 1}`,
          score: 100,
          evidenceLevel: 'HIGH',
          rentType:
            index % 2 === 0
              ? 'RV'
              : 'RA'
        })
      ),
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
  'Fase 8 valida N perfiles demo versionados en lugar de asumir exactamente dos',
  () => {
    const result =
      validateBindingConfig(
        validConfig()
      );

    assert.equal(
      result.profiles.length,
      6
    );
    assert.deepEqual(
      result.profiles.map(
        (profile) =>
          profile.customerId
      ),
      [
        'CLI000001',
        'CLI000002',
        'CLI000003',
        'CLI000004',
        'CLI000005',
        'CLI000006'
      ]
    );
  }
);

test(
  'mantiene compatibilidad con el mapeo v1 de Carlos y Ana',
  () => {
    const legacy =
      validConfig({
        schemaVersion:
          'desafio1-demo-users-v1',
        profileCount: 2
      });

    const result =
      validateBindingConfig(
        legacy
      );

    assert.equal(
      result.profiles.length,
      2
    );
  }
);

test(
  'permite una configuración parcial N mientras conserve los dos perfiles de pitch',
  () => {
    const result =
      validateBindingConfig(
        validConfig({
          profileCount: 4
        })
      );

    assert.equal(
      result.profiles.length,
      4
    );
  }
);

test(
  'rechaza que dos perfiles apunten al mismo suscriptor',
  () => {
    const config =
      validConfig();

    config.profiles[5]
      .subscriberKey =
        config.profiles[0]
          .subscriberKey;

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
  'rechaza perfiles que no existen en el catálogo versionado de autenticación',
  () => {
    const config =
      validConfig();

    config.profiles.push({
      customerId: 'CLI999999',
      subscriberKey: 'SUB_X',
      scenario: 'RECONNECTION'
    });

    assert.throws(
      () =>
        validateBindingConfig(
          config
        ),
      (error) =>
        error.code ===
        'DEMO_MAPPING_CUSTOMER_INVALID'
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
  'los perfiles de pitch siguen siendo obligatorios aunque existan perfiles extendidos',
  () => {
    const config =
      validConfig();

    config.profiles =
      config.profiles.filter(
        (profile) =>
          profile.customerId !==
            'CLI000002'
      );

    assert.throws(
      () =>
        validateBindingConfig(
          config
        ),
      (error) =>
        error.code ===
        'DEMO_MAPPING_PROFILE_MISSING'
    );
  }
);

test(
  'carga el mapeo N desde un archivo local explícito',
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
      config.profiles.length,
      6
    );
    assert.equal(
      config.schemaVersion,
      'desafio1-demo-users-v2'
    );
  }
);

test(
  'resuelve cualquier perfil configurado a un único subscriberKey local',
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
        'CLI000006',
        { configPath }
      );

    assert.equal(
      binding.subscriberKey,
      'SUB_6'
    );
    assert.equal(
      binding.scenario,
      'PRORATION'
    );
  }
);

test(
  'el estado informa cuántos perfiles están mapeados y cuántos existen en el catálogo',
  (t) => {
    const {
      dir,
      configPath
    } =
      withTempConfig(
        validConfig({
          profileCount: 4
        })
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

    const status =
      getDemoMappingStatus({
        configPath
      });

    assert.equal(
      status.configured,
      true
    );
    assert.equal(
      status.profileCount,
      4
    );
    assert.equal(
      status.availableProfileCount,
      6
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
    assert.equal(
      status.availableProfileCount,
      6
    );
  }
);
