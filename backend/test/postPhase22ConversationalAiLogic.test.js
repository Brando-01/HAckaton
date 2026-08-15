const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasUsableGroqApiKey,
  sanitizeSemanticInterpretation,
  shouldAttemptSemanticInterpretation,
  mergeConversationPlanWithAi,
  validateNaturalizedReply,
  getConversationalGroundingPolicy
} = require(
  '../services/desafio1ConversationalAiLogic'
);

test(
  'placeholders de Groq no activan la capa conversacional',
  () => {
    assert.equal(
      hasUsableGroqApiKey(
        'gsk_test_placeholder'
      ),
      false
    );
    assert.equal(
      hasUsableGroqApiKey(
        'gsk_phase22_preflight_placeholder'
      ),
      false
    );
    assert.equal(
      hasUsableGroqApiKey(
        'gsk_real_key_for_demo_123456789'
      ),
      true
    );
  }
);

test(
  'interpretación semántica solo conserva intents permitidos',
  () => {
    const result =
      sanitizeSemanticInterpretation({
        domain: 'BILLING',
        billingIntents: [
          'CURRENT_TOTAL',
          'TRANSFER_MONEY',
          'CURRENT_TOTAL'
        ],
        profileIntents: [
          'CURRENT_PLAN',
          'PRIVATE_KEY'
        ],
        confidence: 0.92
      });

    assert.deepEqual(
      result.billingIntents,
      ['CURRENT_TOTAL']
    );
    assert.deepEqual(
      result.profileIntents,
      ['CURRENT_PLAN']
    );
    assert.equal(
      result.domain,
      'COMPOSITE'
    );
  }
);

test(
  'fallback semántico no reemplaza un plan determinista existente',
  () => {
    const plan = {
      intentCount: 1,
      billingIntents: [
        'CURRENT_TOTAL'
      ],
      profileIntents: [],
      repair: false
    };

    const merged =
      mergeConversationPlanWithAi(
        plan,
        {
          confidence: 0.99,
          billingIntents: [
            'EXPLANATION'
          ],
          profileIntents: []
        }
      );

    assert.equal(
      merged.applied,
      false
    );
    assert.equal(
      merged.plan,
      plan
    );
  }
);

test(
  'fallback semántico puede completar un intent faltante sin introducir facts',
  () => {
    const plan = {
      message:
        '¿Qué importe me están cargando este mes?',
      intentCount: 0,
      billingIntents: [],
      profileIntents: [],
      repair: false,
      domain: null,
      isComposite: false,
      needsProfile: false,
      needsBilling: false
    };

    assert.equal(
      shouldAttemptSemanticInterpretation(
        plan.message,
        plan,
        { authenticated: true }
      ),
      true
    );

    const merged =
      mergeConversationPlanWithAi(
        plan,
        {
          confidence: 0.91,
          billingIntents: [
            'CURRENT_TOTAL'
          ],
          profileIntents: []
        }
      );

    assert.equal(
      merged.applied,
      true
    );
    assert.deepEqual(
      merged.plan.billingIntents,
      ['CURRENT_TOTAL']
    );
    assert.equal(
      merged.plan.domain,
      'BILLING'
    );
  }
);

test(
  'una consulta general de planes no dispara por sí sola el fallback personal',
  () => {
    assert.equal(
      shouldAttemptSemanticInterpretation(
        '¿Qué planes existen?',
        {
          intentCount: 0,
          repair: false
        },
        { authenticated: false }
      ),
      false
    );
  }
);

test(
  'naturalización acepta reformular sin cambiar claims protegidos',
  () => {
    const validation =
      validateNaturalizedReply({
        baseReply:
          'Tu recibo actual es S/ 67.47. Se agregó S/ 4.58 por reconexión el 17/06/2026.',
        candidateReply:
          'Tu recibo actual es S/ 67.47. En sencillo: el aumento incluye S/ 4.58 por la reconexión del 17/06/2026.'
      });

    assert.equal(
      validation.ok,
      true
    );
  }
);

test(
  'naturalización rechaza un monto nuevo aunque el texto suene mejor',
  () => {
    const validation =
      validateNaturalizedReply({
        baseReply:
          'Tu recibo actual es S/ 67.47.',
        candidateReply:
          'Tu recibo actual es S/ 70.00.'
      });

    assert.equal(
      validation.ok,
      false
    );
    assert.equal(
      validation.reply,
      'Tu recibo actual es S/ 67.47.'
    );
  }
);

test(
  'naturalización rechaza una fecha o número adicional',
  () => {
    const validation =
      validateNaturalizedReply({
        baseReply:
          'La reconexión fue el 17/06/2026 y costó S/ 4.58.',
        candidateReply:
          'La reconexión fue el 17/06/2026 y costó S/ 4.58; ocurrió 2 veces.'
      });

    assert.equal(
      validation.ok,
      false
    );
  }
);

test(
  'política congelada mantiene al LLM fuera de la autoridad financiera',
  () => {
    const policy =
      getConversationalGroundingPolicy();

    assert.equal(
      policy.financialReasoningAuthority,
      'STRUCTURED_DATA_AND_DETERMINISTIC_RULES'
    );
    assert.equal(
      policy.llmMayCreateFinancialFacts,
      false
    );
    assert.equal(
      policy.deterministicFallbackRequired,
      true
    );
  }
);
