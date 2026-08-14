const {
  MATRIX_SCHEMA_VERSION,
  MATRIX_PHASE,
  buildSubscriberMatrixObservation,
  buildB2CCoverageMatrixReport
} = require(
  './desafio1B2CCoverageMatrixLogic'
);

function clampConcurrency(value) {
  const parsed = Number.parseInt(
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

function normalizeLimit(value) {
  const parsed = Number.parseInt(
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

class B2CCoverageMatrixService {
  constructor({
    repository = null,
    dbPath = null,
    explanationServiceFactory = null
  } = {}) {
    if (repository) {
      this.repository = repository;
      this.ownsRepository = false;
    } else {
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
      clampConcurrency(
        concurrency
      );

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

    const observations =
      new Array(seeds.length);

    let cursor = 0;
    let processed = 0;

    const progress = {
      consultable: 0,
      verifiedScenarioCases: 0,
      unresolvedRentScenarioCases: 0,
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

          const observation =
            buildSubscriberMatrixObservation({
              seed,
              explanation,
              error
            });

          observations[index] =
            observation;
          processed += 1;

          if (observation.consultable) {
            progress.consultable += 1;
          }

          progress.verifiedScenarioCases +=
            observation.scenarios.filter(
              (scenario) =>
                scenario.verified
            ).length;

          progress.unresolvedRentScenarioCases +=
            observation.scenarios.filter(
              (scenario) =>
                !scenario.rentResolved
            ).length;

          if (observation.analysisError) {
            progress.errors += 1;
          }

          if (
            typeof onProgress ===
              'function'
          ) {
            onProgress({
              processed,
              total: seeds.length,
              ...progress
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

    const actualWorkers = Math.min(
      workerCount,
      Math.max(
        seeds.length,
        1
      )
    );

    await Promise.all(
      Array.from(
        {
          length: actualWorkers
        },
        () => runWorker()
      )
    );

    const dataLineage =
      typeof this.repository
        .getImportMetadata ===
        'function'
        ? await this.repository
            .getImportMetadata()
        : [];

    const report =
      buildB2CCoverageMatrixReport(
        observations,
        {
          totalAvailable:
            totalAvailable !== null &&
            totalAvailable !== undefined &&
            Number.isInteger(
              Number(totalAvailable)
            )
              ? Number(totalAvailable)
              : observations.length,
          requestedLimit:
            safeLimit,
          generatedAt:
            new Date().toISOString(),
          dataLineage
        }
      );

    return {
      ...report,
      schemaVersion:
        MATRIX_SCHEMA_VERSION,
      phase: MATRIX_PHASE,
      configuration: {
        requestedLimit:
          safeLimit,
        concurrency:
          workerCount,
        fullPopulationScan:
          !report.scope.limited
      }
    };
  }
}

function createB2CCoverageMatrixService(
  options = {}
) {
  return new B2CCoverageMatrixService(
    options
  );
}

module.exports = {
  clampConcurrency,
  normalizeLimit,
  B2CCoverageMatrixService,
  createB2CCoverageMatrixService
};
