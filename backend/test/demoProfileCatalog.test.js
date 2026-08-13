const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDemoProfileDefinitions,
  getDemoProfileDefinition,
  getRelease1PitchProfileIds,
  getConfiguredScenarioRequirements
} = require(
  '../config/demoProfiles'
);

test(
  'el catálogo de Fase 8 expone seis perfiles ficticios sin identificadores oficiales',
  () => {
    const profiles =
      getDemoProfileDefinitions();

    assert.equal(
      profiles.length,
      6
    );

    assert.equal(
      new Set(
        profiles.map(
          (profile) =>
            profile.customerId
        )
      ).size,
      profiles.length
    );

    assert.equal(
      new Set(
        profiles.map(
          (profile) =>
            profile.email
        )
      ).size,
      profiles.length
    );

    profiles.forEach(
      (profile) => {
        assert.equal(
          Object.hasOwn(
            profile,
            'subscriberKey'
          ),
          false
        );
        assert.equal(
          Object.hasOwn(
            profile,
            'customerKey'
          ),
          false
        );
      }
    );
  }
);

test(
  'Carlos y Ana siguen siendo exactamente los perfiles congelados del pitch R1',
  () => {
    assert.deepEqual(
      getRelease1PitchProfileIds(),
      [
        'CLI000001',
        'CLI000002'
      ]
    );
  }
);

test(
  'los perfiles extendidos cubren las cuatro causas financieras ya soportadas',
  () => {
    const scenarios =
      new Set(
        getDemoProfileDefinitions()
          .map(
            (profile) =>
              profile.scenario
          )
      );

    assert.deepEqual(
      Array.from(scenarios).sort(),
      [
        'DISCOUNT_ENDED',
        'PLAN_CHANGE',
        'PRORATION',
        'RECONNECTION'
      ]
    );
  }
);

test(
  'el catálogo declara dos candidatos para reconexión y prorrateo',
  () => {
    const requirements =
      getConfiguredScenarioRequirements();

    assert.equal(
      requirements.get(
        'RECONNECTION'
      ),
      2
    );
    assert.equal(
      requirements.get(
        'PRORATION'
      ),
      2
    );
    assert.equal(
      requirements.get(
        'DISCOUNT_ENDED'
      ),
      1
    );
    assert.equal(
      requirements.get(
        'PLAN_CHANGE'
      ),
      1
    );
  }
);

test(
  'buscar un perfil devuelve una copia y no permite mutar el catálogo',
  () => {
    const first =
      getDemoProfileDefinition(
        'CLI000003'
      );

    first.name = 'Mutado';

    const second =
      getDemoProfileDefinition(
        'CLI000003'
      );

    assert.equal(
      second.name,
      'Luis Ramírez'
    );
  }
);
