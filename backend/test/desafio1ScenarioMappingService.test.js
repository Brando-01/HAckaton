const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDesafio1ScenarioMappingService
} = require(
  '../services/desafio1ScenarioMappingService'
);

function fakeRow(sql) {
  const normalized =
    String(sql).toLowerCase();

  if (
    normalized.includes(
      'packagebillingrows'
    )
  ) {
    return {
      packageBillingRows: 11676,
      packageBillingSubscribers: 2113,
      packageBillingCodes: 61,
      packageOneShotRows: 1276,
      packageRecurringRows: 118
    };
  }

  if (
    normalized.includes(
      'packageorderrows'
    )
  ) {
    return {
      packageOrderRows: 153
    };
  }

  if (
    normalized.includes(
      'explicitequipmentchargerows'
    )
  ) {
    return {
      explicitEquipmentChargeRows: 0,
      financingKeywordRows: 1064,
      financingDebtRows: 1064,
      equipmentSubgroupRows: 367
    };
  }

  if (
    normalized.includes(
      'equipmentorderrows'
    )
  ) {
    return {
      equipmentOrderRows: 763
    };
  }

  if (
    normalized.includes(
      'additionaltrafficrows'
    )
  ) {
    return {
      additionalTrafficRows: 1879,
      additionalTrafficSubscribers: 334,
      additionalRoamingRows: 39,
      additionalRoamingSubscribers: 27,
      additionalRecurringServiceRows: 18,
      additionalOtherUniqueRows: 90
    };
  }

  if (
    normalized.includes(
      'suspensionorderrows'
    )
  ) {
    return {
      suspensionOrderRows: 15000,
      suspensionSubscribers: 3000,
      explicitSuspensionChargeRows: 0
    };
  }

  if (
    normalized.includes(
      'suspensionnearbyproportionalinvoices'
    )
  ) {
    return {
      suspensionNearbyProportionalInvoices:
        500
    };
  }

  if (
    normalized.includes(
      'adjustmentnoterows'
    )
  ) {
    return {
      adjustmentNoteRows: 8861,
      adjustmentCrdRows: 8154,
      adjustmentDscRows: 707,
      adjustmentCrdNegativeRows: 8154,
      adjustmentDscPositiveRows: 707
    };
  }

  if (
    normalized.includes(
      'adjustmentmatchedsubscribercoderows'
    )
  ) {
    return {
      adjustmentMatchedSubscriberCodeRows:
        7000,
      adjustmentMatchedSameCycleRows:
        6000
    };
  }

  return {};
}

test(
  'el servicio Fase 12 solo devuelve agregados y cierra el repositorio',
  async () => {
    const calls = {
      open: 0,
      close: 0,
      get: 0,
      all: 0
    };

    const repository = {
      async open() {
        calls.open += 1;
      },
      async close() {
        calls.close += 1;
      },
      async get(sql) {
        calls.get += 1;
        return fakeRow(sql);
      },
      async all() {
        calls.all += 1;
        return [
          {
            chargeCode: 'PKG_TEST',
            description:
              'Paquete de prueba',
            classification:
              'Cargo Unico Paquete',
            group: 'PAQUETES',
            subgroup: 'PAQUETES',
            rows: 10
          }
        ];
      }
    };

    const service =
      createDesafio1ScenarioMappingService({
        repositoryFactory() {
          return repository;
        }
      });

    const report =
      await service.buildReport({
        force: true
      });

    assert.equal(calls.open, 1);
    assert.equal(calls.close, 1);
    assert.ok(calls.get >= 9);
    assert.ok(calls.all >= 3);
    assert.equal(
      report.phase,
      'PHASE_12'
    );
    assert.equal(
      report.summary.targets,
      5
    );
    assert.doesNotMatch(
      JSON.stringify(report),
      /subscriberKey|customerKey|financialAccount|phoneHash|documentNumber/
    );
  }
);
