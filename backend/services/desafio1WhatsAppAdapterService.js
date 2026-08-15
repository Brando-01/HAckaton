const {
  buildWhatsAppInboundEnvelope,
  buildWhatsAppAdapterMetadata
} = require(
  './desafio1OmnichannelLogic'
);

const DEDUPE_TTL_MS =
  30 * 60 * 1000;

function createDesafio1WhatsAppAdapterService(
  options = {}
) {
  const seen = new Map();
  const now =
    typeof options.now === 'function'
      ? options.now
      : () => Date.now();

  function purgeExpired() {
    const current = now();

    for (const [key, item] of
      seen.entries()) {
      if (
        current - item.seenAt >
        DEDUPE_TTL_MS
      ) {
        seen.delete(key);
      }
    }
  }

  function prepareInbound(body) {
    const envelope =
      buildWhatsAppInboundEnvelope(
        body
      );

    purgeExpired();

    const providerMessageId =
      envelope.providerMessageId;

    if (!providerMessageId) {
      return {
        envelope,
        duplicate: false,
        adapter:
          buildWhatsAppAdapterMetadata(
            envelope
          )
      };
    }

    const key =
      `${envelope.provider}:` +
      `${envelope.sessionId}:` +
      providerMessageId;

    const existing = seen.get(key);

    if (existing) {
      return {
        envelope,
        duplicate: true,
        adapter:
          buildWhatsAppAdapterMetadata(
            envelope,
            { duplicate: true }
          )
      };
    }

    seen.set(key, {
      sessionId:
        envelope.sessionId,
      seenAt: now()
    });

    return {
      envelope,
      duplicate: false,
      adapter:
        buildWhatsAppAdapterMetadata(
          envelope
        )
    };
  }

  function reset() {
    seen.clear();
  }

  return {
    prepareInbound,
    reset
  };
}

module.exports = {
  DEDUPE_TTL_MS,
  createDesafio1WhatsAppAdapterService
};
