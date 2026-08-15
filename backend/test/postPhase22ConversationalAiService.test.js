const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDesafio1ConversationalAiService
} = require(
  '../services/desafio1ConversationalAiService'
);

function fakeClient(responses) {
  let index = 0;

  return {
    chat: {
      completions: {
        async create() {
          const content =
            responses[
              Math.min(
                index,
                responses.length - 1
              )
            ];
          index += 1;
          return {
            choices: [
              {
                message: {
                  content
                }
              }
            ]
          };
        }
      }
    }
  };
}

test(
  'servicio Groq puede proponer solo un intent seguro cuando falta el determinista',
  async () => {
    const service =
      createDesafio1ConversationalAiService({
        client:
          fakeClient([
            JSON.stringify({
              domain: 'BILLING',
              billingIntents: [
                'CURRENT_TOTAL'
              ],
              profileIntents: [],
              confidence: 0.93
            })
          ])
      });

    const result =
      await service.interpretTurn({
        message:
          '¿Qué importe me están cargando este mes?',
        deterministicPlan: {
          intentCount: 0,
          repair: false
        },
        authenticated: true
      });

    assert.equal(result.used, true);
    assert.deepEqual(
      result.interpretation
        .billingIntents,
      ['CURRENT_TOTAL']
    );
  }
);

test(
  'servicio no llama al LLM semántico si el backend ya reconoció el intent',
  async () => {
    const service =
      createDesafio1ConversationalAiService({
        client:
          fakeClient([
            'esto no debería usarse'
          ])
      });

    const result =
      await service.interpretTurn({
        message:
          '¿Cuál es mi recibo actual?',
        deterministicPlan: {
          intentCount: 1,
          repair: false,
          billingIntents: [
            'CURRENT_TOTAL'
          ]
        },
        authenticated: true
      });

    assert.equal(result.used, false);
    assert.equal(
      result.reasonCode,
      'DETERMINISTIC_PLAN_SUFFICIENT'
    );
  }
);

test(
  'naturalizador acepta lenguaje distinto con los mismos hechos',
  async () => {
    const service =
      createDesafio1ConversationalAiService({
        client:
          fakeClient([
            'Tu recibo actual es S/ 67.47. En pocas palabras, ese es el total verificado.'
          ])
      });

    const result =
      await service.naturalizeReply({
        message:
          '¿Cuál es mi recibo actual?',
        baseReply:
          'Tu recibo actual es S/ 67.47.',
        intent:
          'CURRENT_TOTAL'
      });

    assert.equal(result.used, true);
    assert.match(
      result.reply,
      /S\/ 67\.47/
    );
  }
);

test(
  'naturalizador cae al determinista si Groq cambia el monto',
  async () => {
    const service =
      createDesafio1ConversationalAiService({
        client:
          fakeClient([
            'Tu recibo actual es S/ 99.99.'
          ])
      });

    const result =
      await service.naturalizeReply({
        message:
          '¿Cuál es mi recibo actual?',
        baseReply:
          'Tu recibo actual es S/ 67.47.',
        intent:
          'CURRENT_TOTAL'
      });

    assert.equal(result.used, false);
    assert.equal(result.fallback, true);
    assert.equal(
      result.reply,
      'Tu recibo actual es S/ 67.47.'
    );
  }
);

test(
  'servicio deshabilitado conserva siempre el fallback determinista',
  async () => {
    const service =
      createDesafio1ConversationalAiService({
        enabled: false
      });

    const result =
      await service.naturalizeReply({
        message: 'hola',
        baseReply: 'Respuesta base.'
      });

    assert.equal(result.used, false);
    assert.equal(
      result.reply,
      'Respuesta base.'
    );
  }
);
