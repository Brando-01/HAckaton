const {
  hasUsableGroqApiKey,
  sanitizeSemanticInterpretation,
  shouldAttemptSemanticInterpretation,
  validateNaturalizedReply
} = require(
  './desafio1ConversationalAiLogic'
);

const DEFAULT_MODEL =
  'llama-3.3-70b-versatile';

function disabledResult(reasonCode) {
  return {
    used: false,
    reasonCode,
    interpretation: null
  };
}

class Desafio1ConversationalAiService {
  constructor({
    client = null,
    apiKey = process.env.GROQ_API_KEY,
    enabled = true,
    model = DEFAULT_MODEL,
    timeoutMs = 2500
  } = {}) {
    this.model = model;
    this.enabled =
      enabled !== false &&
      Boolean(
        client ||
        hasUsableGroqApiKey(apiKey)
      );

    this.client = null;

    if (this.enabled) {
      if (client) {
        this.client = client;
      } else {
        // Carga diferida: la lógica y sus tests pueden ejecutarse
        // sin node_modules; en runtime real package.json aporta groq-sdk.
        const {
          Groq
        } = require('groq-sdk');

        this.client =
          new Groq({
            apiKey,
            timeout:
              Math.max(
                500,
                Number(timeoutMs) || 2500
              ),
            maxRetries: 0
          });
      }
    }
  }

  isEnabled() {
    return Boolean(
      this.enabled &&
      this.client
    );
  }

  async interpretTurn({
    message,
    deterministicPlan,
    authenticated = false
  }) {
    if (!this.isEnabled()) {
      return disabledResult(
        'CONVERSATIONAL_AI_DISABLED'
      );
    }

    if (
      !shouldAttemptSemanticInterpretation(
        message,
        deterministicPlan,
        { authenticated }
      )
    ) {
      return disabledResult(
        'DETERMINISTIC_PLAN_SUFFICIENT'
      );
    }

    try {
      const completion =
        await this.client.chat
          .completions.create({
            model: this.model,
            temperature: 0,
            max_tokens: 180,
            response_format: {
              type: 'json_object'
            },
            messages: [
              {
                role: 'system',
                content:
                  'Clasifica la intención del mensaje sin responder la consulta ni calcular datos. Devuelve SOLO JSON. Dominios: BILLING, PROFILE, COMPOSITE, GENERAL, UNKNOWN. billingIntents permitidos: CURRENT_TOTAL, PREVIOUS_BILL, BILL_HISTORY, HIGHEST_BILL, LATEST_INCREASE, CHARGE_RECURRENCE, PRORATION, DISCOUNT, PACKAGE_CHARGE, SUSPENSION_ADJUSTMENT, RENT_TYPE, EXPLANATION. profileIntents permitidos: PROFILE_SUMMARY, CUSTOMER_ID, ACTIVATION_DATE, BILLING_CYCLE, SERVICE_TYPE, BUSINESS_TYPE, CURRENT_PLAN, DEBT_STATUS, CURRENT_CHARGES, RECONNECTION_STATUS, DATA_ORIGIN. Nunca inventes montos, fechas, IDs ni códigos. Formato: {"domain":"...","billingIntents":[],"profileIntents":[],"confidence":0.0}.'
              },
              {
                role: 'user',
                content:
                  String(message || '')
              }
            ]
          });

      const interpretation =
        sanitizeSemanticInterpretation(
          completion?.choices?.[0]
            ?.message?.content
        );

      if (!interpretation) {
        return disabledResult(
          'AI_INTERPRETATION_INVALID'
        );
      }

      return {
        used: true,
        reasonCode: 'OK',
        interpretation,
        model: this.model
      };
    } catch (_) {
      return disabledResult(
        'AI_INTERPRETATION_UNAVAILABLE'
      );
    }
  }

  async naturalizeReply({
    message,
    baseReply,
    intent = null,
    repair = false
  }) {
    const safeBase =
      String(baseReply ?? '').trim();

    if (!safeBase) {
      return {
        reply: safeBase,
        used: false,
        fallback: true,
        reasonCode:
          'EMPTY_BASE_REPLY'
      };
    }

    if (!this.isEnabled()) {
      return {
        reply: safeBase,
        used: false,
        fallback: true,
        reasonCode:
          'CONVERSATIONAL_AI_DISABLED'
      };
    }

    try {
      const completion =
        await this.client.chat
          .completions.create({
            model: this.model,
            temperature: 0.25,
            max_tokens: 260,
            messages: [
              {
                role: 'system',
                content:
                  'Eres la capa de lenguaje de Lucía. SOLO reescribe la RESPUESTA BASE para que suene humana, breve y contextual. No calcules ni deduzcas finanzas. No agregues, cambies ni elimines montos, porcentajes, fechas o códigos presentes en la respuesta base. No agregues ningún dato numérico nuevo. No afirmes deuda, vencimiento, producto, causa o estado que no aparezca en la respuesta base. Si es una reformulación, cambia de verdad la forma de explicarlo sin cambiar los hechos. Devuelve únicamente la respuesta final, sin JSON ni comentarios.'
              },
              {
                role: 'user',
                content:
                  [
                    `Mensaje del cliente: ${String(message || '')}`,
                    `Intención validada por backend: ${intent || 'N/D'}`,
                    `Es reformulación: ${repair ? 'sí' : 'no'}`,
                    'RESPUESTA BASE (fuente de verdad):',
                    safeBase
                  ].join('\n')
              }
            ]
          });

      const candidate =
        completion?.choices?.[0]
          ?.message?.content || '';

      const validation =
        validateNaturalizedReply({
          baseReply: safeBase,
          candidateReply: candidate
        });

      if (!validation.ok) {
        return {
          reply: safeBase,
          used: false,
          fallback: true,
          reasonCode:
            validation.reasonCode,
          model: this.model
        };
      }

      return {
        reply: validation.reply,
        used: true,
        fallback: false,
        reasonCode: 'OK',
        model: this.model
      };
    } catch (_) {
      return {
        reply: safeBase,
        used: false,
        fallback: true,
        reasonCode:
          'AI_LANGUAGE_UNAVAILABLE',
        model: this.model
      };
    }
  }
}

function createDesafio1ConversationalAiService(
  options = {}
) {
  return new Desafio1ConversationalAiService(
    options
  );
}

module.exports = {
  DEFAULT_MODEL,
  Desafio1ConversationalAiService,
  createDesafio1ConversationalAiService
};
