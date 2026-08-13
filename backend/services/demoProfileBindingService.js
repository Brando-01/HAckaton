const fs = require('fs');
const path = require('path');

const DEFAULT_DEMO_PROFILE_CONFIG_PATH =
  path.resolve(
    __dirname,
    '../data/demo-users.local.json'
  );

const EXPECTED_PROFILE_IDS =
  new Set([
    'CLI000001',
    'CLI000002'
  ]);

const ALLOWED_SCENARIOS =
  new Set([
    'RECONNECTION',
    'DISCOUNT_ENDED',
    'PLAN_CHANGE',
    'PRORATION'
  ]);

class DemoProfileBindingError
  extends Error {
  constructor(
    code,
    message
  ) {
    super(message);
    this.name =
      'DemoProfileBindingError';
    this.code = code;
  }
}

function normalizeIdentifier(value) {
  const normalized =
    String(value ?? '')
      .trim();

  return normalized || null;
}

function normalizeScenario(value) {
  const normalized =
    String(value ?? '')
      .trim()
      .toUpperCase();

  return ALLOWED_SCENARIOS.has(
    normalized
  )
    ? normalized
    : null;
}

function validateBindingConfig(
  rawConfig
) {
  if (
    !rawConfig ||
    typeof rawConfig !== 'object'
  ) {
    throw new DemoProfileBindingError(
      'DEMO_MAPPING_INVALID',
      'La configuración local de usuarios demo no es un objeto válido.'
    );
  }

  if (
    rawConfig.schemaVersion !==
      'desafio1-demo-users-v1'
  ) {
    throw new DemoProfileBindingError(
      'DEMO_MAPPING_SCHEMA_INVALID',
      'La configuración local de usuarios demo tiene una versión no soportada.'
    );
  }

  if (
    !Array.isArray(
      rawConfig.profiles
    )
  ) {
    throw new DemoProfileBindingError(
      'DEMO_MAPPING_PROFILES_REQUIRED',
      'La configuración local debe incluir profiles[].'
    );
  }

  const profileIds = new Set();
  const subscriberKeys =
    new Set();

  const profiles =
    rawConfig.profiles.map(
      (profile) => {
        const customerId =
          normalizeIdentifier(
            profile?.customerId
          );

        const subscriberKey =
          normalizeIdentifier(
            profile?.subscriberKey
          );

        const scenario =
          normalizeScenario(
            profile?.scenario
          );

        if (
          !customerId ||
          !EXPECTED_PROFILE_IDS.has(
            customerId
          )
        ) {
          throw new DemoProfileBindingError(
            'DEMO_MAPPING_CUSTOMER_INVALID',
            `Perfil demo no soportado: ${customerId || 'vacío'}`
          );
        }

        if (!subscriberKey) {
          throw new DemoProfileBindingError(
            'DEMO_MAPPING_SUBSCRIBER_REQUIRED',
            `El perfil ${customerId} no tiene subscriberKey.`
          );
        }

        if (!scenario) {
          throw new DemoProfileBindingError(
            'DEMO_MAPPING_SCENARIO_INVALID',
            `El perfil ${customerId} tiene un escenario no soportado.`
          );
        }

        if (
          profileIds.has(
            customerId
          )
        ) {
          throw new DemoProfileBindingError(
            'DEMO_MAPPING_CUSTOMER_DUPLICATED',
            `El perfil ${customerId} está repetido.`
          );
        }

        if (
          subscriberKeys.has(
            subscriberKey
          )
        ) {
          throw new DemoProfileBindingError(
            'DEMO_MAPPING_SUBSCRIBER_DUPLICATED',
            'Carlos y Ana no deben apuntar al mismo suscriptor oficial.'
          );
        }

        profileIds.add(customerId);
        subscriberKeys.add(
          subscriberKey
        );

        return {
          customerId,
          subscriberKey,
          scenario,
          scenarioLabel:
            normalizeIdentifier(
              profile?.scenarioLabel
            ),
          score:
            Number.isFinite(
              Number(profile?.score)
            )
              ? Number(profile.score)
              : null,
          evidenceLevel:
            normalizeIdentifier(
              profile?.evidenceLevel
            ),
          rentType:
            normalizeIdentifier(
              profile?.rentType
            )
        };
      }
    );

  for (
    const expectedId of
      EXPECTED_PROFILE_IDS
  ) {
    if (
      !profileIds.has(
        expectedId
      )
    ) {
      throw new DemoProfileBindingError(
        'DEMO_MAPPING_PROFILE_MISSING',
        `Falta el perfil demo ${expectedId}.`
      );
    }
  }

  return {
    schemaVersion:
      rawConfig.schemaVersion,
    generatedAt:
      normalizeIdentifier(
        rawConfig.generatedAt
      ),
    sourceSelectionVersion:
      normalizeIdentifier(
        rawConfig.sourceSelectionVersion
      ),
    sourceSelectionGeneratedAt:
      normalizeIdentifier(
        rawConfig.sourceSelectionGeneratedAt
      ),
    profiles,
    dataLineage:
      Array.isArray(
        rawConfig.dataLineage
      )
        ? rawConfig.dataLineage.map(
            (entry) => ({
              datasetKey:
                normalizeIdentifier(
                  entry?.datasetKey
                ),
              fileName:
                normalizeIdentifier(
                  entry?.fileName
                ),
              sha256:
                normalizeIdentifier(
                  entry?.sha256
                ),
              importedRows:
                Number.isFinite(
                  Number(
                    entry?.importedRows
                  )
                )
                  ? Number(
                      entry.importedRows
                    )
                  : null
            })
          )
        : []
  };
}

function loadDemoProfileConfig({
  configPath =
    DEFAULT_DEMO_PROFILE_CONFIG_PATH,
  required = true
} = {}) {
  if (
    !fs.existsSync(
      configPath
    )
  ) {
    if (!required) {
      return null;
    }

    throw new DemoProfileBindingError(
      'DEMO_MAPPING_NOT_CONFIGURED',
      'Falta backend/data/demo-users.local.json. Ejecuta npm run demo:configure:desafio1.'
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(
      fs.readFileSync(
        configPath,
        'utf8'
      )
    );
  } catch (error) {
    throw new DemoProfileBindingError(
      'DEMO_MAPPING_READ_ERROR',
      `No se pudo leer la configuración local de usuarios demo: ${error.message}`
    );
  }

  return validateBindingConfig(
    parsed
  );
}

function getDemoProfileBinding(
  customerId,
  options = {}
) {
  const id =
    normalizeIdentifier(
      customerId
    );

  if (!id) {
    return null;
  }

  const config =
    loadDemoProfileConfig(
      options
    );

  return (
    config.profiles.find(
      (profile) =>
        profile.customerId === id
    ) || null
  );
}

function getDemoMappingStatus(
  options = {}
) {
  try {
    const config =
      loadDemoProfileConfig({
        ...options,
        required: false
      });

    if (!config) {
      return {
        configured: false,
        code:
          'DEMO_MAPPING_NOT_CONFIGURED',
        profiles: []
      };
    }

    return {
      configured: true,
      code: 'OK',
      generatedAt:
        config.generatedAt,
      profiles:
        config.profiles.map(
          (profile) => ({
            customerId:
              profile.customerId,
            scenario:
              profile.scenario,
            scenarioLabel:
              profile.scenarioLabel,
            evidenceLevel:
              profile.evidenceLevel,
            rentType:
              profile.rentType
          })
        )
    };
  } catch (error) {
    return {
      configured: false,
      code:
        error?.code ||
        'DEMO_MAPPING_INVALID',
      error:
        error?.message ||
        String(error),
      profiles: []
    };
  }
}

module.exports = {
  DEFAULT_DEMO_PROFILE_CONFIG_PATH,
  EXPECTED_PROFILE_IDS,
  ALLOWED_SCENARIOS,
  DemoProfileBindingError,
  validateBindingConfig,
  loadDemoProfileConfig,
  getDemoProfileBinding,
  getDemoMappingStatus
};
