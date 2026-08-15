const {
  randomUUID
} = require('crypto');

const {
  normalizePerformanceProfile,
  summarizeLoadRun,
  buildPerformanceReport
} = require(
  './desafio1PerformanceLogic'
);

const DEMO_WORKLOADS = Object.freeze([
  {
    customerId: 'CLI000001',
    chatMessage:
      '¿Por qué subió mi recibo?'
  },
  {
    customerId: 'CLI000002',
    chatMessage:
      'Explícame mi prorrateo'
  }
]);

function nowMs() {
  return Number(
    process.hrtime.bigint()
  ) / 1e6;
}

function extractCookie(response) {
  const setCookie =
    response?.headers?.get?.(
      'set-cookie'
    );

  return setCookie
    ? setCookie.split(';')[0]
    : null;
}

function createSafeFailure(
  operation,
  code,
  durationMs,
  {
    timeout = false,
    statusCode = null
  } = {}
) {
  return {
    operation,
    ok: false,
    timeout: Boolean(timeout),
    statusCode:
      Number(statusCode) || null,
    durationMs:
      Math.max(
        0,
        Number(durationMs) || 0
      ),
    errorCode: code
  };
}

async function performJsonRequest({
  fetchImpl = fetch,
  baseUrl,
  path,
  method = 'GET',
  body = null,
  cookie = null,
  timeoutMs,
  operation,
  validate = null
}) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  const startedAt = nowMs();

  try {
    const headers = {
      Accept:
        'application/json'
    };

    if (body !== null) {
      headers['Content-Type'] =
        'application/json';
    }

    if (cookie) {
      headers.Cookie = cookie;
    }

    const response =
      await fetchImpl(
        `${baseUrl}${path}`,
        {
          method,
          headers,
          body:
            body === null
              ? undefined
              : JSON.stringify(body),
          signal:
            controller.signal,
          cache: 'no-store'
        }
      );

    const durationMs =
      nowMs() -
      startedAt;

    let payload = null;

    try {
      payload =
        await response.json();
    } catch (error) {
      return {
        sample:
          createSafeFailure(
            operation,
            'INVALID_JSON_RESPONSE',
            durationMs,
            {
              statusCode:
                response.status
            }
          ),
        payload: null,
        cookie: null
      };
    }

    if (!response.ok) {
      return {
        sample:
          createSafeFailure(
            operation,
            'HTTP_STATUS_ERROR',
            durationMs,
            {
              statusCode:
                response.status
            }
          ),
        payload,
        cookie:
          extractCookie(response)
      };
    }

    if (
      typeof validate === 'function' &&
      !validate(payload)
    ) {
      return {
        sample:
          createSafeFailure(
            operation,
            'RESPONSE_VALIDATION_FAILED',
            durationMs,
            {
              statusCode:
                response.status
            }
          ),
        payload,
        cookie:
          extractCookie(response)
      };
    }

    return {
      sample: {
        operation,
        ok: true,
        timeout: false,
        statusCode:
          response.status,
        durationMs:
          Math.max(
            0,
            durationMs
          ),
        errorCode: null
      },
      payload,
      cookie:
        extractCookie(response)
    };
  } catch (error) {
    const durationMs =
      nowMs() -
      startedAt;

    const timeout =
      error?.name ===
      'AbortError';

    return {
      sample:
        createSafeFailure(
          operation,
          timeout
            ? 'REQUEST_TIMEOUT'
            : 'REQUEST_ERROR',
          durationMs,
          { timeout }
        ),
      payload: null,
      cookie: null
    };
  } finally {
    clearTimeout(timer);
  }
}

function hasVisitedChannel(
  payload,
  channel
) {
  const visited =
    payload?.continuity
      ?.visitedChannels ||
    payload?.continuity
      ?.channels ||
    [];

  return (
    Array.isArray(visited) &&
    visited.includes(channel)
  );
}

async function runVirtualJourney({
  baseUrl,
  index,
  runLabel,
  timeoutMs,
  fetchImpl = fetch
}) {
  const workload =
    DEMO_WORKLOADS[
      index %
        DEMO_WORKLOADS.length
    ];

  const sessionId =
    `phase21-${runLabel}-${index}-${randomUUID()}`;

  const samples = [];
  let cookie = null;

  const step = async (options) => {
    const result =
      await performJsonRequest({
        fetchImpl,
        baseUrl,
        timeoutMs,
        ...options
      });

    samples.push(result.sample);

    if (result.cookie) {
      cookie = result.cookie;
    }

    return result;
  };

  const login =
    await step({
      path:
        '/api/auth/demo-login',
      method: 'POST',
      body: {
        customerId:
          workload.customerId
      },
      operation:
        'DEMO_LOGIN',
      validate: (payload) =>
        payload?.ok === true &&
        payload?.user?.customerId ===
          workload.customerId
    });

  if (!login.sample.ok || !cookie) {
    return {
      ok: false,
      samples
    };
  }

  const association =
    await step({
      path:
        `/api/session/${encodeURIComponent(sessionId)}/customer`,
      method: 'POST',
      cookie,
      body: {
        customerId:
          workload.customerId
      },
      operation:
        'SESSION_ASSOCIATION',
      validate: (payload) =>
        payload?.ok === true &&
        payload?.sessionId ===
          sessionId
    });

  if (!association.sample.ok) {
    return {
      ok: false,
      samples
    };
  }

  const appChannel =
    await step({
      path:
        `/api/session/${encodeURIComponent(sessionId)}/channel`,
      method: 'POST',
      cookie,
      body: {
        channel:
          'MI_MOVISTAR'
      },
      operation:
        'CHANNEL_TOUCH',
      validate: (payload) =>
        payload?.ok === true &&
        hasVisitedChannel(
          payload,
          'MI_MOVISTAR'
        )
    });

  if (!appChannel.sample.ok) {
    return {
      ok: false,
      samples
    };
  }

  const appExperience =
    await step({
      path: '/api/app/me',
      cookie,
      operation:
        'APP_EXPERIENCE',
      validate: (payload) =>
        payload?.customer?.customerId ===
          workload.customerId &&
        payload?.financialTrace
          ?.financialReasoning ===
          'DETERMINISTIC'
    });

  if (!appExperience.sample.ok) {
    return {
      ok: false,
      samples
    };
  }

  const chat =
    await step({
      path: '/api/chat',
      method: 'POST',
      cookie,
      body: {
        sessionId,
        message:
          workload.chatMessage
      },
      operation:
        'LUCIA_CHAT',
      validate: (payload) =>
        payload?.sessionId ===
          sessionId &&
        payload?.authenticated ===
          true &&
        payload?.foundData === true &&
        payload?.financialReasoningByLlm ===
          false &&
        typeof payload?.reply ===
          'string' &&
        payload.reply.length > 0 &&
        hasVisitedChannel(
          payload,
          'LUCIA_WEB'
        )
    });

  if (!chat.sample.ok) {
    return {
      ok: false,
      samples
    };
  }

  const whatsapp =
    await step({
      path:
        '/api/channels/whatsapp/inbound',
      method: 'POST',
      cookie,
      body: {
        sessionId,
        message:
          'No entendí, explícamelo más fácil',
        providerMessageId:
          `phase21.${runLabel}.${index}`
      },
      operation:
        'WHATSAPP_REPAIR',
      validate: (payload) =>
        payload?.sessionId ===
          sessionId &&
        payload?.channel ===
          'WHATSAPP' &&
        payload?.foundData === true &&
        payload?.financialReasoningByLlm ===
          false &&
        typeof payload?.reply ===
          'string' &&
        payload.reply.length > 0 &&
        hasVisitedChannel(
          payload,
          'WHATSAPP'
        )
    });

  if (!whatsapp.sample.ok) {
    return {
      ok: false,
      samples
    };
  }

  const continuity =
    await step({
      path:
        `/api/session/${encodeURIComponent(sessionId)}/continuity`,
      cookie,
      operation:
        'CONTINUITY_READ',
      validate: (payload) =>
        payload?.sessionId ===
          sessionId &&
        hasVisitedChannel(
          payload,
          'MI_MOVISTAR'
        ) &&
        hasVisitedChannel(
          payload,
          'LUCIA_WEB'
        ) &&
        hasVisitedChannel(
          payload,
          'WHATSAPP'
        ) &&
        Array.isArray(
          payload?.recentMessages
        ) &&
        payload.recentMessages.length >= 4
    });

  return {
    ok:
      continuity.sample.ok &&
      samples.every(
        (sample) =>
          sample.ok === true
      ),
    samples
  };
}

async function runPool({
  total,
  concurrency,
  worker
}) {
  const results =
    new Array(total);

  let nextIndex = 0;

  async function consume() {
    while (true) {
      const index =
        nextIndex;

      nextIndex += 1;

      if (index >= total) {
        return;
      }

      try {
        results[index] =
          await worker(index);
      } catch (error) {
        results[index] = {
          ok: false,
          samples: [
            createSafeFailure(
              'JOURNEY',
              'JOURNEY_UNEXPECTED_ERROR',
              0
            )
          ]
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            total,
            concurrency
          )
      },
      () => consume()
    )
  );

  return results;
}

async function runLoadStage({
  baseUrl,
  label,
  journeys,
  concurrency,
  timeoutMs,
  fetchImpl = fetch
}) {
  const startedAt = nowMs();

  const results =
    await runPool({
      total: journeys,
      concurrency,
      worker: (index) =>
        runVirtualJourney({
          baseUrl,
          index,
          runLabel: label,
          timeoutMs,
          fetchImpl
        })
    });

  const wallDurationMs =
    nowMs() -
    startedAt;

  return summarizeLoadRun({
    label,
    journeys,
    concurrency,
    wallDurationMs,
    results
  });
}

async function runPerformanceBenchmark({
  baseUrl,
  profile = {},
  fetchImpl = fetch,
  environment = null,
  onStage = null
}) {
  const normalized =
    normalizePerformanceProfile(
      profile
    );

  if (
    typeof onStage ===
    'function'
  ) {
    onStage('WARMUP');
  }

  await runLoadStage({
    baseUrl,
    label: 'warmup',
    journeys:
      normalized.warmupJourneys,
    concurrency: 1,
    timeoutMs:
      normalized.requestTimeoutMs,
    fetchImpl
  });

  if (
    typeof onStage ===
    'function'
  ) {
    onStage('BASELINE');
  }

  const baseline =
    await runLoadStage({
      baseUrl,
      label: 'baseline',
      journeys:
        normalized.baselineJourneys,
      concurrency:
        normalized.baselineConcurrency,
      timeoutMs:
        normalized.requestTimeoutMs,
      fetchImpl
    });

  if (
    typeof onStage ===
    'function'
  ) {
    onStage('TARGET');
  }

  const target =
    await runLoadStage({
      baseUrl,
      label:
        `${normalized.loadMultiplier}x`,
      journeys:
        normalized.targetJourneys,
      concurrency:
        normalized.targetConcurrency,
      timeoutMs:
        normalized.requestTimeoutMs,
      fetchImpl
    });

  return buildPerformanceReport({
    profile:
      normalized,
    baseline,
    target,
    environment
  });
}

module.exports = {
  DEMO_WORKLOADS,
  extractCookie,
  createSafeFailure,
  performJsonRequest,
  runVirtualJourney,
  runPool,
  runLoadStage,
  runPerformanceBenchmark
};
