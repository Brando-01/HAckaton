const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TARGET_DEFINITIONS,
  buildScenarioMappingReport
} = require(
  '../services/desafio1ScenarioMappingLogic'
);

test(
  'Fase 12 audita exactamente los cinco huecos funcionales priorizados',
  () => {
    assert.deepEqual(
      TARGET_DEFINITIONS.map(
        (item) => item.id
      ),
      [
        'PACKAGES',
        'FINANCED_EQUIPMENT',
        'ADDITIONAL_CHARGES',
        'SUSPENSION_ADJUSTMENT',
        'ADJUSTMENT_NOTES'
      ]
    );
  }
);

test(
  'paquetes queda mapeado cuando FACTURACION trae marcadores estructurados directos',
  () => {
    const report =
      buildScenarioMappingReport({
        packageBillingRows: 11676,
        packageBillingCodes: 61,
        packageBillingSubscribers: 2113,
        packageOneShotRows: 1276,
        packageRecurringRows: 118,
        packageOrderRows: 153
      });

    const packages =
      report.mappings.find(
        (mapping) =>
          mapping.id === 'PACKAGES'
      );

    assert.equal(
      packages.status,
      'MAPPED'
    );
    assert.equal(
      packages.confidence,
      'HIGH'
    );
    assert.equal(
      packages.canPromoteToCause,
      true
    );
  }
);

test(
  'financiamiento de deuda y órdenes de equipo no se confunden con cuota de equipo financiado',
  () => {
    const report =
      buildScenarioMappingReport({
        explicitEquipmentChargeRows: 0,
        financingKeywordRows: 1064,
        financingDebtRows: 1064,
        equipmentSubgroupRows: 367,
        equipmentOrderRows: 763
      });

    const equipment =
      report.mappings.find(
        (mapping) =>
          mapping.id ===
          'FINANCED_EQUIPMENT'
      );

    assert.equal(
      equipment.status,
      'AMBIGUOUS'
    );
    assert.equal(
      equipment.canPromoteToCause,
      false
    );
    assert.match(
      equipment.rationale,
      /no identifican inequívocamente/i
    );
  }
);

test(
  'cargos adicionales distingue señales explícitas sin fingir una categoría causal única',
  () => {
    const report =
      buildScenarioMappingReport({
        additionalTrafficRows: 1879,
        additionalTrafficSubscribers: 334,
        additionalRoamingRows: 39,
        additionalRoamingSubscribers: 27,
        additionalRecurringServiceRows: 18,
        additionalOtherUniqueRows: 93
      });

    const charges =
      report.mappings.find(
        (mapping) =>
          mapping.id ===
          'ADDITIONAL_CHARGES'
      );

    assert.equal(
      charges.status,
      'PARTIAL'
    );
    assert.equal(
      charges.confidence,
      'HIGH'
    );
    assert.equal(
      charges.canPromoteToCause,
      false
    );
  }
);

test(
  'suspensión permanece parcial si solo coexisten eventos y proporcionales cercanos',
  () => {
    const report =
      buildScenarioMappingReport({
        suspensionOrderRows: 16000,
        suspensionSubscribers: 3000,
        explicitSuspensionChargeRows: 0,
        suspensionNearbyProportionalInvoices: 900
      });

    const suspension =
      report.mappings.find(
        (mapping) =>
          mapping.id ===
          'SUSPENSION_ADJUSTMENT'
      );

    assert.equal(
      suspension.status,
      'PARTIAL'
    );
    assert.equal(
      suspension.canPromoteToCause,
      false
    );
    assert.match(
      suspension.rationale,
      /no demuestra por sí sola/i
    );
  }
);

test(
  'notas conserva la semántica pendiente aunque el patrón de signos sea perfecto',
  () => {
    const report =
      buildScenarioMappingReport({
        adjustmentNoteRows: 8861,
        adjustmentCrdRows: 8154,
        adjustmentDscRows: 707,
        adjustmentCrdNegativeRows: 8154,
        adjustmentDscPositiveRows: 707,
        adjustmentMatchedSubscriberCodeRows: 8000,
        adjustmentMatchedSameCycleRows: 7000
      });

    const notes =
      report.mappings.find(
        (mapping) =>
          mapping.id ===
          'ADJUSTMENT_NOTES'
      );

    assert.equal(
      notes.status,
      'SEMANTICS_PENDING'
    );
    assert.equal(
      notes.evidence.crdNegativePct,
      100
    );
    assert.equal(
      notes.evidence.dscPositivePct,
      100
    );
    assert.equal(
      notes.canPromoteToCause,
      false
    );
  }
);
