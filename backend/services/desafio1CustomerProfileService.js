class CustomerProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CustomerProfileError';
    this.code = code;
  }
}

function toSafeDatasetProfile({
  subscriber,
  user
}) {
  if (!subscriber) {
    return null;
  }

  return {
    schemaVersion:
      'desafio1-customer-profile-v1',
    visibleId:
      user?.mode === 'DATASET'
        ? user?.customerCode ||
          subscriber.customerKey ||
          null
        : user?.mode === 'EXPLORER'
          ? user?.explorerDemoId ||
            user?.customerId ||
            null
          : user?.customerId || null,
    customerCode:
      subscriber.customerKey || null,
    activationDate:
      subscriber.activationDate || null,
    billingCycleDay:
      subscriber.billingCycleDay !== null &&
      subscriber.billingCycleDay !== undefined &&
      String(subscriber.billingCycleDay).trim() !== '' &&
      Number.isInteger(
        Number(subscriber.billingCycleDay)
      )
        ? Number(subscriber.billingCycleDay)
        : null,
    lobType:
      subscriber.lobType || null,
    businessType:
      subscriber.businessType || null,
    source: {
      dataset:
        'PLANTA CLIENTES.csv',
      customerCodeField:
        'COD_CLIENTE',
      activationDateField:
        'fecha_activacion_original',
      billingCycleField:
        'ciclo',
      lobTypeField:
        'lob_type',
      businessTypeField:
        'negocio'
    },
    safeguards: {
      datasetAlreadyAnonymized: true,
      subscriberKeyExposed: false,
      financialAccountExposed: false,
      phoneHashExposed: false
    }
  };
}

class DatasetCustomerProfileService {
  constructor({
    resolveSubscriberKey,
    repositoryFactory = null,
    dbPath = null
  } = {}) {
    if (
      typeof resolveSubscriberKey !==
      'function'
    ) {
      throw new Error(
        'DatasetCustomerProfileService requiere resolveSubscriberKey(user).'
      );
    }

    this.resolveSubscriberKey =
      resolveSubscriberKey;
    this.repositoryFactory =
      repositoryFactory ||
      (() => {
        const {
          createDesafio1Repository
        } = require(
          './desafio1Repository'
        );

        return createDesafio1Repository({
          dbPath
        });
      });
  }

  async getProfileForUser(user) {
    const subscriberKey =
      await this.resolveSubscriberKey(
        user
      );

    if (!subscriberKey) {
      throw new CustomerProfileError(
        'CUSTOMER_PROFILE_NOT_BOUND',
        'No se pudo resolver el perfil autenticado a un suscriptor del dataset.'
      );
    }

    const repository =
      this.repositoryFactory();

    try {
      await repository.open();

      const subscriber =
        await repository.getSubscriber(
          subscriberKey
        );

      if (!subscriber) {
        throw new CustomerProfileError(
          'CUSTOMER_PROFILE_NOT_FOUND',
          'El suscriptor asociado no existe en PLANTA CLIENTES.'
        );
      }

      return toSafeDatasetProfile({
        subscriber,
        user
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

function createDatasetCustomerProfileService(
  options = {}
) {
  return new DatasetCustomerProfileService(
    options
  );
}

module.exports = {
  CustomerProfileError,
  DatasetCustomerProfileService,
  createDatasetCustomerProfileService,
  toSafeDatasetProfile
};
