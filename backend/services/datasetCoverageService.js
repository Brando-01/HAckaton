const {
  COVERAGE_SCHEMA_VERSION,
  COVERAGE_PHASE,
  buildCoverageProfile,
  assignDemoIds,
  buildCoverageSummary
} = require(
  './datasetCoverageLogic'
);

function clampConcurrency(
  value
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Math.min(
    Math.max(
      Number.isInteger(parsed)
        ? parsed
        : 4,
      1
    ),
    8
  );
}

function normalizeLimit(
  value
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

class DatasetCoverageService {
  constructor({
    repository = null,
    dbPath = null,
    explanationServiceFactory = null
  } = {}) {
    if (repository) {
      this.repository = repository;
      this.ownsRepository = false;
    } else {
      // Carga diferida para que la lógica de cobertura
      // pueda probarse sin abrir SQLite.
      const {
        createDesafio1Repository
      } = require(
        './desafio1Repository'
      );

      this.repository =
        createDesafio1Repository({
          dbPath
        });
      this.ownsRepository = true;
    }

    this.dbPath =
      dbPath ||
      this.repository?.dbPath ||
      null;

    this.explanationServiceFactory =
      explanationServiceFactory ||
      (() => {
        const {
          createBillingExplanationService
        } = require(
          './billingExplanationService'
        );

        return createBillingExplanationService({
          dbPath: this.dbPath
        });
      });

    this.opened = false;
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

    this.opened = true;
    return this;
  }

  async close() {
    if (!this.opened) {
      return;
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

  async scan({
    limit = null,
    concurrency = 4,
    onProgress = null
  } = {}) {
    await this.ensureOpen();

    const safeLimit =
      normalizeLimit(limit);

    const workerCount =
      clampConcurrency(concurrency);

    const totalAvailable =
      typeof this.repository
        .countCoverageSubscribers ===
        'function'
        ? await this.repository
            .countCoverageSubscribers()
        : null;

    const seeds =
      await this.repository
        .listCoverageSubscriberSeeds({
          limit: safeLimit
        });

    const profiles =
      new Array(seeds.length);

    let cursor = 0;
    let processed = 0;

    const progressState = {
      consultable: 0,
      explainable: 0,
      highConfidence: 0,
      demoPremium: 0,
      errors: 0
    };

    const runWorker = async () => {
      const explanationService =
        this.explanationServiceFactory();

      try {
        if (
          explanationService &&
          typeof explanationService.open ===
            'function'
        ) {
          await explanationService.open();
        }

        while (true) {
          const index = cursor;
          cursor += 1;

          if (index >= seeds.length) {
            break;
          }

          const seed = seeds[index];
          let explanation = null;
          let error = null;

          if (
            Number(seed.invoiceCount) > 0
          ) {
            try {
              explanation =
                await explanationService
                  .explainSubscriber(
                    seed.subscriberKey
                  );
            } catch (caught) {
              error = caught;
            }
          }

          const profile =
            buildCoverageProfile({
              seed,
              explanation,
              error
            });

          profiles[index] = profile;
          processed += 1;

          if (profile.consultable) {
            progressState.consultable += 1;
          }
          if (profile.explainable) {
            progressState.explainable += 1;
          }
          if (profile.highConfidence) {
            progressState.highConfidence += 1;
          }
          if (profile.demoPremium) {
            progressState.demoPremium += 1;
          }
          if (profile.errorCode) {
            progressState.errors += 1;
          }

          if (
            typeof onProgress ===
              'function'
          ) {
            onProgress({
              processed,
              total: seeds.length,
              ...progressState
            });
          }
        }
      } finally {
        if (
          explanationService &&
          typeof explanationService.close ===
            'function'
        ) {
          await explanationService.close();
        }
      }
    };

    const actualWorkers =
      Math.min(
        workerCount,
        Math.max(seeds.length, 1)
      );

    await Promise.all(
      Array.from(
        { length: actualWorkers },
        () => runWorker()
      )
    );

    const withDemoIds =
      assignDemoIds(profiles);

    const generatedAt =
      new Date().toISOString();

    const summary =
      buildCoverageSummary(
        withDemoIds,
        {
          totalAvailable:
            Number.isInteger(
              totalAvailable
            )
              ? totalAvailable
              : withDemoIds.length,
          generatedAt
        }
      );

    const dataLineage =
      typeof this.repository
        .getImportMetadata ===
        'function'
        ? await this.repository
            .getImportMetadata()
        : [];

    return {
      schemaVersion:
        COVERAGE_SCHEMA_VERSION,
      phase:
        COVERAGE_PHASE,
      generatedAt,
      configuration: {
        requestedLimit:
          safeLimit,
        concurrency:
          workerCount
      },
      summary,
      profiles: withDemoIds,
      dataLineage: (
        dataLineage || []
      ).map(
        (dataset) => ({
          datasetKey:
            dataset.datasetKey,
          importedRows:
            dataset.importedRows,
          importedAt:
            dataset.importedAt,
          sha256:
            dataset.sha256
        })
      ),
      safeguards: {
        llmUsedForFinancialReasoning:
          false,
        massProfilesAreLoginAccounts:
          false,
        officialIdentifiersStoredOnlyLocally:
          true,
        demoIdsAreSyntheticAliases:
          true,
        release1ProfilesModified:
          false,
        note:
          'Fase 9 recorre los suscriptores de PLANTA, reutiliza Fases 2-3 para medir cobertura y genera alias DEMO locales. No crea miles de credenciales ni modifica el Release 1.'
      }
    };
  }
}

function createDatasetCoverageService(
  options = {}
) {
  return new DatasetCoverageService(
    options
  );
}

module.exports = {
  clampConcurrency,
  normalizeLimit,
  DatasetCoverageService,
  createDatasetCoverageService
};
