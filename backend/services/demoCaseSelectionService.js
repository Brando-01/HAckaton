const {
  createDesafio1Repository
} = require(
  './desafio1Repository'
);

const {
  createBillingExplanationService
} = require(
  './billingExplanationService'
);

const {
  DEFAULT_SCENARIO_ORDER,
  normalizeScenarioCode,
  scoreDemoCandidate,
  toCandidateSummary,
  rankCandidateSummaries,
  createSelectionReport
} = require(
  './desafio1DemoSelectionLogic'
);

class DemoCaseSelectionService {
  constructor({
    repository = null,
    explanationService = null,
    dbPath = null
  } = {}) {
    if (repository) {
      this.repository = repository;
      this.ownsRepository = false;
    } else {
      this.repository =
        createDesafio1Repository({
          dbPath
        });
      this.ownsRepository = true;
    }

    if (explanationService) {
      this.explanationService =
        explanationService;
      this.ownsExplanationService =
        false;
    } else {
      this.explanationService =
        createBillingExplanationService({
          repository:
            this.repository
        });
      this.ownsExplanationService =
        true;
    }

    this.opened = false;
    this.explanationCache =
      new Map();
  }

  async open() {
    if (this.opened) {
      return this;
    }

    if (
      this.repository &&
      typeof this.repository.open ===
        'function'
    ) {
      await this.repository.open();
    }

    if (
      this.explanationService &&
      typeof this.explanationService
        .open === 'function'
    ) {
      await this.explanationService
        .open();
    }

    this.opened = true;
    return this;
  }

  async close() {
    if (!this.opened) {
      return;
    }

    if (
      this.ownsExplanationService &&
      this.explanationService &&
      typeof this.explanationService
        .close === 'function'
    ) {
      await this.explanationService
        .close();
    }

    if (
      this.ownsRepository &&
      this.repository &&
      typeof this.repository.close ===
        'function'
    ) {
      await this.repository.close();
    }

    this.opened = false;
  }

  async ensureOpen() {
    if (!this.opened) {
      await this.open();
    }
  }

  async explainCached(
    subscriberKey
  ) {
    const key = String(
      subscriberKey ?? ''
    ).trim();

    if (!key) {
      return null;
    }

    if (
      this.explanationCache.has(key)
    ) {
      return this.explanationCache
        .get(key);
    }

    const promise =
      this.explanationService
        .explainSubscriber(key);

    this.explanationCache.set(
      key,
      promise
    );

    try {
      return await promise;
    } catch (error) {
      this.explanationCache.delete(
        key
      );
      throw error;
    }
  }

  async rankScenario(
    scenarioCode,
    {
      prefilterLimit = 300,
      limit = 5,
      onProgress = null
    } = {}
  ) {
    await this.ensureOpen();

    const scenario =
      normalizeScenarioCode(
        scenarioCode
      );

    if (!scenario) {
      const error = new Error(
        `Escenario no soportado: ${scenarioCode}`
      );
      error.code =
        'DEMO_SCENARIO_INVALID';
      throw error;
    }

    const safePoolLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            prefilterLimit,
            10
          ) || 300,
          1
        ),
        2000
      );

    const candidateKeys =
      await this.repository
        .listDemoScenarioCandidateKeys(
          scenario,
          {
            limit:
              safePoolLimit
          }
        );

    const summaries = [];
    const errors = [];

    for (
      let index = 0;
      index < candidateKeys.length;
      index += 1
    ) {
      const subscriberKey =
        candidateKeys[index];

      try {
        const explanation =
          await this.explainCached(
            subscriberKey
          );

        const scoring =
          scoreDemoCandidate(
            explanation,
            scenario
          );

        summaries.push(
          toCandidateSummary({
            explanation,
            scenarioCode:
              scenario,
            scoring
          })
        );
      } catch (error) {
        errors.push({
          subscriberKey,
          code:
            error?.code ||
            'UNKNOWN_ERROR',
          message:
            error?.message ||
            String(error)
        });
      }

      if (
        typeof onProgress ===
          'function'
      ) {
        onProgress({
          scenario,
          processed:
            index + 1,
          total:
            candidateKeys.length
        });
      }
    }

    const ranked =
      rankCandidateSummaries(
        summaries,
        { limit }
      );

    return {
      scenario,
      prefiltered:
        candidateKeys.length,
      evaluated:
        summaries.length,
      eligible:
        summaries.filter(
          (candidate) =>
            candidate.eligible
        ).length,
      rejected:
        summaries.filter(
          (candidate) =>
            !candidate.eligible
        ).length,
      errors,
      top: ranked
    };
  }

  async rankAll({
    scenarios =
      DEFAULT_SCENARIO_ORDER,
    prefilterLimit = 300,
    limit = 5,
    onProgress = null
  } = {}) {
    await this.ensureOpen();

    const normalizedScenarios =
      Array.from(
        new Set(
          (
            scenarios || []
          )
            .map(
              normalizeScenarioCode
            )
            .filter(Boolean)
        )
      );

    if (!normalizedScenarios.length) {
      const error = new Error(
        'Se requiere al menos un escenario válido para seleccionar casos demo.'
      );
      error.code =
        'DEMO_SCENARIOS_REQUIRED';
      throw error;
    }

    const scenarioResults = {};

    for (
      const scenario of
        normalizedScenarios
    ) {
      scenarioResults[scenario] =
        await this.rankScenario(
          scenario,
          {
            prefilterLimit,
            limit,
            onProgress
          }
        );
    }

    const dataLineage =
      typeof this.repository
        .getImportMetadata ===
        'function'
        ? await this.repository
            .getImportMetadata()
        : [];

    return createSelectionReport({
      scenarioResults,
      prefilterLimit,
      topLimit: limit,
      dataLineage
    });
  }
}

function createDemoCaseSelectionService(
  options = {}
) {
  return new DemoCaseSelectionService(
    options
  );
}

async function rankDemoCases(
  options = {}
) {
  const service =
    createDemoCaseSelectionService(
      options
    );

  try {
    return await service.rankAll(
      options
    );
  } finally {
    await service.close();
  }
}

module.exports = {
  DemoCaseSelectionService,
  createDemoCaseSelectionService,
  rankDemoCases
};
