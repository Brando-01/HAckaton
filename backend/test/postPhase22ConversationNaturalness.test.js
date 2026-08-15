const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyPersonalBillingIntents,
  isAmbiguousCurrentPaymentQuestion,
  buildPersonalBillingReply
} = require(
  '../services/desafio1ConversationLogic'
);

function experience() {
  return {
    currentBill: {
      total: 67.47,
      period:
        'Ciclo 15/07/2026',
      status:
        'Estado no disponible'
    },
    previousBill: {
      total: 62.89,
      period:
        'Ciclo 15/06/2026'
    },
    comparison: {
      difference: 4.58,
      percentage: 7.3,
      direction: 'UP',
      causes: [
        {
          code: 'RECONNECTION',
          description:
            'Se agregó S/ 4.58 por la reconexión de tu servicio realizada el 17/06/2026. Este cargo ya está incluido en el total de tu recibo.',
          impact: 4.58,
          evidenceLevel: 'HIGH'
        }
      ]
    },
    findings: [],
    financialExplanation: {
      status:
        'FULLY_EXPLAINED',
      coveragePercent: 100,
      rentContext: {},
      customerFacing: {
        headline:
          'Tu recibo aumentó S/ 4.58',
        summary:
          'Se agregó S/ 4.58 por la reconexión de tu servicio realizada el 17/06/2026. Este cargo ya está incluido en el total de tu recibo.',
        limitations: []
      }
    }
  };
}

test(
  'cuánto estoy pagando actualmente se entiende como total actual y no cae al RAG general',
  () => {
    assert.deepEqual(
      classifyPersonalBillingIntents(
        '¿Cuánto estoy pagando actualmente?'
      ),
      ['CURRENT_TOTAL']
    );
    assert.equal(
      isAmbiguousCurrentPaymentQuestion(
        '¿Cuánto estoy pagando actualmente?'
      ),
      true
    );
  }
);

test(
  'cuál es mi recibo actual responde el total aunque el turno anterior haya sido explicación',
  () => {
    const result =
      buildPersonalBillingReply(
        experience(),
        '¿Cuál es mi recibo actual?',
        {
          hasPersonalBillingContext: true,
          lastBillingIntent:
            'EXPLANATION'
        }
      );

    assert.equal(
      result.intent,
      'CURRENT_TOTAL'
    );
    assert.match(
      result.reply,
      /S\/ 67\.47/
    );
    assert.doesNotMatch(
      result.reply,
      /reconexi[oó]n/i
    );
  }
);

test(
  'frase ambigua de pago separa total de recibo y saldo pendiente',
  () => {
    const result =
      buildPersonalBillingReply(
        experience(),
        '¿Cuánto estoy pagando actualmente?'
      );

    assert.equal(
      result.intent,
      'CURRENT_TOTAL'
    );
    assert.match(
      result.reply,
      /S\/ 67\.47/
    );
    assert.match(
      result.reply,
      /saldo pendiente exacto/i
    );
    assert.match(
      result.reply,
      /no est[aá] disponible/i
    );
  }
);

test(
  'forcedIntent permite usar una interpretación semántica validada sin delegar los facts al LLM',
  () => {
    const result =
      buildPersonalBillingReply(
        experience(),
        '¿Qué importe me están cargando este mes?',
        {
          forcedIntent:
            'CURRENT_TOTAL'
        }
      );

    assert.equal(
      result.intent,
      'CURRENT_TOTAL'
    );
    assert.match(
      result.reply,
      /S\/ 67\.47/
    );
    assert.equal(
      result.financialReasoningByLlm,
      false
    );
  }
);
