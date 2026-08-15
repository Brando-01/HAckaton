const {
  percentile,
  round
} = require(
  './desafio1PerformanceLogic'
);

const MAX_RUNTIME_SAMPLES = 1000;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

const samples = [];

function normalizeApiPath(value) {
  return String(value || '')
    .split('?')[0]
    .trim();
}

function classifyPerformanceRequest(
  method,
  path
) {
  const normalizedMethod =
    String(method || '')
      .toUpperCase();

  const normalizedPath =
    normalizeApiPath(path);

  if (
    normalizedMethod === 'GET' &&
    normalizedPath === '/api/app/me'
  ) {
    return 'APP_EXPERIENCE';
  }

  if (
    normalizedMethod === 'POST' &&
    normalizedPath === '/api/chat'
  ) {
    return 'LUCIA_CHAT';
  }

  if (
    normalizedMethod === 'POST' &&
    normalizedPath ===
      '/api/channels/whatsapp/inbound'
  ) {
    return 'WHATSAPP_INBOUND';
  }

  if (
    normalizedMethod === 'POST' &&
    /^\/api\/session\/[^/]+\/customer$/
      .test(normalizedPath)
  ) {
    return 'SESSION_ASSOCIATION';
  }

  if (
    normalizedMethod === 'POST' &&
    /^\/api\/session\/[^/]+\/channel$/
      .test(normalizedPath)
  ) {
    return 'CHANNEL_TOUCH';
  }

  return null;
}

function recordPerformanceSample({
  operation,
  durationMs,
  statusCode,
  timestamp = Date.now()
}) {
  if (
    !operation ||
    !Number.isFinite(
      Number(durationMs)
    )
  ) {
    return null;
  }

  const sample = {
    operation:
      String(operation),
    durationMs:
      Math.max(
        0,
        round(
          Number(durationMs),
          2
        )
      ),
    statusCode:
      Number(statusCode) || 0,
    ok:
      Number(statusCode) >= 200 &&
      Number(statusCode) < 400,
    timestamp:
      Number(timestamp) ||
      Date.now()
  };

  samples.push(sample);

  if (
    samples.length >
    MAX_RUNTIME_SAMPLES
  ) {
    samples.splice(
      0,
      samples.length -
        MAX_RUNTIME_SAMPLES
    );
  }

  return {
    ...sample
  };
}

function summarizeGroup(items) {
  const durations =
    items.map(
      (item) =>
        item.durationMs
    );

  const successCount =
    items.filter(
      (item) => item.ok
    ).length;

  return {
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
            1
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
      items.length
        ? round(
            durations.reduce(
              (sum, value) =>
                sum + value,
              0
            ) /
              items.length,
            2
          )
        : null,
    maxMs:
      items.length
        ? round(
            Math.max(
              ...durations
            ),
            2
          )
        : null
  };
}

function getRuntimePerformanceSummary({
  now = Date.now(),
  windowMs = DEFAULT_WINDOW_MS
} = {}) {
  const safeWindowMs =
    Math.max(
      1000,
      Number(windowMs) ||
        DEFAULT_WINDOW_MS
    );

  const from =
    Number(now) -
    safeWindowMs;

  const recent =
    samples.filter(
      (sample) =>
        sample.timestamp >= from &&
        sample.timestamp <= now
    );

  const byOperationMap =
    new Map();

  recent.forEach(
    (sample) => {
      if (
        !byOperationMap.has(
          sample.operation
        )
      ) {
        byOperationMap.set(
          sample.operation,
          []
        );
      }

      byOperationMap
        .get(sample.operation)
        .push(sample);
    }
  );

  const allSummary =
    summarizeGroup(recent);

  return {
    schemaVersion:
      'desafio1-phase21-runtime-performance-v1',
    scope:
      'LOCAL_IN_MEMORY_WINDOW_NOT_SLA',
    windowSeconds:
      Math.round(
        safeWindowMs / 1000
      ),
    sampleCount:
      recent.length,
    ...allSummary,
    operations:
      Array.from(
        byOperationMap.entries()
      )
        .map(
          ([operation, items]) => ({
            operation,
            ...summarizeGroup(items)
          })
        )
        .sort(
          (a, b) =>
            a.operation.localeCompare(
              b.operation
            )
        ),
    benchmarkCommand:
      'npm run audit:performance:desafio1'
  };
}

function resetRuntimePerformanceMetrics() {
  samples.length = 0;
}

function getRuntimePerformanceSamples() {
  return samples.map(
    (sample) => ({
      ...sample
    })
  );
}

module.exports = {
  MAX_RUNTIME_SAMPLES,
  DEFAULT_WINDOW_MS,
  classifyPerformanceRequest,
  recordPerformanceSample,
  getRuntimePerformanceSummary,
  getRuntimePerformanceSamples,
  resetRuntimePerformanceMetrics
};
