const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBillingHistoryService
} = require(
  '../services/billingHistoryService'
);

test(
  'servicio Fase 14 pide como máximo seis recibos al análisis estructurado',
  async () => {
    const calls = [];

    const analysisService = {
      async open() {},
      async getBillHistory(
        subscriberKey,
        options
      ) {
        calls.push({
          subscriberKey,
          options
        });
        return [
          {
            cycleDate:
              '2026-07-15',
            total: 49.9
          }
        ];
      }
    };

    const service =
      createBillingHistoryService({
        analysisService
      });

    const result =
      await service
        .getHistoryForSubscriber(
          'SUBSCRIBER_TEST'
        );

    assert.equal(
      result.length,
      1
    );
    assert.deepEqual(
      calls,
      [
        {
          subscriberKey:
            'SUBSCRIBER_TEST',
          options: {
            limit: 6
          }
        }
      ]
    );
  }
);

test(
  'servicio inyectado no cierra un análisis que no le pertenece',
  async () => {
    let closes = 0;

    const service =
      createBillingHistoryService({
        analysisService: {
          async open() {},
          async close() {
            closes += 1;
          },
          async getBillHistory() {
            return [];
          }
        }
      });

    await service
      .getHistoryForSubscriber('A');
    await service.close();

    assert.equal(closes, 0);
  }
);
