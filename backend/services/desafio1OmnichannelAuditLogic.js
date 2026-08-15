const {
  CHANNELS,
  buildEmptyContinuityState,
  recordChannelTouch,
  buildSafeContinuitySnapshot,
  buildWhatsAppInboundEnvelope
} = require(
  './desafio1OmnichannelLogic'
);

function buildAssertion(
  code,
  passed,
  detail
) {
  return {
    code,
    passed: Boolean(passed),
    detail
  };
}

function runOmnichannelContractAudit() {
  let state =
    buildEmptyContinuityState();

  state = recordChannelTouch(
    state,
    {
      channel:
        CHANNELS.MI_MOVISTAR,
      event: 'VIEW',
      at: '2026-08-14T18:00:00.000Z'
    }
  );

  state = recordChannelTouch(
    state,
    {
      channel:
        CHANNELS.MI_MOVISTAR,
      event: 'VIEW',
      at: '2026-08-14T18:00:01.000Z'
    }
  );

  state = recordChannelTouch(
    state,
    {
      channel:
        CHANNELS.LUCIA_WEB,
      event: 'CHAT_MESSAGE',
      at: '2026-08-14T18:00:02.000Z'
    }
  );

  state = recordChannelTouch(
    state,
    {
      channel:
        CHANNELS.WHATSAPP,
      event: 'WHATSAPP_MESSAGE',
      at: '2026-08-14T18:00:03.000Z'
    }
  );

  state = recordChannelTouch(
    state,
    {
      channel:
        CHANNELS.ADVISOR,
      event: 'HANDOFF',
      at: '2026-08-14T18:00:04.000Z'
    }
  );

  const snapshot =
    buildSafeContinuitySnapshot(
      state
    );

  const envelope =
    buildWhatsAppInboundEnvelope({
      sessionId: 's_contract_demo',
      message:
        'No entendí, explícamelo más fácil',
      providerMessageId:
        'wamid.demo.001',
      customerId:
        'SHOULD_NOT_BE_USED',
      phone:
        '+51999999999'
    });

  const assertions = [
    buildAssertion(
      'SAME_CHANNEL_IS_IDEMPOTENT',
      snapshot.transitionCount === 3,
      'Repetir Mi Movistar no crea una transición ficticia.'
    ),
    buildAssertion(
      'FULL_JOURNEY_PRESERVED',
      snapshot.visitedChannels.join('>') ===
        [
          CHANNELS.MI_MOVISTAR,
          CHANNELS.LUCIA_WEB,
          CHANNELS.WHATSAPP,
          CHANNELS.ADVISOR
        ].join('>'),
      'La ruta conserva App → Lucía → WhatsApp → Asesor.'
    ),
    buildAssertion(
      'OMNICHANNEL_FLAG_REQUIRES_MULTIPLE_CHANNELS',
      snapshot.isOmnichannel === true,
      'La sesión se marca omnicanal solo cuando recorrió más de un canal.'
    ),
    buildAssertion(
      'WHATSAPP_REUSES_CONVERSATION_ID',
      envelope.sessionId ===
        's_contract_demo',
      'El adaptador recibe una conversación existente en lugar de crear una identidad financiera paralela.'
    ),
    buildAssertion(
      'WHATSAPP_DOES_NOT_ACCEPT_CUSTOMER_ID_OR_PHONE_AS_IDENTITY',
      !Object.prototype.hasOwnProperty.call(
        envelope,
        'customerId'
      ) &&
      !Object.prototype.hasOwnProperty.call(
        envelope,
        'phone'
      ),
      'La identidad del adaptador no se toma de customerId/teléfono enviados por el payload.'
    ),
    buildAssertion(
      'WHATSAPP_CONTRACT_IS_PROVIDER_NEUTRAL',
      envelope.provider ===
        'SIMULATED_WHATSAPP' &&
      envelope.channel ===
        CHANNELS.WHATSAPP,
      'El contrato está listo para un proveedor real, pero la demo declara que el proveedor actual es simulado.'
    )
  ];

  const failed =
    assertions.filter(
      (item) => !item.passed
    );

  return {
    schemaVersion:
      'desafio1-phase20-omnichannel-audit-v1',
    phase: 'PHASE_20',
    status:
      failed.length
        ? 'FAIL'
        : 'PASS',
    assertions,
    passed:
      assertions.length -
      failed.length,
    failed:
      failed.length,
    journey:
      snapshot.journey,
    safeguards: [
      'WhatsApp es un adaptador simulado; no se afirma integración live con Meta/Twilio.',
      'La cookie autenticada sigue siendo la autoridad de identidad en la demo.',
      'El canal no calcula montos ni causas; reutiliza el motor financiero ya auditado.',
      'El handoff conserva una ruta segura de canales sin claves privadas del dataset.'
    ]
  };
}

module.exports = {
  runOmnichannelContractAudit
};
