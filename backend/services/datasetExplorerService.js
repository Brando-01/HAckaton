const {
  normalizeExplorerQuery,
  buildExplorerBinding,
  toSafeExplorerProfile,
  buildExplorerSummary
} = require(
  './datasetExplorerLogic'
);


function defaultReadMeta(options) {
  const {
    readCoverageMeta
  } = require(
    './datasetCoverageStore'
  );
  return readCoverageMeta(options);
}

function defaultQueryProfiles(options) {
  const {
    queryCoverageProfiles
  } = require(
    './datasetCoverageStore'
  );
  return queryCoverageProfiles(options);
}

function defaultReadPrivateProfile(
  demoId,
  options
) {
  const {
    readPrivateCoverageProfileByDemoId
  } = require(
    './datasetCoverageStore'
  );
  return readPrivateCoverageProfileByDemoId(
    demoId,
    options
  );
}

function defaultExplainSubscriber(
  subscriberKey
) {
  const {
    explainSubscriberBilling
  } = require(
    './billingExplanationService'
  );
  return explainSubscriberBilling(
    subscriberKey
  );
}

function defaultLoadHistory(
  subscriberKey
) {
  const {
    loadSubscriberBillingHistory
  } = require(
    './billingHistoryService'
  );
  return loadSubscriberBillingHistory(
    subscriberKey
  );
}

function defaultBuildExperience(args) {
  const {
    buildOfficialDemoExperience
  } = require(
    './officialDemoExperienceService'
  );
  return buildOfficialDemoExperience(args);
}

class DatasetExplorerError extends Error {
  constructor(
    code,
    message
  ) {
    super(message);
    this.name =
      'DatasetExplorerError';
    this.code = code;
  }
}

function normalizeStoreError(error) {
  if (
    error?.code ===
      'COVERAGE_DB_NOT_FOUND'
  ) {
    return new DatasetExplorerError(
      'EXPLORER_INDEX_NOT_FOUND',
      'El índice de cobertura todavía no está disponible. Ejecuta npm run demo:coverage:desafio1.'
    );
  }

  return error;
}

class DatasetExplorerService {
  constructor({
    dbPath = null,
    readMeta = null,
    queryProfiles = null,
    readPrivateProfile = null,
    explainSubscriber = null,
    loadHistory = null,
    buildExperience = null
  } = {}) {
    this.dbPath = dbPath;
    this.readMeta =
      readMeta || defaultReadMeta;
    this.queryProfiles =
      queryProfiles ||
      defaultQueryProfiles;
    this.readPrivateProfile =
      readPrivateProfile ||
      defaultReadPrivateProfile;
    this.explainSubscriber =
      explainSubscriber ||
      defaultExplainSubscriber;
    this.loadHistory =
      loadHistory ||
      defaultLoadHistory;
    this.buildExperience =
      buildExperience ||
      defaultBuildExperience;
  }

  async getSummary() {
    try {
      const meta =
        await this.readMeta({
          dbPath: this.dbPath
        });

      return buildExplorerSummary(
        meta
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  async searchProfiles(
    rawQuery = {}
  ) {
    const query =
      normalizeExplorerQuery(
        rawQuery
      );

    try {
      const result =
        await this.queryProfiles({
          dbPath: this.dbPath,
          ...query
        });

      return {
        query,
        items:
          (result.items || [])
            .map(
              toSafeExplorerProfile
            ),
        pagination:
          result.pagination
      };
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  async getPrivateProfile(
    demoId
  ) {
    let profile;

    try {
      profile =
        await this.readPrivateProfile(
          demoId,
          {
            dbPath:
              this.dbPath
          }
        );
    } catch (error) {
      throw normalizeStoreError(error);
    }

    if (!profile) {
      throw new DatasetExplorerError(
        'EXPLORER_PROFILE_NOT_FOUND',
        'El alias DEMO no existe o no corresponde a un cliente consultable.'
      );
    }

    return profile;
  }

  async getSafeProfile(
    demoId
  ) {
    return toSafeExplorerProfile(
      await this.getPrivateProfile(
        demoId
      )
    );
  }


  async getExperienceForUser(
    user,
    {
      includeHistory = false
    } = {}
  ) {
    if (
      user?.mode !== 'EXPLORER' ||
      !user?.explorerDemoId
    ) {
      throw new DatasetExplorerError(
        'EXPLORER_SESSION_REQUIRED',
        'Se requiere una sesión temporal del explorador.'
      );
    }

    const profile =
      await this.getPrivateProfile(
        user.explorerDemoId
      );

    const [
      explanation,
      historyInvoices
    ] = await Promise.all([
      this.explainSubscriber(
        profile.subscriberKey
      ),
      includeHistory
        ? this.loadHistory(
            profile.subscriberKey
          )
        : Promise.resolve(null)
    ]);

    const experience =
      this.buildExperience({
        user,
        binding:
          buildExplorerBinding(
            profile
          ),
        explanation,
        historyInvoices
      });

    return {
      ...experience,
      schemaVersion:
        'desafio1-explorer-experience-v1',
      dataSource:
        'DESAFIO1_COVERAGE_EXPLORER_LOCAL',
      explorer: {
        ...toSafeExplorerProfile(
          profile
        ),
        temporarySession: true
      }
    };
  }
}

function createDatasetExplorerService(
  options = {}
) {
  return new DatasetExplorerService(
    options
  );
}

function isDatasetExplorerError(
  error
) {
  return (
    error instanceof
      DatasetExplorerError ||
    String(error?.code || '')
      .startsWith('EXPLORER_')
  );
}

module.exports = {
  DatasetExplorerError,
  DatasetExplorerService,
  createDatasetExplorerService,
  isDatasetExplorerError
};
