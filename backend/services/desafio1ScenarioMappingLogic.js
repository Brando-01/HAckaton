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
      'facturacion_clientes',
      'catalogo_ofertas',
      'brainy_reconexiones',
      'notas_credito'
    ],
    objective:
      'Verificar créditos por días suspendidos únicamente cuando línea de tiempo, renta adelantada y monto proporcional reconcilian.'
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
  const exactTimelineNegativeNoteRows =
    asCount(
      diagnostics
        .suspensionExactTimelineNegativeNoteRows
    );
  const raCreditCandidateRows =
    asCount(
      diagnostics
        .suspensionRaCreditCandidateRows
    );
  const verifiedCreditRows =
    asCount(
      diagnostics
        .suspensionVerifiedCreditRows
    );
  const verifiedCreditSubscribers =
    asCount(
      diagnostics
        .suspensionVerifiedCreditSubscribers
    );
  const unreconciledRaRows =
    asCount(
      diagnostics
        .suspensionUnreconciledRaRows
    );

  const verified =
    verifiedCreditRows > 0;

  return {
    id: 'SUSPENSION_ADJUSTMENT',
    label: 'Ajuste por suspensión',
    status:
      verified
        ? 'MAPPED'
        : suspensionOrderRows > 0
          ? 'PARTIAL'
          : 'NOT_MAPPABLE',
    confidence:
      verified
        ? 'HIGH'
        : suspensionOrderRows > 0
          ? 'LOW'
          : 'NONE',
    // Una nota verificada demuestra un crédito por días sin servicio,
    // pero no demuestra que ese importe forme parte del delta entre
    // los totales reconstruidos de FACTURACION. Se publica como
    // hallazgo, no como causa de variación.
    canPromoteToCause: false,
    evidence: {
      suspensionOrderRows,
      suspensionSubscribers,
      explicitSuspensionChargeRows,
      nearbyProportionalInvoices,
      exactTimelineNegativeNoteRows,
      raCreditCandidateRows,
      verifiedCreditRows,
      verifiedCreditSubscribers,
      unreconciledRaRows
    },
    rationale:
      verified
        ? 'Checkpoint 14B confirmó un subconjunto verificable en renta adelantada: la nota negativa empieza el día del corte, termina el día anterior a la reconexión y su importe reconcilia por días contra el cargo neto del periodo facturado. Se habilita como hallazgo de ajuste por suspensión; no se suma automáticamente como causa del cambio entre recibos.'
        : suspensionOrderRows > 0
          ? 'ORDENES confirma eventos de suspensión/corte y existen recibos con proporcionales cercanos en algunos casos, pero sin una nota negativa con línea de tiempo exacta y conciliación monetaria no se afirma un ajuste por días suspendidos.'
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
  const verifiedSuspensionCreditRows =
    asCount(
      diagnostics.suspensionVerifiedCreditRows
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
      verifiedSuspensionCreditRows,
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
        ? 'El dataset presenta patrones de signo muy consistentes por tipo. Checkpoint 14B resolvió únicamente el subconjunto de notas negativas RA que reconcilia exactamente con días de suspensión; la semántica general de CRD/DSC permanece pendiente y ninguna nota se convierte automáticamente en causa del delta del recibo.'
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
      'Checkpoint 14B solo verifica créditos por suspensión cuando coinciden línea de tiempo, renta adelantada y prorrateo monetario del cargo neto.',
      'Una nota de suspensión verificada se conserva como hallazgo y no se suma al delta entre recibos.',
      'La semántica general de CRD/DSC permanece pendiente; no se extrapola desde el subconjunto verificado.'
    ]
  };
}

module.exports = {
  SCENARIO_MAPPING_SCHEMA_VERSION,
  SCENARIO_MAPPING_PHASE,
  TARGET_DEFINITIONS,
  buildScenarioMappingReport
};
