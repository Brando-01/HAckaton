const {
  createHash
} = require('crypto');

const DATASET_ACCOUNT_AUTH_POLICY =
  Object.freeze({
    mode:
      'DATASET_IDENTIFIER_PAIR',
    source:
      'PLANTA_CLIENTES',
    customerCodeField:
      'COD_CLIENTE',
    serviceNumberField:
      'NUM_ANEXO',
    exactPairRequired: true,
    billableSubscriberRequired: true,
    identifiersAreDemoCredentials:
      true,
    identifiersAreProductionSecrets:
      false,
    subscriberKeyExposedToBrowser:
      false,
    financialAccountExposedToBrowser:
      false,
    invalidPairCreatesSession:
      false
  });

function normalizeIdentifier(value) {
  const normalized =
    String(value ?? '')
      .trim();

  if (
    !normalized ||
    normalized.length > 64
  ) {
    return null;
  }

  return normalized;
}

function buildAccountIdentity({
  customerCode,
  serviceNumber
}) {
  const digest =
    createHash('sha256')
      .update(
        `${customerCode}\u0000${serviceNumber}`
      )
      .digest('hex')
      .toUpperCase();

  return {
    userId:
      `D1U-${digest.slice(0, 16)}`,
    customerId:
      `D1A-${digest.slice(0, 16)}`
  };
}

function maskServiceNumber(value) {
  const normalized =
    normalizeIdentifier(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 4) {
    return normalized;
  }

  return (
    '•'.repeat(
      Math.min(
        6,
        normalized.length - 4
      )
    ) +
    normalized.slice(-4)
  );
}

function getDatasetAccountAuthPolicy() {
  return {
    ...DATASET_ACCOUNT_AUTH_POLICY
  };
}

class DatasetAccountAuthService {
  constructor({
    repositoryFactory = null,
    dbPath = null
  } = {}) {
    this.repositoryFactory =
      repositoryFactory ||
      (() => {
        const {
          Desafio1Repository
        } = require(
          './desafio1Repository'
        );

        return new Desafio1Repository({
          dbPath
        });
      });
  }

  async authenticate({
    customerCode,
    serviceNumber
  } = {}) {
    const normalizedCustomerCode =
      normalizeIdentifier(
        customerCode
      );

    const normalizedServiceNumber =
      normalizeIdentifier(
        serviceNumber
      );

    if (
      !normalizedCustomerCode ||
      !normalizedServiceNumber
    ) {
      return {
        ok: false,
        code:
          'DATASET_ACCOUNT_FIELDS_REQUIRED'
      };
    }

    const repository =
      this.repositoryFactory();

    try {
      await repository.open();

      const subscriber =
        await repository
          .getSubscriberByCustomerAndService(
            normalizedCustomerCode,
            normalizedServiceNumber
          );

      if (!subscriber) {
        return {
          ok: false,
          code:
            'DATASET_ACCOUNT_NOT_FOUND'
        };
      }

      const hasBilling =
        await repository
          .subscriberHasBilling(
            subscriber.subscriberKey
          );

      if (!hasBilling) {
        return {
          ok: false,
          code:
            'DATASET_ACCOUNT_WITHOUT_BILLING'
        };
      }

      const identity =
        buildAccountIdentity({
          customerCode:
            normalizedCustomerCode,
          serviceNumber:
            normalizedServiceNumber
        });

      return {
        ok: true,
        user: {
          ...identity,
          customerCode:
            normalizedCustomerCode,
          name:
            `Cliente ${normalizedCustomerCode}`,
          email: null,
          mode: 'DATASET',
          serviceNumberMasked:
            maskServiceNumber(
              normalizedServiceNumber
            ),
          // Solo vive dentro de la sesión del backend.
          // toPublicAuthUser() lo elimina de cualquier payload.
          datasetSubscriberKey:
            subscriber.subscriberKey
        }
      };
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

function createDatasetAccountAuthService(
  options = {}
) {
  return new DatasetAccountAuthService(
    options
  );
}

module.exports = {
  DATASET_ACCOUNT_AUTH_POLICY,
  DatasetAccountAuthService,
  createDatasetAccountAuthService,
  normalizeIdentifier,
  buildAccountIdentity,
  maskServiceNumber,
  getDatasetAccountAuthPolicy
};
