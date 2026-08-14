const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDatasetCustomerProfileService,
  toSafeDatasetProfile
} = require(
  '../services/desafio1CustomerProfileService'
);

test(
  'expone solo datos de perfil útiles y oculta claves técnicas del dataset',
  () => {
    const result =
      toSafeDatasetProfile({
        user: {
          mode: 'EXPLORER',
          customerId:
            'EXP_DEMO000001',
          explorerDemoId:
            'DEMO000001'
        },
        subscriber: {
          customerKey: 'TEST-CUSTOMER-001',
          subscriberKey:
            'TEST-SUBSCRIBER-001',
          financialAccount:
            'TEST-ACCOUNT-001',
          phoneHash:
            'HASH_PRIVADO',
          activationDate:
            '2020-08-01 15:22:00',
          billingCycleDay: 9,
          lobType: 'WRLS',
          businessType: 'MOVIL'
        }
      });

    assert.equal(
      result.visibleId,
      'DEMO000001'
    );
    assert.equal(
      result.customerCode,
      'TEST-CUSTOMER-001'
    );
    assert.equal(
      result.activationDate,
      '2020-08-01 15:22:00'
    );
    assert.equal(
      result.billingCycleDay,
      9
    );
    assert.equal(
      result.lobType,
      'WRLS'
    );
    assert.equal(
      result.businessType,
      'MOVIL'
    );

    const serialized =
      JSON.stringify(result);

    assert.doesNotMatch(
      serialized,
      /TEST-SUBSCRIBER-001|TEST-ACCOUNT-001|HASH_PRIVADO/
    );
    assert.equal(
      Object.hasOwn(result, 'subscriberKey'),
      false
    );
    assert.equal(
      Object.hasOwn(result, 'financialAccount'),
      false
    );
    assert.equal(
      Object.hasOwn(result, 'phoneHash'),
      false
    );
  }
);

test(
  'consulta PLANTA por la clave privada resuelta y devuelve un perfil seguro',
  async () => {
    const calls = [];

    const repository = {
      async open() {
        calls.push('open');
      },
      async getSubscriber(
        subscriberKey
      ) {
        calls.push(
          `get:${subscriberKey}`
        );

        return {
          customerKey: 'TEST-CUSTOMER-002',
          subscriberKey,
          financialAccount:
            'SECRET_ACCOUNT',
          activationDate:
            '2022-02-18 00:00:00',
          billingCycleDay: 17,
          lobType: 'TV',
          businessType:
            'MT/CONVERGENTE'
        };
      },
      async close() {
        calls.push('close');
      }
    };

    const service =
      createDatasetCustomerProfileService({
        resolveSubscriberKey:
          async (user) => {
            assert.equal(
              user.customerId,
              'EXP_DEMO000123'
            );
            return 'PRIVATE_SUBSCRIBER';
          },
        repositoryFactory:
          () => repository
      });

    const result =
      await service.getProfileForUser({
        mode: 'EXPLORER',
        customerId:
          'EXP_DEMO000123',
        explorerDemoId:
          'DEMO000123'
      });

    assert.deepEqual(
      calls,
      [
        'open',
        'get:PRIVATE_SUBSCRIBER',
        'close'
      ]
    );
    assert.equal(
      result.customerCode,
      'TEST-CUSTOMER-002'
    );
    assert.equal(
      result.visibleId,
      'DEMO000123'
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /PRIVATE_SUBSCRIBER|SECRET_ACCOUNT/
    );
  }
);
