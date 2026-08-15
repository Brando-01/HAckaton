const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OfficialDemoExperienceService
} = require(
  '../services/officialDemoExperienceService'
);

function createService() {
  const service =
    new OfficialDemoExperienceService({
      explainSubscriber:
        async () => ({}),
      loadHistory:
        async (subscriberKey) => {
          assert.equal(
            subscriberKey,
            'PRIVATE_SUBSCRIBER'
          );

          return [
            {
              invoiceNumber:
                'S7AA-0000000002',
              cycleDate:
                '2026-07-15',
              total: 67.47
            },
            {
              invoiceNumber:
                'S7AA-0000000001',
              cycleDate:
                '2026-06-15',
              total: 62.89
            }
          ];
        }
    });

  service.getBinding = () => ({
    subscriberKey:
      'PRIVATE_SUBSCRIBER'
  });

  return service;
}

test(
  'valida factura solo dentro del historial del perfil autenticado',
  async () => {
    const service = createService();
    const result =
      await service
        .getInvoiceReferenceForUser(
          { customerId: 'CLI000001' },
          's7aa-0000000002'
        );

    assert.deepEqual(
      result,
      {
        status: 'MATCHED',
        reference:
          'S7AA-0000000002',
        position: 'CURRENT',
        period:
          'Ciclo 15/07/2026',
        total: 67.47,
        availableBillCount: 2
      }
    );
  }
);

test(
  'factura ajena o inventada se reporta solo como no encontrada en esta cuenta',
  async () => {
    const service = createService();
    const result =
      await service
        .getInvoiceReferenceForUser(
          { customerId: 'CLI000001' },
          'S7AA-9999999999'
        );

    assert.equal(
      result.status,
      'NOT_FOUND'
    );
    assert.equal(
      result.availableBillCount,
      2
    );
    assert.equal(
      Object.hasOwn(
        result,
        'subscriberKey'
      ),
      false
    );
  }
);
