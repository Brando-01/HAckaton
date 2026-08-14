const SCENARIO_MAPPING_SCHEMA_VERSION =
  'desafio1-scenario-mapping-v1';

const SCENARIO_MAPPING_PHASE =
  'PHASE_12';

const TARGET_DEFINITIONS = Object.freeze([
  {
    id: 'PACKAGES',
    label: 'Paquetes adicionales',
    expectedSources: [
      'facturacion_clientes',
      'ordenes'
    ],
    objective:
      'Identificar cargos de paquetes sin depender de palabras generadas por IA.'
  },
  {
    id: 'FINANCED_EQUIPMENT',
    label: 'Cuota de equipo financiado',
    expectedSources: [
      'facturacion_clientes',
      'ordenes',
      'brainy_descuentos_cuotas'
    ],
    objective:
      'Encontrar un marcador inequívoco de cuota de equipo antes de convertirla en causa financiera.'
  },
  {
    id: 'ADDITIONAL_CHARGES',
    label: 'Otros cargos adicionales',
    expectedSources: [
      'facturacion_clientes'
    ],
    objective:
      'Separar cargos adicionales explícitos de categorías demasiado amplias para inferir una causa.'
  },
  {
    id: 'SUSPENSION_ADJUSTMENT',
    label: 'Ajuste por suspensión',
    expectedSources: [
      'ordenes',
      'facturacion_clientes',
      'brainy_prorrateo'
    ],
    objective:
      'Medir la evidencia disponible de suspensión y su cercanía con cargos proporcionales sin asumir causalidad.'
  },
  {
    id: 'ADJUSTMENT_NOTES',
    label: 'Notas de crédito/débito',
    expectedSources: [
      'notas_credito',
      'facturacion_clientes'
    ],
    objective:
      'Caracterizar tipos, signos y cruces de las notas antes de asignarles semántica causal.'
  }
]);

function asCount(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.max(0, Math.trunc(number))
    : 0;
}

function asPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, number)
  );
}

function normalizePatterns(
  patterns = []
) {
  return patterns
    .map(
      (pattern) => ({
        chargeCode:
          String(
            pattern?.chargeCode || ''
          ).trim() || null,
        description:
          String(
            pattern?.description || ''
          ).trim() || null,
        classification:
          String(
            pattern?.classification || ''
          ).trim() || null,
        group:
          String(
            pattern?.group || ''
          ).trim() || null,
        subgroup:
          String(
            pattern?.subgroup || ''
          ).trim() || null,
        rows:
          asCount(pattern?.rows)
      })
    )
    .filter(
      (pattern) =>
        pattern.rows > 0
    )
    .slice(0, 8);
}

function packageMapping(
  diagnostics = {}
) {
  const billingRows =
    asCount(
      diagnostics.packageBillingRows
    );
  const billingCodes =
    asCount(
      diagnostics.packageBillingCodes
    );
  const billingSubscribers =
    asCount(
      diagnostics.packageBillingSubscribers
    );
  const packageOrderRows =
    asCount(
      diagnostics.packageOrderRows
    );

  const mapped =
    billingRows > 0 &&
    billingCodes > 0;

  return {
    id: 'PACKAGES',
    label: 'Paquetes adicionales',
    status:
      mapped
        ? 'MAPPED'
        : 'NOT_MAPPABLE',
    confidence:
      mapped
        ? 'HIGH'
        : 'NONE',
    canPromoteToCause:
      mapped,
    evidence: {
      billingRows,
      billingCodes,
      billingSubscribers,
      oneShotRows:
        asCount(
          diagnostics.packageOneShotRows
        ),
      recurringRows:
        asCount(
          diagnostics.packageRecurringRows
        ),
      packageOrderRows
    },
    rationale:
      mapped
        ? 'FACTURACION contiene marcadores explícitos de paquetes (GRUPO/CLASIFICACION) y existen órdenes específicas de activación o afiliación. En la siguiente fase aún debe reconciliarse el delta monetario antes de afirmar que un paquete causó una variación.'
        : 'No se encontraron marcadores estructurados suficientes para distinguir paquetes de otros cargos.',
    patterns:
      normalizePatterns(
        diagnostics.packagePatterns
      )
  };
}

function financedEquipmentMapping(
  diagnostics = {}
) {
  const explicitEquipmentChargeRows =
    asCount(
      diagnostics
        .explicitEquipmentChargeRows
    );
  const financingKeywordRows =
    asCount(
      diagnostics.financingKeywordRows
    );
  const financingDebtRows =
    asCount(
      diagnostics.financingDebtRows
    );
  const equipmentOrderRows =
    asCount(
      diagnostics.equipmentOrderRows
    );
  const equipmentSubgroupRows =
    asCount(
      diagnostics.equipmentSubgroupRows
    );

  const unequivocal =
    explicitEquipmentChargeRows > 0;

  const hasAmbiguousSignals =
    financingKeywordRows > 0 ||
    financingDebtRows > 0 ||
    equipmentOrderRows > 0 ||
    equipmentSubgroupRows > 0;

  return {
    id: 'FINANCED_EQUIPMENT',
    label: 'Cuota de equipo financiado',
    status:
      unequivocal
        ? 'MAPPED'
        : hasAmbiguousSignals
          ? 'AMBIGUOUS'
          : 'NOT_MAPPABLE',
    confidence:
      unequivocal
        ? 'MEDIUM'
        : 'NONE',
    canPromoteToCause: false,
    evidence: {
      explicitEquipmentChargeRows,
      financingKeywordRows,
      financingDebtRows,
      equipmentSubgroupRows,
      equipmentOrderRows
    },
    rationale:
      unequivocal
        ? 'Existen descripciones de facturación que mencionan explícitamente equipo/cuota, pero Fase 12 no las convierte todavía en causa: falta validar el código y reconciliar el monto.'
        : hasAmbiguousSignals
          ? 'Hay señales relacionadas con financiamiento o equipo, pero no identifican inequívocamente una cuota de equipo financiado. Por ejemplo, un cargo de financiamiento puede corresponder a financiamiento de deuda y un subgrupo EQUIPOS puede representar equipamiento fijo/adicional.'
          : 'Los archivos importados no contienen un marcador detectable de cuota de equipo financiado.',
    patterns:
      normalizePatterns(
        diagnostics.financingPatterns
      )
  };
}

function additionalChargesMapping(
  diagnostics = {}
) {
  const trafficRows =
    asCount(
      diagnostics.additionalTrafficRows
    );
  const roamingRows =
    asCount(
      diagnostics.additionalRoamingRows
    );
  const recurringServiceRows =
    asCount(
      diagnostics.additionalRecurringServiceRows
    );
  const otherUniqueRows =
    asCount(
      diagnostics.additionalOtherUniqueRows
    );

  const explicitRows =
    trafficRows +
    roamingRows +
    recurringServiceRows;

  return {
    id: 'ADDITIONAL_CHARGES',
    label: 'Otros cargos adicionales',
    status:
      explicitRows > 0
        ? 'PARTIAL'
        : 'NOT_MAPPABLE',
    confidence:
      explicitRows > 0
        ? 'HIGH'
        : 'NONE',
    canPromoteToCause: false,
    evidence: {
      trafficRows,
      trafficSubscribers:
        asCount(
          diagnostics.additionalTrafficSubscribers
        ),
      roamingRows,
      roamingSubscribers:
        asCount(
          diagnostics.additionalRoamingSubscribers
        ),
      recurringServiceRows,
      otherUniqueRows
    },
    rationale:
      explicitRows > 0
        ? 'TRAFICO ADICIONAL y ROAMING están etiquetados explícitamente y pueden tratarse como subtipos verificables. La categoría general “otros cargos adicionales” permanece parcial porque incluye cargos heterogéneos que no deben compartir una sola regla causal.'
        : 'No se encontraron categorías explícitas suficientes para separar cargos adicionales.',
    patterns:
      normalizePatterns(
        diagnostics.additionalChargePatterns
      )
  };
}

function suspensionMapping(
  diagnostics = {}
) {
  const suspensionOrderRows =
    asCount(
      diagnostics.suspensionOrderRows
    );
  const suspensionSubscribers =
    asCount(
      diagnostics.suspensionSubscribers
    );
  const explicitSuspensionChargeRows =
    asCount(
      diagnostics
        .explicitSuspensionChargeRows
    );
  const nearbyProportionalInvoices =
    asCount(
      diagnostics
        .suspensionNearbyProportionalInvoices
    );

  const mapped =
    explicitSuspensionChargeRows > 0;

  return {
    id: 'SUSPENSION_ADJUSTMENT',
    label: 'Ajuste por suspensión',
    status:
      mapped
        ? 'MAPPED'
        : suspensionOrderRows > 0
          ? 'PARTIAL'
          : 'NOT_MAPPABLE',
    confidence:
      mapped
        ? 'MEDIUM'
        : suspensionOrderRows > 0
          ? 'LOW'
          : 'NONE',
    canPromoteToCause: false,
    evidence: {
      suspensionOrderRows,
      suspensionSubscribers,
      explicitSuspensionChargeRows,
      nearbyProportionalInvoices
    },
    rationale:
      mapped
        ? 'Existe un cargo explícitamente marcado como ajuste por suspensión, pero todavía debe reconciliarse temporal y monetariamente antes de usarlo como causa.'
        : suspensionOrderRows > 0
          ? 'ORDENES confirma eventos de suspensión/corte y existen recibos con proporcionales cercanos en algunos casos, pero la coexistencia temporal no demuestra por sí sola que el proporcional sea un ajuste por días suspendidos.'
          : 'No se encontraron eventos suficientes para mapear suspensión.',
    patterns: []
  };
}

function adjustmentNotesMapping(
  diagnostics = {}
) {
  const totalRows =
    asCount(
      diagnostics.adjustmentNoteRows
    );
  const crdRows =
    asCount(
      diagnostics.adjustmentCrdRows
    );
  const dscRows =
    asCount(
      diagnostics.adjustmentDscRows
    );
  const crdNegativeRows =
    asCount(
      diagnostics.adjustmentCrdNegativeRows
    );
  const dscPositiveRows =
    asCount(
      diagnostics.adjustmentDscPositiveRows
    );
  const matchedSubscriberCodeRows =
    asCount(
      diagnostics
        .adjustmentMatchedSubscriberCodeRows
    );
  const matchedSameCycleRows =
    asCount(
      diagnostics.adjustmentMatchedSameCycleRows
    );

  const crdNegativePct =
    crdRows
      ? (100 * crdNegativeRows) /
        crdRows
      : 0;
  const dscPositivePct =
    dscRows
      ? (100 * dscPositiveRows) /
        dscRows
      : 0;

  return {
    id: 'ADJUSTMENT_NOTES',
    label: 'Notas de crédito/débito',
    status:
      totalRows > 0
        ? 'SEMANTICS_PENDING'
        : 'NOT_MAPPABLE',
    confidence:
      totalRows > 0
        ? 'MEDIUM'
        : 'NONE',
    canPromoteToCause: false,
    evidence: {
      totalRows,
      crdRows,
      dscRows,
      crdNegativePct:
        Number(
          crdNegativePct.toFixed(2)
        ),
      dscPositivePct:
        Number(
          dscPositivePct.toFixed(2)
        ),
      matchedSubscriberCodeRows,
      matchedSameCycleRows,
      matchedSameCyclePct:
        totalRows
          ? Number(
              (
                100 *
                matchedSameCycleRows /
                totalRows
              ).toFixed(2)
            )
          : 0
    },
    rationale:
      totalRows > 0
        ? 'El dataset presenta patrones de signo muy consistentes por tipo y puede cruzarse con facturación, pero CRD/DSC no se convierten en una semántica financiera asumida. La definición de negocio debe confirmarse antes de usar una nota como causa.'
        : 'No hay notas disponibles para caracterizar.',
    patterns: []
  };
}

function buildScenarioMappingReport(
  diagnostics = {}
) {
  const mappings = [
    packageMapping(diagnostics),
    financedEquipmentMapping(
      diagnostics
    ),
    additionalChargesMapping(
      diagnostics
    ),
    suspensionMapping(diagnostics),
    adjustmentNotesMapping(
      diagnostics
    )
  ];

  const counts =
    mappings.reduce(
      (accumulator, mapping) => {
        accumulator[
          mapping.status
        ] = (
          accumulator[
            mapping.status
          ] || 0
        ) + 1;
        return accumulator;
      },
      {}
    );

  return {
    schemaVersion:
      SCENARIO_MAPPING_SCHEMA_VERSION,
    phase:
      SCENARIO_MAPPING_PHASE,
    generatedAt:
      new Date().toISOString(),
    summary: {
      targets:
        TARGET_DEFINITIONS.length,
      mapped:
        counts.MAPPED || 0,
      partial:
        counts.PARTIAL || 0,
      ambiguous:
        counts.AMBIGUOUS || 0,
      semanticsPending:
        counts.SEMANTICS_PENDING || 0,
      notMappable:
        counts.NOT_MAPPABLE || 0,
      promotableNow:
        mappings.filter(
          (mapping) =>
            mapping.canPromoteToCause
        ).length
    },
    mappings,
    safeguards: [
      'El mapeo usa únicamente consultas agregadas sobre desafio1.db.',
      'Ningún resultado público incluye SUBSCRIBER_KEY, NUM_ANEXO, CUSTOMER_KEY, cuentas financieras, teléfonos o documentos.',
      'Una coincidencia de texto o una coocurrencia temporal no se convierte automáticamente en causa financiera.',
      'Fase 13 solo podrá promover un mapeo cuando el delta monetario pueda reconciliarse y la semántica sea inequívoca.'
    ]
  };
}

module.exports = {
  SCENARIO_MAPPING_SCHEMA_VERSION,
  SCENARIO_MAPPING_PHASE,
  TARGET_DEFINITIONS,
  buildScenarioMappingReport
};
