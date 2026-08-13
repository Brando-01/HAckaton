const {
  createOfficialDemoExperienceService
} = require('./officialDemoExperienceService');

const {
  getDemoMappingStatus
} = require('./demoProfileBindingService');

const {
  getDemoProfiles
} = require('./authService');

const EXPECTED_SOURCE_COUNT = 8;

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'subscriberKey',
  'subscriberKeys',
  'customerKey',
  'financialAccount',
  'billingArrangement',
  'sourceRow',
  'sourceRows',
  'sha256',
  'dataLineage'
]);

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function normalizeScenario(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function collectForbiddenKeys(
  value,
  path = [],
  findings = []
) {
  if (
    value === null ||
    value === undefined
  ) {
    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach(
      (item, index) => {
        collectForbiddenKeys(
          item,
          [...path, String(index)],
          findings
        );
      }
    );

    return findings;
  }

  if (typeof value !== 'object') {
    return findings;
  }

  Object.entries(value).forEach(
    ([key, child]) => {
      if (
        FORBIDDEN_PUBLIC_KEYS.has(
          key
        )
      ) {
        findings.push(
          [...path, key].join('.')
        );
      }

      collectForbiddenKeys(
        child,
        [...path, key],
        findings
      );
    }
  );

  return findings;
}

function collectInternalTerms(
  value,
  path = [],
  findings = []
) {
  if (
    value === null ||
    value === undefined
  ) {
    return findings;
  }

  if (typeof value === 'string') {
    if (
      /\bbrainy\b/i.test(value)
    ) {
      findings.push({
        path: path.join('.'),
        term: 'Brainy'
      });
    }

    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach(
      (item, index) => {
        collectInternalTerms(
          item,
          [...path, String(index)],
          findings
        );
      }
    );

    return findings;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(
      ([key, child]) => {
        collectInternalTerms(
          child,
          [...path, key],
          findings
        );
      }
    );
  }

  return findings;
}

function getScenarioEvidence(
  experience,
  scenario
) {
  const normalized =
    normalizeScenario(scenario);

  if (normalized === 'PRORATION') {
    return (
      experience?.findings || []
    ).find(
      (finding) =>
        finding?.code ===
        'PRORATION'
    ) || null;
  }

  return (
    experience?.comparison
      ?.causes || []
  ).find(
    (cause) =>
      cause?.code === normalized
  ) || null;
}

function evaluateProfile({
  profile,
  mapping,
  experience
}) {
  const scenario =
    mapping?.scenario ||
    experience?.customer
      ?.demoScenario ||
    null;

  const scenarioEvidence =
    getScenarioEvidence(
      experience,
      scenario
    );

  const evidenceHigh =
    scenarioEvidence
      ?.evidenceLevel === 'HIGH';

  const officialData =
    experience?.dataSource ===
      'DESAFIO1_OFFICIAL_LOCAL';

  const scenarioConsistent =
    Boolean(
      scenario &&
      experience?.customer
        ?.demoScenario === scenario
    );

  const safeguards =
    experience?.financialExplanation
      ?.safeguards || {};

  const deterministicFinancialReasoning =
    safeguards
      .llmUsedForFinancialReasoning ===
      false;

  const hasPreviousBill =
    Boolean(
      experience?.previousBill
    );

  const financialStatus =
    experience?.financialExplanation
      ?.status || null;

  let financiallyReconciled = false;

  if (hasPreviousBill) {
    financiallyReconciled =
      financialStatus ===
        'FULLY_EXPLAINED' &&
      Number(
        experience
          ?.financialExplanation
          ?.coveragePercent
      ) === 100 &&
      Math.abs(
        Number(
          experience
            ?.financialExplanation
            ?.unexplainedAmount || 0
        )
      ) < 0.005;
  } else if (
    scenario === 'PRORATION'
  ) {
    financiallyReconciled =
      financialStatus ===
        'NO_PREVIOUS_BILL' &&
      scenarioEvidence
        ?.impactPresentation ===
        'INCLUDED_IN_TOTAL';
  }

  const forbiddenPublicKeys =
    collectForbiddenKeys(
      experience
    );

  const internalTerms =
    collectInternalTerms(
      experience
    );

  const publicPayloadSafe =
    forbiddenPublicKeys.length === 0;

  const customerCopySafe =
    internalTerms.length === 0;

  const ready = [
    officialData,
    scenarioConsistent,
    evidenceHigh,
    deterministicFinancialReasoning,
    financiallyReconciled,
    publicPayloadSafe,
    customerCopySafe
  ].every(Boolean);

  return {
    customerId:
      profile?.customerId || null,
    name:
      profile?.name || null,
    scenario,
    scenarioLabel:
      mapping?.scenarioLabel ||
      experience?.customer
        ?.demoScenarioLabel ||
      scenario,
    evidenceLevel:
      scenarioEvidence
        ?.evidenceLevel || null,
    rentType:
      experience
        ?.financialExplanation
        ?.rentContext
        ?.current
        ?.rentType ||
      mapping?.rentType || null,
    financialStatus,
    ready,
    checks: {
      officialData,
      scenarioConsistent,
      evidenceHigh,
      deterministicFinancialReasoning,
      financiallyReconciled,
      publicPayloadSafe,
      customerCopySafe
    },
    diagnostics: {
      forbiddenPublicKeys,
      internalTerms:
        internalTerms.map(
          (item) => item.path
        )
    }
  };
}

function buildCheck(
  id,
  label,
  ok,
  detail,
  critical = true
) {
  return {
    id,
    label,
    ok: Boolean(ok),
    critical,
    detail
  };
}

async function getDefaultLineage(
  providedRepository = null
) {
  let repository =
    providedRepository;

  if (!repository) {
    const {
      createDesafio1Repository
    } = require('./desafio1Repository');

    repository =
      createDesafio1Repository();
  }

  try {
    await repository.open();

    return await repository
      .getImportMetadata();
  } finally {
    await repository.close();
  }
}

class Release1ReadinessService {
  constructor({
    officialDemoExperienceService = null,
    mappingStatusProvider = null,
    lineageProvider = null,
    demoProfilesProvider = null,
    now = null,
    cacheTtlMs = 30000
  } = {}) {
    this.officialDemoExperienceService =
      officialDemoExperienceService ||
      createOfficialDemoExperienceService();

    this.mappingStatusProvider =
      mappingStatusProvider ||
      (() => getDemoMappingStatus());

    this.lineageProvider =
      lineageProvider ||
      getDefaultLineage;

    this.demoProfilesProvider =
      demoProfilesProvider ||
      getDemoProfiles;

    this.now =
      now ||
      (() => new Date());

    this.cacheTtlMs =
      Math.max(
        0,
        Number(cacheTtlMs) || 0
      );
    this.cachedReport = null;
    this.cachedAt = 0;
  }

  async buildReport({
    force = false
  } = {}) {
    const nowDate =
      this.now();
    const nowMs =
      nowDate.getTime();

    if (
      !force &&
      this.cachedReport &&
      this.cacheTtlMs > 0 &&
      (
        nowMs -
        this.cachedAt
      ) < this.cacheTtlMs
    ) {
      return clone(
        this.cachedReport
      );
    }
    const mappingStatus =
      this.mappingStatusProvider();

    const allDemoProfiles =
      this.demoProfilesProvider();

    const explicitPitchProfiles =
      allDemoProfiles.filter(
        (profile) =>
          profile.release1Pitch === true
      );

    // Fase 8 permite N perfiles demo, pero el preflight de R1 debe
    // seguir validando únicamente los casos congelados para el pitch.
    // Los tests/consumidores antiguos que no conocen release1Pitch
    // mantienen el comportamiento previo usando todos los perfiles.
    const demoProfiles =
      explicitPitchProfiles.length > 0
        ? explicitPitchProfiles
        : allDemoProfiles;

    let lineage = [];
    let lineageError = null;

    try {
      lineage =
        await this.lineageProvider();
    } catch (error) {
      lineageError = error;
    }

    const mappedProfiles =
      mappingStatus?.profiles || [];

    const mappedReleaseProfiles =
      demoProfiles.filter(
        (profile) =>
          mappedProfiles.some(
            (mapping) =>
              mapping.customerId ===
                profile.customerId
          )
      );

    const profileResults = [];

    if (mappingStatus?.configured) {
      for (const profile of demoProfiles) {
        const mapping =
          mappedProfiles.find(
            (item) =>
              item.customerId ===
              profile.customerId
          ) || null;

        if (!mapping) {
          profileResults.push({
            customerId:
              profile.customerId,
            name:
              profile.name,
            scenario: null,
            scenarioLabel: null,
            evidenceLevel: null,
            rentType: null,
            financialStatus: null,
            ready: false,
            checks: {
              officialData: false,
              scenarioConsistent: false,
              evidenceHigh: false,
              deterministicFinancialReasoning: false,
              financiallyReconciled: false,
              publicPayloadSafe: false,
              customerCopySafe: false
            },
            diagnostics: {
              error:
                'Perfil sin mapeo oficial local.'
            }
          });
          continue;
        }

        try {
          const experience =
            await this
              .officialDemoExperienceService
              .getExperienceForUser(
                profile
              );

          profileResults.push(
            evaluateProfile({
              profile,
              mapping,
              experience
            })
          );
        } catch (error) {
          profileResults.push({
            customerId:
              profile.customerId,
            name:
              profile.name,
            scenario:
              mapping.scenario || null,
            scenarioLabel:
              mapping.scenarioLabel || null,
            evidenceLevel:
              mapping.evidenceLevel || null,
            rentType:
              mapping.rentType || null,
            financialStatus: null,
            ready: false,
            checks: {
              officialData: false,
              scenarioConsistent: false,
              evidenceHigh: false,
              deterministicFinancialReasoning: false,
              financiallyReconciled: false,
              publicPayloadSafe: false,
              customerCopySafe: false
            },
            diagnostics: {
              error:
                error?.message ||
                String(error)
            }
          });
        }
      }
    }

    const expectedProfiles =
      demoProfiles.length;

    const readyProfiles =
      profileResults.filter(
        (profile) => profile.ready
      ).length;

    const scenarios =
      Array.from(
        new Set(
          profileResults
            .map(
              (profile) =>
                profile.scenario
            )
            .filter(Boolean)
        )
      );

    lineage =
      Array.isArray(lineage)
        ? lineage
        : [];

    const lineageComplete =
      lineage.length ===
        EXPECTED_SOURCE_COUNT &&
      lineage.every(
        (entry) =>
          entry?.datasetKey &&
          entry?.fileName &&
          entry?.sha256 &&
          Number(entry?.importedRows) > 0
      );

    const allFinanciallyGrounded =
      profileResults.length ===
        expectedProfiles &&
      profileResults.every(
        (profile) =>
          profile.checks
            ?.evidenceHigh &&
          profile.checks
            ?.deterministicFinancialReasoning &&
          profile.checks
            ?.financiallyReconciled
      );

    const allPublicPayloadsSafe =
      profileResults.length ===
        expectedProfiles &&
      profileResults.every(
        (profile) =>
          profile.checks
            ?.publicPayloadSafe
      );

    const allCustomerCopySafe =
      profileResults.length ===
        expectedProfiles &&
      profileResults.every(
        (profile) =>
          profile.checks
            ?.customerCopySafe
      );

    const checks = [
      buildCheck(
        'LOCAL_MAPPING',
        'Mapeo demo local',
        mappingStatus?.configured &&
          mappedReleaseProfiles.length ===
            expectedProfiles,
        mappingStatus?.configured
          ? `${mappedReleaseProfiles.length}/${expectedProfiles} perfiles del pitch vinculados a casos oficiales locales (${mappedProfiles.length} perfiles demo disponibles en el mapeo).`
          : 'Falta configurar backend/data/demo-users.local.json.'
      ),
      buildCheck(
        'DATA_LINEAGE',
        'Trazabilidad de fuentes',
        lineageComplete,
        lineageComplete
          ? `${lineage.length}/${EXPECTED_SOURCE_COUNT} fuentes oficiales registradas con huella de importación.`
          : lineageError
            ? `No se pudo validar el lineage: ${lineageError.message}`
            : `${lineage.length}/${EXPECTED_SOURCE_COUNT} fuentes con lineage completo.`
      ),
      buildCheck(
        'PROFILE_COVERAGE',
        'Perfiles listos',
        readyProfiles ===
          expectedProfiles &&
          expectedProfiles > 0,
        `${readyProfiles}/${expectedProfiles} perfiles pasan todos los controles del Release 1.`
      ),
      buildCheck(
        'SCENARIO_COVERAGE',
        'Cobertura de escenarios',
        scenarios.length >= 2,
        scenarios.length >= 2
          ? `${scenarios.length} escenarios críticos distintos preparados para la demo.`
          : 'Se requieren al menos dos escenarios críticos distintos para la demo.'
      ),
      buildCheck(
        'FINANCIAL_GROUNDING',
        'Grounding financiero',
        allFinanciallyGrounded,
        allFinanciallyGrounded
          ? 'Los casos demo usan evidencia HIGH, conciliación determinista y no delegan montos/causas al LLM.'
          : 'Algún perfil no cumple evidencia HIGH, conciliación o salvaguarda determinista.'
      ),
      buildCheck(
        'PUBLIC_PAYLOAD_PRIVACY',
        'Privacidad del payload público',
        allPublicPayloadsSafe,
        allPublicPayloadsSafe
          ? 'Las experiencias públicas no exponen identificadores oficiales ni lineage interno.'
          : 'Se detectaron claves internas u oficiales en una experiencia pública.'
      ),
      buildCheck(
        'CUSTOMER_COPY_SAFE',
        'Lenguaje orientado al cliente',
        allCustomerCopySafe,
        allCustomerCopySafe
          ? 'Las respuestas visibles no exponen nombres internos como Brainy.'
          : 'Se detectaron términos internos en texto visible para el cliente.'
      )
    ];

    const ready =
      checks
        .filter(
          (check) =>
            check.critical
        )
        .every(
          (check) => check.ok
        );

    const report = {
      schemaVersion:
        'desafio1-release1-readiness-v1',
      release: 'R1',
      generatedAt:
        nowDate.toISOString(),
      ready,
      status:
        ready
          ? 'READY'
          : 'REVIEW_REQUIRED',
      summary: {
        expectedProfiles,
        readyProfiles,
        availableDemoProfiles:
          allDemoProfiles.length,
        mappedDemoProfiles:
          mappedProfiles.length,
        distinctScenarios:
          scenarios.length,
        scenarios,
        lineageSources:
          lineage.length,
        expectedLineageSources:
          EXPECTED_SOURCE_COUNT
      },
      checks,
      profiles:
        profileResults.map(
          (profile) => ({
            customerId:
              profile.customerId,
            name:
              profile.name,
            scenario:
              profile.scenario,
            scenarioLabel:
              profile.scenarioLabel,
            evidenceLevel:
              profile.evidenceLevel,
            rentType:
              profile.rentType,
            financialStatus:
              profile.financialStatus,
            ready:
              profile.ready,
            checks:
              clone(profile.checks)
          })
        )
    };

    this.cachedReport =
      clone(report);
    this.cachedAt = nowMs;

    return clone(report);
  }
}

function createRelease1ReadinessService(
  options = {}
) {
  return new Release1ReadinessService(
    options
  );
}

module.exports = {
  EXPECTED_SOURCE_COUNT,
  FORBIDDEN_PUBLIC_KEYS,
  collectForbiddenKeys,
  collectInternalTerms,
  getScenarioEvidence,
  evaluateProfile,
  getDefaultLineage,
  Release1ReadinessService,
  createRelease1ReadinessService
};
