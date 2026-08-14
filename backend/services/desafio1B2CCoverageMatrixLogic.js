const MATRIX_SCHEMA_VERSION =
  'desafio1-b2c-coverage-matrix-v1';

const MATRIX_PHASE =
  'PHASE_17';

const RENT_TYPES = Object.freeze([
  'RA',
  'RV'
]);

const EVIDENCE_RANK = Object.freeze({
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
});

const CRITICAL_SCENARIOS = Object.freeze([
  {
    code: 'PRORATION',
    label: 'Prorrateo',
    engineCode: 'PRORATION',
    mappingStatus: 'MAPPED'
  },
  {
    code: 'FINANCED_EQUIPMENT',
    label: 'Cuota de equipo financiado',
    engineCode: null,
    mappingStatus: 'PENDING_MAPPING',
    limitation:
      'Las fuentes actuales contienen señales ambiguas de financiamiento/equipo, pero no un marcador inequívoco de cuota de equipo financiado. No se promueve una causa financiera sin esa evidencia.'
  },
  {
    code: 'RECONNECTION',
    label: 'Reconexión tras suspensión',
    engineCode: 'RECONNECTION',
    mappingStatus: 'MAPPED'
  },
  {
    code: 'DISCOUNT_ENDED',
    label: 'Fin de descuento',
    engineCode: 'DISCOUNT_ENDED',
    mappingStatus: 'MAPPED'
  },
  {
    code: 'PLAN_CHANGE',
    label: 'Cambio de plan',
    engineCode: 'PLAN_CHANGE',
    mappingStatus: 'MAPPED'
  }
]);

const EXTENDED_SCENARIOS = Object.freeze([
  {
    code: 'PACKAGES',
    label: 'Paquetes adicionales',
    engineCode: 'PACKAGES',
    mappingStatus: 'MAPPED'
  },
  {
    code: 'SUSPENSION_ADJUSTMENT',
    label: 'Ajuste por días de suspensión',
    engineCode: 'SUSPENSION_ADJUSTMENT',
    mappingStatus: 'MAPPED'
  }
]);

const MATRIX_CELL_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',
  OBSERVED_NOT_HIGH_CONFIDENCE:
    'OBSERVED_NOT_HIGH_CONFIDENCE',
  NO_VERIFIED_CASE: 'NO_VERIFIED_CASE',
  NO_RESOLVED_RENT_POPULATION:
    'NO_RESOLVED_RENT_POPULATION',
  PENDING_MAPPING: 'PENDING_MAPPING'
});

function normalizeText(value) {
  const normalized = String(
    value ?? ''
  ).trim();

  return normalized || null;
}

function normalizeUpper(value) {
  const normalized = normalizeText(
    value
  );

  return normalized
    ? normalized.toUpperCase()
    : null;
}

function normalizeRentType(value) {
  const normalized = normalizeUpper(
    value
  );

  return RENT_TYPES.includes(
    normalized
  )
    ? normalized
    : null;
}

function normalizeProduct({
  businessType = null,
  lobType = null
} = {}) {
  const business =
    normalizeUpper(businessType) ||
    'UNKNOWN';

  const rawLob =
    normalizeText(lobType);

  const lob = rawLob
    ? rawLob.toUpperCase()
    : 'UNKNOWN';

  return {
    businessType: business,
    lobType: lob,
    businessKey: business,
    productKey:
      `${business}|${lob}`,
    label:
      `${business} · ${lob}`
  };
}

function unique(values = []) {
  return Array.from(
    new Set(
      values.filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ''
      )
    )
  );
}

function collectRentTypesDeep(
  value,
  output = []
) {
  if (
    value === null ||
    value === undefined
  ) {
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRentTypesDeep(
        item,
        output
      );
    }
    return output;
  }

  if (
    typeof value !== 'object'
  ) {
    return output;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'rentType'
    )
  ) {
    const rentType =
      normalizeRentType(
        value.rentType
      );

    if (rentType) {
      output.push(rentType);
    }
  }

  for (
    const [key, nested] of
      Object.entries(value)
  ) {
    if (key === 'rentType') {
      continue;
    }

    collectRentTypesDeep(
      nested,
      output
    );
  }

  return output;
}

function collectClaimedChargeRentTypes({
  items = [],
  explanation = null
} = {}) {
  const claimedCodes = unique(
    items.flatMap(
      (item) =>
        item?.claimedChargeCodes ||
        (
          item?.chargeCode
            ? [item.chargeCode]
            : []
        )
    )
      .map(normalizeText)
      .filter(Boolean)
  );

  if (!claimedCodes.length) {
    return [];
  }

  const claimed = new Set(
    claimedCodes
  );

  const invoiceItems = [
    ...(
      explanation?.currentBill
        ?.items || []
    ),
    ...(
      explanation?.previousBill
        ?.items || []
    )
  ];

  return invoiceItems
    .filter(
      (item) =>
        claimed.has(
          normalizeText(
            item?.chargeCode
          )
        )
    )
    .map(
      (item) =>
        normalizeRentType(
          item?.rentType
        )
    )
    .filter(Boolean);
}

function resolveScenarioRentType({
  items = [],
  explanation = null
} = {}) {
  const direct = unique([
    ...items.flatMap(
      (item) =>
        collectRentTypesDeep(
          item,
          []
        )
    ),
    ...collectClaimedChargeRentTypes({
      items,
      explanation
    })
  ]);

  if (direct.length === 1) {
    return {
      resolved: true,
      rentType: direct[0],
      source:
        'SCENARIO_EVIDENCE'
    };
  }

  if (direct.length > 1) {
    return {
      resolved: false,
      rentType: null,
      source: null,
      reason:
        'SCENARIO_RENT_AMBIGUOUS'
    };
  }

  const currentRent =
    explanation?.interpretation
      ?.rentContext?.current;

  if (
    currentRent?.resolved
  ) {
    const fallback =
      normalizeRentType(
        currentRent.rentType
      );

    if (fallback) {
      return {
        resolved: true,
        rentType: fallback,
        source:
          'CURRENT_BILL_RENT_CONTEXT'
      };
    }
  }

  return {
    resolved: false,
    rentType: null,
    source: null,
    reason:
      'SCENARIO_RENT_NOT_RESOLVED'
  };
}

function highestEvidenceLevel(
  items = []
) {
  let best = null;
  let rank = 0;

  for (const item of items) {
    const level = normalizeUpper(
      item?.evidenceLevel
    );

    const current =
      EVIDENCE_RANK[level] || 0;

    if (current > rank) {
      rank = current;
      best = level;
    }
  }

  return best;
}

function getScenarioItems(
  explanation,
  engineCode
) {
  if (!engineCode) {
    return [];
  }

  const causes =
    explanation?.interpretation
      ?.causes || [];

  const findings =
    explanation?.interpretation
      ?.currentBillFindings || [];

  return [
    ...causes.map(
      (item) => ({
        ...item,
        matrixItemType: 'CAUSE'
      })
    ),
    ...findings.map(
      (item) => ({
        ...item,
        matrixItemType: 'FINDING'
      })
    )
  ].filter(
    (item) =>
      normalizeUpper(
        item?.code
      ) === engineCode
  );
}

function buildScenarioObservation({
  definition,
  explanation
}) {
  if (
    definition.mappingStatus ===
      'PENDING_MAPPING'
  ) {
    return null;
  }

  const items = getScenarioItems(
    explanation,
    definition.engineCode
  );

  if (!items.length) {
    return null;
  }

  const evidenceLevel =
    highestEvidenceLevel(items);

  const rent =
    resolveScenarioRentType({
      items,
      explanation
    });

  const ruleIds = unique(
    items
      .map(
        (item) =>
          normalizeText(
            item?.ruleId
          )
      )
      .filter(Boolean)
  );

  const itemTypes = unique(
    items
      .map(
        (item) =>
          item.matrixItemType
      )
  );

  const deterministicGuard =
    explanation?.safeguards
      ?.llmUsedForFinancialReasoning ===
    false;

  return {
    code: definition.code,
    label: definition.label,
    evidenceLevel,
    rentType:
      rent.rentType,
    rentResolved:
      rent.resolved,
    rentResolutionSource:
      rent.source,
    rentResolutionReason:
      rent.reason || null,
    ruleIds,
    itemTypes,
    deterministicGuard,
    verified: Boolean(
      evidenceLevel === 'HIGH' &&
      rent.resolved &&
      deterministicGuard
    )
  };
}

function buildSubscriberMatrixObservation({
  seed = {},
  explanation = null,
  error = null
} = {}) {
  const product = normalizeProduct({
    businessType:
      explanation?.subscriber
        ?.businessType ||
      seed.businessType,
    lobType:
      explanation?.subscriber
        ?.lobType ||
      seed.lobType
  });

  const invoiceCount = Math.max(
    Number.parseInt(
      seed.invoiceCount,
      10
    ) || 0,
    0
  );

  const hasInvoices =
    invoiceCount > 0;

  const currentTotal = Number(
    explanation?.currentBill?.total
  );

  const consultable = Boolean(
    hasInvoices &&
    explanation &&
    Number.isFinite(currentTotal) &&
    !error
  );

  const currentRent =
    explanation?.interpretation
      ?.rentContext?.current;

  const baselineRentType =
    currentRent?.resolved
      ? normalizeRentType(
          currentRent.rentType
        )
      : null;

  const definitions = [
    ...CRITICAL_SCENARIOS,
    ...EXTENDED_SCENARIOS
  ];

  const scenarios = consultable
    ? definitions
        .map(
          (definition) =>
            buildScenarioObservation({
              definition,
              explanation
            })
        )
        .filter(Boolean)
    : [];

  return {
    product,
    invoiceCount,
    hasInvoices,
    consultable,
    baselineRentType,
    rentResolved:
      Boolean(baselineRentType),
    scenarios,
    analysisError: Boolean(error),
    errorCode:
      error?.code ||
      (error
        ? 'ANALYSIS_ERROR'
        : null)
  };
}

function percentage(
  numerator,
  denominator
) {
  if (!denominator) {
    return 0;
  }

  return Number(
    (
      Number(numerator || 0) /
      Number(denominator)
      * 100
    ).toFixed(2)
  );
}

function sortBusinessTypes(values) {
  const preferred = [
    'MOVIL',
    'FIJA',
    'MT/CONVERGENTE'
  ];

  return values.slice().sort(
    (left, right) => {
      const leftIndex =
        preferred.indexOf(left);
      const rightIndex =
        preferred.indexOf(right);

      if (
        leftIndex !== -1 ||
        rightIndex !== -1
      ) {
        if (leftIndex === -1) {
          return 1;
        }
        if (rightIndex === -1) {
          return -1;
        }
        return leftIndex - rightIndex;
      }

      return left.localeCompare(right);
    }
  );
}

function buildDimensions(
  observations = []
) {
  const productMap = new Map();
  const businessMap = new Map();

  for (const observation of observations) {
    const product =
      observation.product;

    if (!productMap.has(
      product.productKey
    )) {
      productMap.set(
        product.productKey,
        {
          ...product,
          subscribers: 0,
          billable: 0,
          consultable: 0,
          rentResolved: {
            RA: 0,
            RV: 0
          }
        }
      );
    }

    const productEntry =
      productMap.get(
        product.productKey
      );

    productEntry.subscribers += 1;
    if (observation.hasInvoices) {
      productEntry.billable += 1;
    }
    if (observation.consultable) {
      productEntry.consultable += 1;
    }
    if (observation.baselineRentType) {
      productEntry.rentResolved[
        observation.baselineRentType
      ] += 1;
    }

    if (!businessMap.has(
      product.businessKey
    )) {
      businessMap.set(
        product.businessKey,
        {
          businessType:
            product.businessType,
          businessKey:
            product.businessKey,
          subscribers: 0,
          billable: 0,
          consultable: 0,
          lobTypes: new Set(),
          rentResolved: {
            RA: 0,
            RV: 0
          }
        }
      );
    }

    const businessEntry =
      businessMap.get(
        product.businessKey
      );

    businessEntry.subscribers += 1;
    if (observation.hasInvoices) {
      businessEntry.billable += 1;
    }
    if (observation.consultable) {
      businessEntry.consultable += 1;
    }
    businessEntry.lobTypes.add(
      product.lobType
    );
    if (observation.baselineRentType) {
      businessEntry.rentResolved[
        observation.baselineRentType
      ] += 1;
    }
  }

  const businessTypes =
    sortBusinessTypes(
      Array.from(
        businessMap.keys()
      )
    ).map(
      (businessKey) => {
        const entry =
          businessMap.get(
            businessKey
          );

        return {
          ...entry,
          lobTypes:
            Array.from(
              entry.lobTypes
            ).sort()
        };
      }
    );

  const products =
    Array.from(
      productMap.values()
    ).sort(
      (left, right) => {
        const businessOrder =
          sortBusinessTypes([
            left.businessType,
            right.businessType
          ]);

        if (
          left.businessType !==
          right.businessType
        ) {
          return businessOrder[0] ===
            left.businessType
              ? -1
              : 1;
        }

        return left.lobType
          .localeCompare(
            right.lobType
          );
      }
    );

  return {
    businessTypes,
    products
  };
}

function buildCell({
  definition,
  observations,
  dimensionType,
  dimensionKey,
  rentType,
  baselinePopulation
}) {
  if (
    definition.mappingStatus ===
      'PENDING_MAPPING'
  ) {
    return {
      status:
        MATRIX_CELL_STATUS
          .PENDING_MAPPING,
      verifiedCases: 0,
      observedCases: 0,
      lowerConfidenceCases: 0,
      baselinePopulation,
      limitation:
        definition.limitation || null
    };
  }

  let observedCases = 0;
  let verifiedCases = 0;
  let lowerConfidenceCases = 0;

  for (const observation of observations) {
    const dimensionMatches =
      dimensionType === 'BUSINESS'
        ? observation.product
            .businessKey ===
          dimensionKey
        : observation.product
            .productKey ===
          dimensionKey;

    if (!dimensionMatches) {
      continue;
    }

    const scenario =
      observation.scenarios.find(
        (item) =>
          item.code ===
          definition.code &&
          item.rentType ===
          rentType
      );

    if (!scenario) {
      continue;
    }

    observedCases += 1;

    if (scenario.verified) {
      verifiedCases += 1;
    } else {
      lowerConfidenceCases += 1;
    }
  }

  let status =
    MATRIX_CELL_STATUS
      .NO_VERIFIED_CASE;

  if (verifiedCases > 0) {
    status =
      MATRIX_CELL_STATUS.VERIFIED;
  } else if (observedCases > 0) {
    status =
      MATRIX_CELL_STATUS
        .OBSERVED_NOT_HIGH_CONFIDENCE;
  } else if (baselinePopulation === 0) {
    status =
      MATRIX_CELL_STATUS
        .NO_RESOLVED_RENT_POPULATION;
  }

  return {
    status,
    verifiedCases,
    observedCases,
    lowerConfidenceCases,
    baselinePopulation
  };
}

function unresolvedRentCount({
  observations,
  definition,
  dimensionType,
  dimensionKey
}) {
  if (
    definition.mappingStatus ===
      'PENDING_MAPPING'
  ) {
    return 0;
  }

  let count = 0;

  for (const observation of observations) {
    const dimensionMatches =
      dimensionType === 'BUSINESS'
        ? observation.product
            .businessKey ===
          dimensionKey
        : observation.product
            .productKey ===
          dimensionKey;

    if (!dimensionMatches) {
      continue;
    }

    const scenario =
      observation.scenarios.find(
        (item) =>
          item.code ===
          definition.code
      );

    if (
      scenario &&
      !scenario.rentResolved
    ) {
      count += 1;
    }
  }

  return count;
}

function buildMatrix({
  observations,
  dimensions,
  dimensionType,
  definitions
}) {
  const sourceDimensions =
    dimensionType === 'BUSINESS'
      ? dimensions.businessTypes
      : dimensions.products;

  const columns = [];

  for (const dimension of sourceDimensions) {
    for (const rentType of RENT_TYPES) {
      const key =
        dimensionType === 'BUSINESS'
          ? dimension.businessKey
          : dimension.productKey;

      columns.push({
        key:
          `${key}|${rentType}`,
        dimensionKey: key,
        businessType:
          dimension.businessType,
        lobType:
          dimensionType === 'PRODUCT'
            ? dimension.lobType
            : null,
        rentType,
        baselinePopulation:
          Number(
            dimension.rentResolved?.[rentType] || 0
          )
      });
    }
  }

  const rows = definitions.map(
    (definition) => {
      const cells = columns.map(
        (column) => ({
          columnKey: column.key,
          ...buildCell({
            definition,
            observations,
            dimensionType,
            dimensionKey:
              column.dimensionKey,
            rentType:
              column.rentType,
            baselinePopulation:
              column.baselinePopulation
          })
        })
      );

      const unresolvedByDimension =
        sourceDimensions.map(
          (dimension) => {
            const key =
              dimensionType ===
                'BUSINESS'
                ? dimension.businessKey
                : dimension.productKey;

            return {
              dimensionKey: key,
              count:
                unresolvedRentCount({
                  observations,
                  definition,
                  dimensionType,
                  dimensionKey: key
                })
            };
          }
        )
        .filter(
          (item) =>
            item.count > 0
        );

      return {
        scenarioCode:
          definition.code,
        label:
          definition.label,
        mappingStatus:
          definition.mappingStatus,
        limitation:
          definition.limitation || null,
        unresolvedRentByDimension:
          unresolvedByDimension,
        cells
      };
    }
  );

  return {
    dimensionType,
    columns,
    rows
  };
}

function summarizeMatrix(
  matrix
) {
  const counts = {
    totalCells: 0,
    verifiedCells: 0,
    observedNotHighConfidenceCells: 0,
    noVerifiedCaseCells: 0,
    noResolvedRentPopulationCells: 0,
    pendingMappingCells: 0
  };

  for (const row of matrix.rows) {
    for (const cell of row.cells) {
      counts.totalCells += 1;

      switch (cell.status) {
        case MATRIX_CELL_STATUS.VERIFIED:
          counts.verifiedCells += 1;
          break;
        case MATRIX_CELL_STATUS
          .OBSERVED_NOT_HIGH_CONFIDENCE:
          counts.observedNotHighConfidenceCells += 1;
          break;
        case MATRIX_CELL_STATUS
          .NO_VERIFIED_CASE:
          counts.noVerifiedCaseCells += 1;
          break;
        case MATRIX_CELL_STATUS
          .NO_RESOLVED_RENT_POPULATION:
          counts.noResolvedRentPopulationCells += 1;
          break;
        case MATRIX_CELL_STATUS
          .PENDING_MAPPING:
          counts.pendingMappingCells += 1;
          break;
        default:
          break;
      }
    }
  }

  const evaluable =
    counts.totalCells -
    counts.pendingMappingCells;

  return {
    ...counts,
    evaluableMappedCells:
      evaluable,
    verifiedOfAllChallengeCellsPct:
      percentage(
        counts.verifiedCells,
        counts.totalCells
      ),
    verifiedOfMappedCellsPct:
      percentage(
        counts.verifiedCells,
        evaluable
      )
  };
}

function buildScenarioSummary({
  observations,
  dimensions,
  definitions
}) {
  return definitions.map(
    (definition) => {
      if (
        definition.mappingStatus ===
          'PENDING_MAPPING'
      ) {
        return {
          scenarioCode:
            definition.code,
          label:
            definition.label,
          mappingStatus:
            definition.mappingStatus,
          verifiedCases: 0,
          observedCases: 0,
          unresolvedRentCases: 0,
          rentModesVerified: [],
          businessTypesVerified: [],
          limitation:
            definition.limitation || null
        };
      }

      const relevant =
        observations
          .flatMap(
            (observation) =>
              observation.scenarios
                .filter(
                  (scenario) =>
                    scenario.code ===
                    definition.code
                )
                .map(
                  (scenario) => ({
                    observation,
                    scenario
                  })
                )
          );

      const verified = relevant.filter(
        ({ scenario }) =>
          scenario.verified
      );

      return {
        scenarioCode:
          definition.code,
        label:
          definition.label,
        mappingStatus:
          definition.mappingStatus,
        verifiedCases:
          verified.length,
        observedCases:
          relevant.length,
        unresolvedRentCases:
          relevant.filter(
            ({ scenario }) =>
              !scenario.rentResolved
          ).length,
        rentModesVerified:
          RENT_TYPES.filter(
            (rentType) =>
              verified.some(
                ({ scenario }) =>
                  scenario.rentType ===
                  rentType
              )
          ),
        businessTypesVerified:
          sortBusinessTypes(
            unique(
              verified.map(
                ({ observation }) =>
                  observation.product
                    .businessType
              )
            )
          ),
        businessTypesAvailable:
          dimensions.businessTypes.map(
            (item) =>
              item.businessType
          ),
        limitation:
          definition.limitation || null
      };
    }
  );
}

function buildB2CCoverageMatrixReport(
  observations = [],
  {
    totalAvailable = null,
    requestedLimit = null,
    generatedAt = null,
    dataLineage = []
  } = {}
) {
  const rows = observations || [];

  const parsedAvailable =
    Number(totalAvailable);

  const available =
    totalAvailable !== null &&
    totalAvailable !== undefined &&
    Number.isInteger(
      parsedAvailable
    ) &&
    parsedAvailable >= 0
      ? parsedAvailable
      : rows.length;

  const limited =
    rows.length < available;

  const dimensions =
    buildDimensions(rows);

  const businessMatrix =
    buildMatrix({
      observations: rows,
      dimensions,
      dimensionType: 'BUSINESS',
      definitions:
        CRITICAL_SCENARIOS
    });

  const productMatrix =
    buildMatrix({
      observations: rows,
      dimensions,
      dimensionType: 'PRODUCT',
      definitions:
        CRITICAL_SCENARIOS
    });

  const extendedBusinessMatrix =
    buildMatrix({
      observations: rows,
      dimensions,
      dimensionType: 'BUSINESS',
      definitions:
        EXTENDED_SCENARIOS
    });

  const businessSummary =
    summarizeMatrix(
      businessMatrix
    );

  const productSummary =
    summarizeMatrix(
      productMatrix
    );

  const counts = {
    scanned: rows.length,
    hasInvoices:
      rows.filter(
        (item) =>
          item.hasInvoices
      ).length,
    consultable:
      rows.filter(
        (item) =>
          item.consultable
      ).length,
    rentResolved:
      rows.filter(
        (item) =>
          item.rentResolved
      ).length,
    analysisErrors:
      rows.filter(
        (item) =>
          item.analysisError
      ).length
  };

  let status = 'PASS';

  if (
    rows.length === 0 ||
    dimensions.businessTypes.length === 0 ||
    counts.analysisErrors > 0
  ) {
    status =
      'REVIEW_REQUIRED';
  } else if (limited) {
    status = 'SAMPLE_ONLY';
  } else if (
    businessSummary.verifiedCells !==
      businessSummary.totalCells ||
    productSummary.verifiedCells !==
      productSummary.totalCells
  ) {
    status = 'KNOWN_LIMITS';
  }

  return {
    schemaVersion:
      MATRIX_SCHEMA_VERSION,
    phase: MATRIX_PHASE,
    generatedAt:
      generatedAt ||
      new Date().toISOString(),
    status,
    scope: {
      population: available,
      scanned: rows.length,
      requestedLimit:
        requestedLimit || null,
      limited,
      b2cInterpretation:
        'La matriz usa las dimensiones negocio y lob_type observadas en PLANTA CLIENTES entregada para el desafío B2C; no inventa productos que no aparezcan en la fuente.'
    },
    counts,
    dimensions,
    criticalScenarios:
      CRITICAL_SCENARIOS.map(
        (item) => ({
          ...item
        })
      ),
    scenarioSummary:
      buildScenarioSummary({
        observations: rows,
        dimensions,
        definitions:
          CRITICAL_SCENARIOS
      }),
    businessMatrix,
    productMatrix,
    extendedCoverage: {
      scenarioSummary:
        buildScenarioSummary({
          observations: rows,
          dimensions,
          definitions:
            EXTENDED_SCENARIOS
        }),
      businessMatrix:
        extendedBusinessMatrix
    },
    metrics: {
      business:
        businessSummary,
      product:
        productSummary
    },
    dataLineage:
      (dataLineage || []).map(
        (dataset) => ({
          datasetKey:
            dataset.datasetKey,
          importedRows:
            Number(
              dataset.importedRows || 0
            ),
          sha256:
            dataset.sha256 || null
        })
      ),
    safeguards: {
      llmUsedForMatrixScoring:
        false,
      verifiedCellRequiresObservedHighEvidenceCase:
        true,
      verifiedCellRequiresResolvedRentType:
        true,
      theoreticalSupportMarkedVerified:
        false,
      privateIdentifiersPublished:
        false,
      financedEquipmentPromotedWithoutEvidence:
        false,
      sampleCanClaimFullCoverage:
        false,
      note:
        'Fase 17 marca una combinación como VERIFIED únicamente si el dataset produce al menos un caso HIGH con renta RA/RV resuelta. La ausencia de un caso verificable se publica como límite conocido, no como soporte teórico.'
    }
  };
}

module.exports = {
  MATRIX_SCHEMA_VERSION,
  MATRIX_PHASE,
  RENT_TYPES,
  CRITICAL_SCENARIOS,
  EXTENDED_SCENARIOS,
  MATRIX_CELL_STATUS,
  normalizeRentType,
  normalizeProduct,
  collectRentTypesDeep,
  resolveScenarioRentType,
  highestEvidenceLevel,
  getScenarioItems,
  buildScenarioObservation,
  buildSubscriberMatrixObservation,
  buildDimensions,
  buildB2CCoverageMatrixReport,
  percentage
};
