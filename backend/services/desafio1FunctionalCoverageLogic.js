const FUNCTIONAL_COVERAGE_SCHEMA_VERSION =
  'desafio1-functional-coverage-v1';

const FUNCTIONAL_COVERAGE_PHASE =
  'PHASE_11';

const SOURCE_DEFINITIONS = Object.freeze([
  {
    key: 'planta_clientes',
    label: 'PLANTA CLIENTES',
    role: 'Perfil del servicio y ancla de suscripción',
    usage: 'CORE',
    capabilities: [
      'PROFILE',
      'SUBSCRIBER_ANCHOR',
      'BILLING_CYCLE'
    ]
  },
  {
    key: 'facturacion_clientes',
    label: 'FACTURACION-CLIENTES',
    role: 'Recibos, conceptos, importes, periodos y producto',
    usage: 'CORE',
    capabilities: [
      'BILLING',
      'PRODUCT',
      'COMPARISON',
      'BILLING_HISTORY',
      'CHARGE_PERIOD',
      'PACKAGE_CHARGE'
    ]
  },
  {
    key: 'ordenes',
    label: 'ORDENES',
    role: 'Eventos del servicio y evidencia de cambios',
    usage: 'EVIDENCE',
    capabilities: [
      'PLAN_CHANGE',
      'SERVICE_EVENTS',
      'SUSPENSION_CONTEXT',
      'SUSPENSION_EVENT',
      'PACKAGE_ORDER'
    ]
  },
  {
    key: 'catalogo_ofertas',
    label: 'CATALOGO-OFERTAS',
    role: 'Tipo de renta y referencia de códigos/tarifas',
    usage: 'REFERENCE',
    capabilities: [
      'RENT_TYPE',
      'CHARGE_REFERENCE'
    ]
  },
  {
    key: 'brainy_descuentos_cuotas',
    label: 'DESCUENTOS Y CUOTAS',
    role: 'Evidencia de promociones y descuentos',
    usage: 'EVIDENCE',
    capabilities: [
      'ACTIVE_DISCOUNT',
      'DISCOUNT_ENDED',
      'DISCOUNT_REMOVED'
    ]
  },
  {
    key: 'brainy_prorrateo',
    label: 'PRORRATEOS',
    role: 'Monto y periodo de cargos proporcionales',
    usage: 'EVIDENCE',
    capabilities: [
      'PRORATION'
    ]
  },
  {
    key: 'brainy_reconexiones',
    label: 'RECONEXIONES',
    role: 'Evidencia de corte, reconexión y cargo asociado',
    usage: 'EVIDENCE',
    capabilities: [
      'RECONNECTION',
      'SUSPENSION_WINDOW'
    ]
  },
  {
    key: 'notas_credito',
    label: 'NOTAS DE CRÉDITO/DÉBITO',
    role: 'Notas financieras y créditos verificables de suspensión',
    usage: 'EVIDENCE',
    capabilities: [
      'ADJUSTMENT_NOTE_CONTEXT',
      'SUSPENSION_ADJUSTMENT'
    ]
  }
]);

const CONFIRMED_DATA_RULES = Object.freeze([
  {
    id: 'SUBSCRIBER_CANONICAL_JOIN',
    label: 'Cruce por suscripción',
    detail:
      'NUM_ANEXO en PLANTA representa la suscripción y se usa como SUBSCRIBER_KEY para relacionar la información del servicio. COD_CLIENTE puede agrupar varias suscripciones.'
  },
  {
    id: 'BILLING_CYCLE_DAY',
    label: 'Ciclo como día',
    detail:
      'El ciclo de PLANTA se interpreta como el día de cierre/facturación del servicio.'
  },
  {
    id: 'PRODUCT_DESCRIPTION',
    label: 'Descripción del producto',
    detail:
      'CHARGE_CODE_DESC contiene la información del producto/concepto facturado y se conserva como dato fuente.'
  },
  {
    id: 'BILLING_PERIOD_FIELDS_V2',
    label: 'Periodo de FACTURACION',
    detail:
      'La versión corregida de FACTURACION aporta PERIOD_START_DATE y PERIOD_END_DATE utilizables en la mayoría de cargos. El valor 2222-01-01 se trata como sentinel técnico y se normaliza a no disponible.'
  },
  {
    id: 'BILLING_DEBT_FIELD_UNAVAILABLE_V2',
    label: 'Estado de deuda no disponible en FACTURACION v2',
    detail:
      'La versión actualizada ya no incluye DEUDA ni FECHA-VENCIMIENTO. El prototipo no infiere deuda ni vencimiento a partir de montos, ciclos u otros campos.'
  },
  {
    id: 'BILLING_SUBSCRIBER_DUPLICATE_CHECK_V2',
    label: 'Validación de suscripción duplicada',
    detail:
      'SUBSCRIBER_KEY_1 se usa solo como control de consistencia durante la importación y debe coincidir con SUBSCRIBER_KEY; no se persiste ni se expone.'
  },
  {
    id: 'SUSPENSION_RA_CREDIT_RECONCILIATION',
    label: 'Crédito verificable por suspensión en RA',
    detail:
      'Checkpoint 14B reconoce un ajuste solo cuando una nota negativa de renta adelantada empieza el día del corte, termina el día anterior a la reconexión y su importe reconcilia por días contra CHARGE_NET_AMOUNT del periodo facturado. Se publica como hallazgo y no se suma al delta entre recibos.'
  }
]);

const SCENARIO_DEFINITIONS = Object.freeze([
  {
    id: 'CUSTOMER_PROFILE',
    label: 'Perfil del servicio',
    sourceKeys: [
      'planta_clientes'
    ],
    status: 'READY',
    detail:
      'Lucía puede consultar ciclo, activación, tipo de servicio y otros atributos disponibles del perfil.'
  },
  {
    id: 'BILL_COMPARISON',
    label: 'Recibo y comparación',
    sourceKeys: [
      'facturacion_clientes',
      'catalogo_ofertas'
    ],
    status: 'READY',
    detail:
      'Se reconstruye el recibo actual y el anterior con importes estructurados y sin cálculo monetario generativo.'
  },
  {
    id: 'BILLING_HISTORY',
    label: 'Histórico de hasta cinco recibos previos',
    sourceKeys: [
      'facturacion_clientes'
    ],
    status: 'READY',
    detail:
      'Fase 14 recupera el recibo actual y hasta cinco anteriores por suscripción, calcula tendencias y recurrencia de cargos con importes estructurados y sin delegar cálculos al LLM.'
  },
  {
    id: 'RENT_TYPE',
    label: 'Renta adelantada / vencida',
    sourceKeys: [
      'catalogo_ofertas',
      'facturacion_clientes'
    ],
    status: 'READY',
    detail:
      'El tipo de renta se obtiene del catálogo cuando el código queda resuelto; las reglas de negocio se aplican de forma determinista.'
  },
  {
    id: 'DISCOUNTS',
    label: 'Descuentos y promociones',
    sourceKeys: [
      'brainy_descuentos_cuotas',
      'facturacion_clientes'
    ],
    status: 'READY',
    detail:
      'Se reconocen descuentos activos, finalizados o retirados únicamente cuando existe evidencia reconciliable.'
  },
  {
    id: 'PRORATION',
    label: 'Prorrateos',
    sourceKeys: [
      'brainy_prorrateo',
      'facturacion_clientes'
    ],
    status: 'READY',
    detail:
      'El monto proporcional se contrasta con el recibo antes de presentarlo como hallazgo.'
  },
  {
    id: 'RECONNECTION',
    label: 'Corte y reconexión',
    sourceKeys: [
      'brainy_reconexiones',
      'facturacion_clientes',
      'ordenes'
    ],
    status: 'READY',
    detail:
      'La reconexión se explica con evidencia del evento y del cargo facturado, evitando duplicar eventos equivalentes.'
  },
  {
    id: 'PLAN_CHANGE',
    label: 'Cambio de plan',
    sourceKeys: [
      'ordenes',
      'facturacion_clientes'
    ],
    status: 'READY',
    detail:
      'Se exige evidencia explícita del cambio y coherencia con el nuevo cargo; no se interpreta cualquier orden genérica como cambio de plan.'
  },
  {
    id: 'PACKAGES',
    label: 'Paquetes adicionales',
    sourceKeys: [
      'facturacion_clientes',
      'ordenes'
    ],
    status: 'READY',
    detail:
      'Fase 13 reconoce únicamente conceptos marcados estructuralmente como paquete y asigna como causa solo el delta monetario del cargo; las órdenes de paquete se conservan como soporte adicional cuando existen.'
  },
  {
    id: 'ADJUSTMENT_NOTES',
    label: 'Notas de crédito/débito',
    sourceKeys: [
      'notas_credito',
      'facturacion_clientes'
    ],
    status: 'CONTEXT_ONLY',
    detail:
      'Las notas se preservan como contexto. Checkpoint 14B solo resuelve el subconjunto negativo RA conciliado con una suspensión; la semántica general de CRD/DSC permanece pendiente y no se convierte automáticamente en causa.'
  },
  {
    id: 'SUSPENSION_ADJUSTMENT',
    label: 'Ajuste por suspensión',
    sourceKeys: [
      'facturacion_clientes',
      'catalogo_ofertas',
      'brainy_reconexiones',
      'notas_credito'
    ],
    status: 'READY',
    detail:
      'Checkpoint 14B verifica únicamente créditos de renta adelantada cuya nota negativa coincide exactamente con corte→día anterior a reconexión y cuyo importe reconcilia por días contra el cargo neto facturado. Se muestra como hallazgo verificable y nunca se suma automáticamente como causa de la variación.'
  },
  {
    id: 'FINANCED_EQUIPMENT',
    label: 'Cuota de equipo financiado',
    sourceKeys: [
      'facturacion_clientes',
      'brainy_descuentos_cuotas'
    ],
    status: 'PENDING_MAPPING',
    detail:
      'Los materiales de negocio confirman que la cuota puede aparecer en el recibo/Brainy, pero todavía falta identificar de forma inequívoca el campo o código correspondiente en los archivos entregados.'
  }
]);

const STATUS_PRIORITY = Object.freeze({
  READY: 1,
  CONTEXT_ONLY: 2,
  PARTIAL: 3,
  PENDING_MAPPING: 4,
  SOURCE_MISSING: 5
});

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.trunc(number))
    : 0;
}

function normalizeMetric(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : 0;
}

function buildSourceIndex(
  importMetadata = []
) {
  const map = new Map();

  for (const item of importMetadata) {
    const key = String(
      item?.datasetKey || ''
    ).trim();

    if (!key) {
      continue;
    }

    map.set(key, item);
  }

  return map;
}

function buildSources(
  importMetadata = []
) {
  const metadataByKey =
    buildSourceIndex(importMetadata);

  return SOURCE_DEFINITIONS.map(
    (definition) => {
      const metadata =
        metadataByKey.get(
          definition.key
        );

      const importedRows =
        normalizeCount(
          metadata?.importedRows
        );

      return {
        ...definition,
        imported:
          Boolean(metadata) &&
          importedRows > 0,
        importedRows,
        parseWarningCount:
          normalizeCount(
            metadata
              ?.parseWarningCount
          )
      };
    }
  );
}

function scenarioStatusForSources(
  definition,
  importedSourceKeys
) {
  const missing =
    definition.sourceKeys.filter(
      (key) =>
        !importedSourceKeys.has(key)
    );

  if (missing.length) {
    return {
      status: 'SOURCE_MISSING',
      missingSourceKeys: missing
    };
  }

  return {
    status: definition.status,
    missingSourceKeys: []
  };
}

function buildScenarios(
  sources,
  diagnostics = {}
) {
  const importedSourceKeys =
    new Set(
      sources
        .filter(
          (source) =>
            source.imported
        )
        .map(
          (source) => source.key
        )
    );

  const signals = {
    PLAN_CHANGE:
      normalizeCount(
        diagnostics
          .planChangeOrderCount
      ),
    SUSPENSION_ADJUSTMENT:
      normalizeCount(
        diagnostics
          .suspensionOrderCount
      ),
    ADJUSTMENT_NOTES:
      normalizeCount(
        diagnostics
          .adjustmentNoteCount
      )
  };

  return SCENARIO_DEFINITIONS.map(
    (definition) => {
      const sourceState =
        scenarioStatusForSources(
          definition,
          importedSourceKeys
        );

      return {
        ...definition,
        ...sourceState,
        signalCount:
          signals[definition.id] ??
          null
      };
    }
  ).sort(
    (a, b) =>
      (STATUS_PRIORITY[a.status] || 99) -
      (STATUS_PRIORITY[b.status] || 99)
  );
}

function buildFunctionalCoverageReport({
  importMetadata = [],
  diagnostics = {}
} = {}) {
  const sources =
    buildSources(importMetadata);

  const scenarios =
    buildScenarios(
      sources,
      diagnostics
    );

  const importedSources =
    sources.filter(
      (source) => source.imported
    ).length;

  const scenarioCounts =
    scenarios.reduce(
      (accumulator, scenario) => {
        accumulator[
          scenario.status
        ] = (
          accumulator[
            scenario.status
          ] || 0
        ) + 1;
        return accumulator;
      },
      {}
    );

  return {
    schemaVersion:
      FUNCTIONAL_COVERAGE_SCHEMA_VERSION,
    phase:
      FUNCTIONAL_COVERAGE_PHASE,
    generatedAt:
      new Date().toISOString(),
    summary: {
      expectedSources:
        SOURCE_DEFINITIONS.length,
      importedSources,
      allSourcesImported:
        importedSources ===
        SOURCE_DEFINITIONS.length,
      readyScenarios:
        scenarioCounts.READY || 0,
      contextOnlyScenarios:
        scenarioCounts.CONTEXT_ONLY || 0,
      partialScenarios:
        scenarioCounts.PARTIAL || 0,
      pendingMappingScenarios:
        scenarioCounts.PENDING_MAPPING || 0,
      missingSourceScenarios:
        scenarioCounts.SOURCE_MISSING || 0
    },
    sources,
    scenarios,
    confirmedRules:
      CONFIRMED_DATA_RULES,
    diagnostics: {
      catalogChargeCoveragePct:
        normalizeMetric(
          diagnostics
            .catalogChargeCoveragePct
        ),
      periodStartAvailabilityPct:
        normalizeMetric(
          diagnostics
            .periodStartAvailabilityPct
        ),
      periodEndAvailabilityPct:
        normalizeMetric(
          diagnostics
            .periodEndAvailabilityPct
        ),
      facturationSubscribers:
        normalizeCount(
          diagnostics
            .facturationSubscribers
        ),
      customersWithMultipleSubscriptions:
        normalizeCount(
          diagnostics
            .customersWithMultipleSubscriptions
        ),
      facturationSubscriberJoinMisses:
        normalizeCount(
          diagnostics
            .facturationSubscriberJoinMisses
        ),
      ordersSubscriberJoinMisses:
        normalizeCount(
          diagnostics
            .ordersSubscriberJoinMisses
        ),
      notesSubscriberJoinMisses:
        normalizeCount(
          diagnostics
            .notesSubscriberJoinMisses
        ),
      rentTypeRows: {
        RA:
          normalizeCount(
            diagnostics
              .rentTypeRaRows
          ),
        RV:
          normalizeCount(
            diagnostics
              .rentTypeRvRows
          )
      }
    }
  };
}

module.exports = {
  FUNCTIONAL_COVERAGE_SCHEMA_VERSION,
  FUNCTIONAL_COVERAGE_PHASE,
  SOURCE_DEFINITIONS,
  SCENARIO_DEFINITIONS,
  CONFIRMED_DATA_RULES,
  buildSources,
  buildScenarios,
  buildFunctionalCoverageReport
};
