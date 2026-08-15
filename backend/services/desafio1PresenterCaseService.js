const PRESENTER_CASE_SCHEMA_VERSION =
  'desafio1-presenter-case-v1';

const QUALITY_CAPABILITY =
  Object.freeze({
    PREMIUM: 'PREMIUM',
    HIGH: 'HIGH',
    EXPLAINABLE: 'EXPLAINABLE',
    COMPARABLE: 'COMPARABLE',
    ANY: 'ALL'
  });

const ALLOWED_SCENARIOS =
  new Set([
    'RECONNECTION',
    'ACTIVE_DISCOUNT',
    'PRORATION',
    'DISCOUNT_ENDED',
    'DISCOUNT_REMOVED',
    'PLAN_CHANGE',
    'PACKAGES',
    'SUSPENSION_ADJUSTMENT'
  ]);

class PresenterCaseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PresenterCaseError';
    this.code = code;
  }
}

function normalizeCaseReference(value) {
  const raw =
    String(value ?? '')
      .trim()
      .toUpperCase();

  if (!raw) {
    return null;
  }

  const direct =
    /^DEMO(\d{6})$/.exec(raw);

  if (direct) {
    return `DEMO${direct[1]}`;
  }

  const human =
    /^(?:CASO\s*)?#?\s*(\d{1,6})$/.exec(
      raw
    );

  if (!human) {
    return null;
  }

  return `DEMO${human[1].padStart(6, '0')}`;
}

function caseNumberFromDemoId(demoId) {
  const normalized =
    normalizeCaseReference(demoId);

  return normalized
    ? normalized.slice(4)
    : null;
}

function formatCaseLabel(demoId) {
  const number =
    caseNumberFromDemoId(demoId);

  return number
    ? `Caso #${number}`
    : 'Caso de cobertura';
}

function normalizeQuality(value) {
  const quality =
    String(value || 'PREMIUM')
      .trim()
      .toUpperCase();

  return Object.hasOwn(
    QUALITY_CAPABILITY,
    quality
  )
    ? quality
    : null;
}

function normalizeScenario(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const scenario =
    String(value)
      .trim()
      .toUpperCase();

  return ALLOWED_SCENARIOS.has(
    scenario
  )
    ? scenario
    : null;
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

function defaultSearchProfiles(options) {
  const {
    queryCoverageProfiles
  } = require(
    './datasetCoverageStore'
  );

  return queryCoverageProfiles(options);
}

function defaultRepositoryFactory(dbPath) {
  const {
    Desafio1Repository
  } = require(
    './desafio1Repository'
  );

  return new Desafio1Repository({
    dbPath
  });
}

function buildPresenterResult({
  profile,
  subscriber
}) {
  const demoId = profile.demoId;

  return {
    schemaVersion:
      PRESENTER_CASE_SCHEMA_VERSION,
    presenterOnly: true,
    case: {
      number:
        caseNumberFromDemoId(
          demoId
        ),
      label:
        formatCaseLabel(demoId),
      scenario:
        profile.primaryScenario || null,
      qualityTier:
        profile.qualityTier || null,
      evidenceLevel:
        profile.evidenceLevel || null,
      demoPremium:
        Boolean(profile.demoPremium),
      comparable:
        Boolean(profile.comparable),
      invoiceCount:
        Number(profile.invoiceCount || 0),
      rentType:
        profile.rentType || null,
      businessType:
        profile.businessType || null,
      lobType:
        profile.lobType || null,
      coveragePercent:
        profile.coveragePercent == null
          ? null
          : Number(
              profile.coveragePercent
            )
    },
    login: {
      customerCode:
        subscriber.customerKey,
      serviceNumber:
        subscriber.subscriberKey
    },
    verification: {
      exactPlantPair: true,
      billingAvailable: true,
      source:
        'PLANTA_CLIENTES_AND_BILLING',
      intendedUse:
        'LOCAL_PRESENTER_LOGIN_ONLY'
    }
  };
}

class PresenterCaseService {
  constructor({
    coverageDbPath = null,
    dbPath = null,
    readPrivateProfile = null,
    searchProfiles = null,
    repositoryFactory = null
  } = {}) {
    this.coverageDbPath =
      coverageDbPath;
    this.dbPath = dbPath;
    this.readPrivateProfile =
      readPrivateProfile ||
      defaultReadPrivateProfile;
    this.searchProfiles =
      searchProfiles ||
      defaultSearchProfiles;
    this.repositoryFactory =
      repositoryFactory ||
      (() =>
        defaultRepositoryFactory(
          this.dbPath
        ));
  }

  async selectCase({
    caseRef = null,
    scenario = null,
    quality = 'PREMIUM'
  } = {}) {
    if (caseRef) {
      const demoId =
        normalizeCaseReference(
          caseRef
        );

      if (!demoId) {
        throw new PresenterCaseError(
          'PRESENTER_CASE_REFERENCE_INVALID',
          'El caso debe ser un número entre 1 y 999999, Caso #000074 o el alias técnico DEMO000074.'
        );
      }

      const profile =
        await this.readPrivateProfile(
          demoId,
          {
            dbPath:
              this.coverageDbPath
          }
        );

      if (!profile) {
        throw new PresenterCaseError(
          'PRESENTER_CASE_NOT_FOUND',
          `${formatCaseLabel(demoId)} no existe en el índice consultable local.`
        );
      }

      return profile;
    }

    const normalizedQuality =
      normalizeQuality(quality);

    if (!normalizedQuality) {
      throw new PresenterCaseError(
        'PRESENTER_QUALITY_INVALID',
        'La calidad debe ser PREMIUM, HIGH, EXPLAINABLE, COMPARABLE o ANY.'
      );
    }

    const normalizedScenario =
      normalizeScenario(scenario);

    if (
      scenario &&
      !normalizedScenario
    ) {
      throw new PresenterCaseError(
        'PRESENTER_SCENARIO_INVALID',
        'El escenario solicitado no pertenece al catálogo de cobertura del Desafío 1.'
      );
    }

    const result =
      await this.searchProfiles({
        dbPath:
          this.coverageDbPath,
        capability:
          QUALITY_CAPABILITY[
            normalizedQuality
          ],
        scenario:
          normalizedScenario || 'ALL',
        rentType: 'ALL',
        qualityTier: 'ALL',
        sort: 'PREMIUM_FIRST',
        page: 1,
        pageSize: 1
      });

    const candidate =
      result?.items?.[0];

    if (!candidate?.demoId) {
      throw new PresenterCaseError(
        'PRESENTER_CASE_NOT_FOUND',
        'No encontré un caso consultable que cumpla los filtros solicitados en el índice local.'
      );
    }

    const profile =
      await this.readPrivateProfile(
        candidate.demoId,
        {
          dbPath:
            this.coverageDbPath
        }
      );

    if (!profile) {
      throw new PresenterCaseError(
        'PRESENTER_CASE_PRIVATE_MAPPING_MISSING',
        'El caso existe en la proyección segura, pero su mapping privado local no está disponible.'
      );
    }

    return profile;
  }

  async resolveLogin(args = {}) {
    const profile =
      await this.selectCase(args);

    if (
      !profile.customerKey ||
      !profile.subscriberKey
    ) {
      throw new PresenterCaseError(
        'PRESENTER_CASE_PRIVATE_MAPPING_MISSING',
        'El caso no conserva el mapping local necesario para validar el acceso demo.'
      );
    }

    const repository =
      this.repositoryFactory();

    try {
      await repository.open();

      const subscriber =
        await repository
          .getSubscriberByCustomerAndService(
            profile.customerKey,
            profile.subscriberKey
          );

      if (!subscriber) {
        throw new PresenterCaseError(
          'PRESENTER_CASE_PAIR_MISMATCH',
          'El mapping del índice ya no coincide con una pareja COD_CLIENTE + NUM_ANEXO de PLANTA.'
        );
      }

      const hasBilling =
        await repository
          .subscriberHasBilling(
            subscriber.subscriberKey
          );

      if (!hasBilling) {
        throw new PresenterCaseError(
          'PRESENTER_CASE_WITHOUT_BILLING',
          'El caso ya no tiene facturación disponible para el login demo.'
        );
      }

      return buildPresenterResult({
        profile,
        subscriber
      });
    } finally {
      if (
        repository &&
        typeof repository.close ===
          'function'
      ) {
        await repository.close();
      }
    }
  }
}

function createPresenterCaseService(
  options = {}
) {
  return new PresenterCaseService(
    options
  );
}

module.exports = {
  PRESENTER_CASE_SCHEMA_VERSION,
  QUALITY_CAPABILITY,
  ALLOWED_SCENARIOS,
  PresenterCaseError,
  PresenterCaseService,
  createPresenterCaseService,
  normalizeCaseReference,
  caseNumberFromDemoId,
  formatCaseLabel,
  normalizeQuality,
  normalizeScenario,
  buildPresenterResult
};
