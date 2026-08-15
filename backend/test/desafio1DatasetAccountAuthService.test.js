const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDatasetAccountAuthService,
  buildAccountIdentity,
  maskServiceNumber,
  getDatasetAccountAuthPolicy
} = require(
  '../services/desafio1DatasetAccountAuthService'
);

function fakeRepository({
  match = true,
  hasBilling = true,
  onClose = null
} = {}) {
  return {
    async open() {},
    async getSubscriberByCustomerAndService(
      customerCode,
      serviceNumber
    ) {
      if (!match) {
        return null;
      }

      assert.equal(
        customerCode,
        '100000001'
      );
      assert.equal(
        serviceNumber,
        '200000002'
      );

      return {
        customerKey:
          '100000001',
        subscriberKey:
          '200000002',
        financialAccount:
          'PRIVATE_ACCOUNT'
      };
    },
    async subscriberHasBilling(
      subscriberKey
    ) {
      assert.equal(
        subscriberKey,
        '200000002'
      );
      return hasBilling;
    },
    async close() {
      if (onClose) {
        onClose();
      }
    }
  };
}

test(
  'valida una pareja exacta COD_CLIENTE + NUM_ANEXO y crea una identidad opaca',
  async () => {
    const service =
      createDatasetAccountAuthService({
        repositoryFactory: () =>
          fakeRepository()
      });

    const result =
      await service.authenticate({
        customerCode:
          '100000001',
        serviceNumber:
          '200000002'
      });

    assert.equal(result.ok, true);
    assert.equal(
      result.user.mode,
      'DATASET'
    );
    assert.equal(
      result.user.customerCode,
      '100000001'
    );
    assert.equal(
      result.user.datasetSubscriberKey,
      '200000002'
    );
    assert.notEqual(
      result.user.customerId,
      '100000001'
    );
    assert.match(
      result.user.customerId,
      /^D1A-/
    );
    assert.equal(
      result.user.serviceNumberMasked,
      '•••••0002'
    );
  }
);

test(
  'una pareja que no pertenece a la misma fila no autentica',
  async () => {
    const service =
      createDatasetAccountAuthService({
        repositoryFactory: () =>
          fakeRepository({
            match: false
          })
      });

    const result =
      await service.authenticate({
        customerCode:
          '100000001',
        serviceNumber:
          '999999999'
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.code,
      'DATASET_ACCOUNT_NOT_FOUND'
    );
  }
);

test(
  'una cuenta sin facturación no se presenta como cuenta utilizable para la demo',
  async () => {
    const service =
      createDatasetAccountAuthService({
        repositoryFactory: () =>
          fakeRepository({
            hasBilling: false
          })
      });

    const result =
      await service.authenticate({
        customerCode:
          '100000001',
        serviceNumber:
          '200000002'
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.code,
      'DATASET_ACCOUNT_WITHOUT_BILLING'
    );
  }
);

test(
  'campos vacíos se rechazan antes de abrir el repositorio',
  async () => {
    let opened = false;

    const service =
      createDatasetAccountAuthService({
        repositoryFactory: () => {
          opened = true;
          return fakeRepository();
        }
      });

    const result =
      await service.authenticate({
        customerCode: '',
        serviceNumber: ''
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.code,
      'DATASET_ACCOUNT_FIELDS_REQUIRED'
    );
    assert.equal(opened, false);
  }
);

test(
  'el repositorio se cierra después de la validación',
  async () => {
    let closed = false;

    const service =
      createDatasetAccountAuthService({
        repositoryFactory: () =>
          fakeRepository({
            onClose: () => {
              closed = true;
            }
          })
      });

    await service.authenticate({
      customerCode:
        '100000001',
      serviceNumber:
        '200000002'
    });

    assert.equal(closed, true);
  }
);

test(
  'la identidad opaca es estable por pareja pero cambia entre servicios',
  () => {
    const a = buildAccountIdentity({
      customerCode: '100',
      serviceNumber: '200'
    });
    const b = buildAccountIdentity({
      customerCode: '100',
      serviceNumber: '200'
    });
    const c = buildAccountIdentity({
      customerCode: '100',
      serviceNumber: '201'
    });

    assert.deepEqual(a, b);
    assert.notEqual(
      a.customerId,
      c.customerId
    );
  }
);

test(
  'la política deja claro que los identificadores son de demo y no secretos productivos',
  () => {
    const policy =
      getDatasetAccountAuthPolicy();

    assert.equal(
      policy.customerCodeField,
      'COD_CLIENTE'
    );
    assert.equal(
      policy.serviceNumberField,
      'NUM_ANEXO'
    );
    assert.equal(
      policy.exactPairRequired,
      true
    );
    assert.equal(
      policy.identifiersAreProductionSecrets,
      false
    );
    assert.equal(
      policy.subscriberKeyExposedToBrowser,
      false
    );
    assert.equal(
      maskServiceNumber(
        '200000002'
      ),
      '•••••0002'
    );
  }
);
