const PERFORMANCE_SCHEMA_VERSION =
  'desafio1-phase21-scalability-v1';

const DEFAULT_PERFORMANCE_PROFILE =
  Object.freeze({
    baselineJourneys: 8,
    loadMultiplier: 3,
    baselineConcurrency: 4,
    requestTimeoutMs: 8000,
    p95CeilingMs: 3000,
    relativeP95Factor: 3.5,
    throughputFloorRatio: 0.7,
    warmupJourneys: 2
  });

const CORE_OPERATIONS = new Set([
  'APP_EXPERIENCE',
  'LUCIA_CHAT',
  'WHATSAPP_REPAIR'
]);

function round(value, decimals = 2) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const factor = 10 ** decimals;

  return Math.round(
    numeric * factor
  ) / factor;
}

function clampPositiveInteger(
  value,
  fallback,
  {
    min = 1,
    max = Number.MAX_SAFE_INTEGER
  } = {}
) {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return fallback;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.trunc(numeric)
    )
  );
}

function clampPositiveNumber(
  value,
  fallback,
  {
    min = 0,
    max = Number.MAX_VALUE
  } = {}
) {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return fallback;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, numeric)
  );
}

function normalizePerformanceProfile(
  input = {}
) {
  const baselineJourneys =
    clampPositiveInteger(
      input.baselineJourneys,
      DEFAULT_PERFORMANCE_PROFILE
        .baselineJourneys,
      { min: 2, max: 200 }
    );

  const loadMultiplier =
    clampPositiveInteger(
      input.loadMultiplier,
      DEFAULT_PERFORMANCE_PROFILE
        .loadMultiplier,
      { min: 2, max: 10 }
    );

  const baselineConcurrency =
    Math.min(
      baselineJourneys,
      clampPositiveInteger(
        input.baselineConcurrency,
        DEFAULT_PERFORMANCE_PROFILE
          .baselineConcurrency,
        { min: 1, max: 32 }
      )
    );

  const targetJourneys =
    baselineJourneys *
    loadMultiplier;

  const targetConcurrency =
    Math.min(
      targetJourneys,
      baselineConcurrency *
        loadMultiplier
    );

  return {
    baselineJourneys,
    loadMultiplier,
    targetJourneys,
    baselineConcurrency,
    targetConcurrency,
    requestTimeoutMs:
      clampPositiveInteger(
        input.requestTimeoutMs,
        DEFAULT_PERFORMANCE_PROFILE
          .requestTimeoutMs,
        { min: 500, max: 60000 }
      ),
    p95CeilingMs:
      clampPositiveNumber(
        input.p95CeilingMs,
        DEFAULT_PERFORMANCE_PROFILE
          .p95CeilingMs,
        { min: 100, max: 60000 }
      ),
    relativeP95Factor:
      clampPositiveNumber(
        input.relativeP95Factor,
        DEFAULT_PERFORMANCE_PROFILE
          .relativeP95Factor,
        { min: 1, max: 10 }
      ),
    throughputFloorRatio:
      clampPositiveNumber(
        input.throughputFloorRatio,
        DEFAULT_PERFORMANCE_PROFILE
          .throughputFloorRatio,
        { min: 0.1, max: 1 }
      ),
    warmupJourneys:
      clampPositiveInteger(
        input.warmupJourneys,
        DEFAULT_PERFORMANCE_PROFILE
          .warmupJourneys,
        { min: 1, max: 20 }
      )
  };
}

function percentile(values, percentileValue) {
  const sorted =
    (Array.isArray(values)
      ? values
      : [])
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

  if (!sorted.length) {
    return null;
  }

  const p = Math.min(
    100,
    Math.max(0, Number(percentileValue) || 0)
  );

  if (p === 0) {
    return round(sorted[0], 2);
  }

  const rank = Math.ceil(
    (p / 100) * sorted.length
  );

  return round(
    sorted[
      Math.max(0, rank - 1)
    ],
    2
  );
}

function average(values) {
  const numeric =
    values
      .map(Number)
      .filter(Number.isFinite);

  if (!numeric.length) {
    return null;
  }

  return round(
    numeric.reduce(
      (sum, value) => sum + value,
      0
    ) / numeric.length,
    2
  );
}

function summarizeOperationSamples(
  samples
) {
  const grouped = new Map();

  (samples || []).forEach(
    (sample) => {
      const operation =
        sample?.operation ||
        'UNKNOWN';

      if (!grouped.has(operation)) {
        grouped.set(operation, []);
      }

      grouped
        .get(operation)
        .push(sample);
    }
  );

  return Array.from(
    grouped.entries()
  )
    .map(
      ([operation, items]) => {
        const durations =
          items
            .filter(
              (sample) =>
                sample.ok === true
            )
            .map(
              (sample) =>
                sample.durationMs
            );

        const successCount =
          items.filter(
            (sample) =>
              sample.ok === true
          ).length;

        return {
          operation,
          requests: items.length,
          successCount,
          failureCount:
            items.length -
            successCount,
          successRate:
            items.length
              ? round(
                  (successCount /
                    items.length) *
                    100,
                  2
                )
              : 0,
          p50Ms:
            percentile(
              durations,
              50
            ),
          p95Ms:
            percentile(
              durations,
              95
            ),
          averageMs:
            average(durations),
          maxMs:
            durations.length
              ? round(
                  Math.max(
                    ...durations
                  ),
                  2
                )
              : null
        };
      }
    )
    .sort(
      (a, b) =>
        a.operation.localeCompare(
          b.operation
        )
    );
}

function summarizeLoadRun({
  label,
  journeys,
  concurrency,
  wallDurationMs,
  results = []
}) {
  const samples =
    results.flatMap(
      (result) =>
        Array.isArray(result?.samples)
          ? result.samples
          : []
    );

  const successfulJourneys =
    results.filter(
      (result) =>
        result?.ok === true
    ).length;

  const failedJourneys =
    Math.max(
      0,
      results.length -
      successfulJourneys
    );

  const successfulRequests =
    samples.filter(
      (sample) =>
        sample.ok === true
    ).length;

  const failedRequests =
    samples.length -
    successfulRequests;

  const timeoutRequests =
    samples.filter(
      (sample) =>
        sample.timeout === true
    ).length;

  const coreSamples =
    samples.filter(
      (sample) =>
        CORE_OPERATIONS.has(
          sample.operation
        ) &&
        sample.ok === true
    );

  const coreDurations =
    coreSamples.map(
      (sample) =>
        sample.durationMs
    );

  const durationSeconds =
    Math.max(
      0.001,
      Number(wallDurationMs) /
        1000
    );

  return {
    label,
    journeys,
    concurrency,
    wallDurationMs:
      round(wallDurationMs, 2),
    successfulJourneys,
    failedJourneys,
    journeySuccessRate:
      journeys
        ? round(
            (successfulJourneys /
              journeys) *
              100,
            2
          )
        : 0,
    totalRequests:
      samples.length,
    successfulRequests,
    failedRequests,
    timeoutRequests,
    requestSuccessRate:
      samples.length
        ? round(
            (successfulRequests /
              samples.length) *
              100,
            2
          )
        : 0,
    coreRequests:
      coreSamples.length,
    latency: {
      p50Ms:
        percentile(
          coreDurations,
          50
        ),
      p95Ms:
        percentile(
          coreDurations,
          95
        ),
      averageMs:
        average(coreDurations),
      maxMs:
        coreDurations.length
          ? round(
              Math.max(
                ...coreDurations
              ),
              2
            )
          : null
    },
    throughput: {
      journeysPerSecond:
        round(
          journeys /
            durationSeconds,
          2
        ),
      requestsPerSecond:
        round(
          samples.length /
            durationSeconds,
          2
        )
    },
    operations:
      summarizeOperationSamples(
        samples
      )
  };
}

function buildCheck(
  code,
  pass,
  description,
  observed = null
) {
  return {
    code,
    pass: Boolean(pass),
    description,
    observed
  };
}

function evaluateScaleComparison({
  profile,
  baseline,
  target
}) {
  const normalizedProfile =
    normalizePerformanceProfile(
      profile
    );

  const baselineP95 =
    Number(
      baseline?.latency?.p95Ms
    );

  const targetP95 =
    Number(
      target?.latency?.p95Ms
    );

  const relativeP95Limit =
    Number.isFinite(baselineP95)
      ? baselineP95 *
        normalizedProfile
          .relativeP95Factor
      : 0;

  const allowedP95Ms =
    round(
      Math.max(
        normalizedProfile
          .p95CeilingMs,
        relativeP95Limit
      ),
      2
    );

  const baselineThroughput =
    Number(
      baseline?.throughput
        ?.journeysPerSecond
    ) || 0;

  const targetThroughput =
    Number(
      target?.throughput
        ?.journeysPerSecond
    ) || 0;

  const throughputFloor =
    round(
      baselineThroughput *
        normalizedProfile
          .throughputFloorRatio,
      2
    );

  const checks = [
    buildCheck(
      'TARGET_VOLUME_IS_EXACT_MULTIPLE',
      target?.journeys ===
        baseline?.journeys *
          normalizedProfile
            .loadMultiplier,
      'La corrida objetivo procesa exactamente el múltiplo declarado de journeys.',
      `${baseline?.journeys || 0} → ${target?.journeys || 0}`
    ),
    buildCheck(
      'TARGET_CONCURRENCY_IS_EXACT_MULTIPLE',
      target?.concurrency ===
        baseline?.concurrency *
          normalizedProfile
            .loadMultiplier,
      'La concurrencia objetivo multiplica la concurrencia base por el mismo factor.',
      `${baseline?.concurrency || 0} → ${target?.concurrency || 0}`
    ),
    buildCheck(
      'BASELINE_HAS_ZERO_ERRORS',
      baseline?.failedJourneys === 0 &&
        baseline?.failedRequests === 0,
      'La línea base termina sin errores de journey ni de request.',
      `${baseline?.failedJourneys || 0} journeys / ${baseline?.failedRequests || 0} requests`
    ),
    buildCheck(
      'TARGET_HAS_ZERO_ERRORS',
      target?.failedJourneys === 0 &&
        target?.failedRequests === 0,
      'La carga objetivo termina sin errores de journey ni de request.',
      `${target?.failedJourneys || 0} journeys / ${target?.failedRequests || 0} requests`
    ),
    buildCheck(
      'TARGET_HAS_ZERO_TIMEOUTS',
      target?.timeoutRequests === 0,
      'La carga objetivo no agota el timeout por request.',
      `${target?.timeoutRequests || 0} timeouts`
    ),
    buildCheck(
      'TARGET_CORRECTNESS_IS_100_PERCENT',
      target?.journeySuccessRate === 100 &&
        target?.requestSuccessRate === 100,
      'El aumento de carga no puede degradar la corrección del flujo financiero/omnicanal.',
      `${target?.journeySuccessRate || 0}% journeys / ${target?.requestSuccessRate || 0}% requests`
    ),
    buildCheck(
      'TARGET_P95_WITHIN_PROTOTYPE_GUARDRAIL',
      Number.isFinite(targetP95) &&
        targetP95 <= allowedP95Ms,
      'El p95 de operaciones núcleo debe mantenerse dentro de la guarda local absoluta/relativa.',
      `${Number.isFinite(targetP95) ? round(targetP95, 2) : 'N/D'} ms ≤ ${allowedP95Ms} ms`
    ),
    buildCheck(
      'TARGET_THROUGHPUT_DOES_NOT_COLLAPSE',
      targetThroughput >=
        throughputFloor,
      'El throughput de journeys no debe caer por debajo del piso relativo a la línea base.',
      `${round(targetThroughput, 2)} j/s ≥ ${throughputFloor} j/s`
    )
  ];

  const passedChecks =
    checks.filter(
      (check) => check.pass
    ).length;

  return {
    schemaVersion:
      PERFORMANCE_SCHEMA_VERSION,
    phase: 'PHASE_21',
    status:
      passedChecks ===
        checks.length
        ? 'PASS'
        : 'REVIEW_REQUIRED',
    scope:
      'LOCAL_PROTOTYPE_CAPACITY_BENCHMARK_NOT_PRODUCTION_SLA',
    loadMultiplier:
      normalizedProfile
        .loadMultiplier,
    thresholds: {
      requestTimeoutMs:
        normalizedProfile
          .requestTimeoutMs,
      p95CeilingMs:
        normalizedProfile
          .p95CeilingMs,
      relativeP95Factor:
        normalizedProfile
          .relativeP95Factor,
      allowedTargetP95Ms:
        allowedP95Ms,
      throughputFloorRatio:
        normalizedProfile
          .throughputFloorRatio,
      targetJourneyThroughputFloor:
        throughputFloor
    },
    passedChecks,
    totalChecks:
      checks.length,
    checks
  };
}

function buildPerformanceReport({
  profile,
  baseline,
  target,
  environment = null
}) {
  const normalizedProfile =
    normalizePerformanceProfile(
      profile
    );

  const evaluation =
    evaluateScaleComparison({
      profile:
        normalizedProfile,
      baseline,
      target
    });

  return {
    schemaVersion:
      PERFORMANCE_SCHEMA_VERSION,
    phase: 'PHASE_21',
    status:
      evaluation.status,
    generatedAt:
      new Date().toISOString(),
    scope:
      evaluation.scope,
    statement:
      'Benchmark local reproducible del prototipo. No representa un SLA, capacidad de red Movistar ni tráfico productivo.',
    profile:
      normalizedProfile,
    workload: {
      journey:
        'demo login → asociación → Mi Movistar → experiencia → Lucía determinista → reparación por WhatsApp',
      financialReasoningByLlm:
        false,
      externalProviderTraffic:
        false,
      coreOperations:
        Array.from(
          CORE_OPERATIONS
        )
    },
    environment:
      environment || null,
    baseline,
    target,
    evaluation,
    safeguards: [
      'Los mensajes del benchmark usan rutas deterministas y no requieren un LLM para calcular montos o causas.',
      'El reporte agregado no conserva cookies, sessionId, customerId, teléfono ni identificadores oficiales del dataset.',
      'La carga 3× es una referencia de capacidad local del prototipo; no se extrapola a producción.',
      'Una corrida con errores, timeouts o pérdida de corrección queda REVIEW_REQUIRED aunque la latencia sea baja.'
    ]
  };
}

module.exports = {
  PERFORMANCE_SCHEMA_VERSION,
  DEFAULT_PERFORMANCE_PROFILE,
  CORE_OPERATIONS,
  round,
  normalizePerformanceProfile,
  percentile,
  summarizeOperationSamples,
  summarizeLoadRun,
  evaluateScaleComparison,
  buildPerformanceReport
};
