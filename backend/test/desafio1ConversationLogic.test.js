const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isGeneralBillingEducationQuery,
  requiresPersonalBillingAccess,
  classifyPersonalBillingIntent,
  classifyPersonalBillingIntents,
  buildGeneralBillingEducationReply,
  buildPersonalBillingReply,
  buildPersonalBillingMultiReply
} = require(
  '../services/desafio1ConversationLogic'
);

function reconnectionExperience() {
  return {
    currentBill: {
      total: 34.48,
      period:
        'Ciclo 27/07/2026',
      status: 'Pendiente'
    },
    previousBill: {
      total: 29.9,
      period:
        'Ciclo 27/06/2026'
    },
    comparison: {
      difference: 4.58,
      percentage: 15.3,
      causes: [
        {
          code:
            'RECONNECTION',
          description:
            'Brainy Reconexiones confirma S/ 4.58 por reconexión.',
          impact: 4.58
        }
      ]
    },
    findings: [],
    financialExplanation: {
      status:
        'FULLY_EXPLAINED',
      coveragePercent: 100,
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV',
          label:
            'Renta vencida',
          definition:
            'Se factura después de transcurrido.'
        }
      },
      customerFacing: {
        headline:
          'Tu recibo aumentó S/ 4.58',
        summary:
          'Se agregó S/ 4.58 por reconexión.',
        limitations: [
          'El ciclo no se interpreta como fecha de emisión.'
        ]
      }
    }
  };
}

function prorationExperience() {
  return {
    currentBill: {
      total: 51.83,
      period:
        'Ciclo 30/06/2026',
      status: 'Pendiente'
    },
    previousBill: null,
    comparison: {
      difference: null,
      percentage: null,
      causes: []
    },
    findings: [
      {
        code:
          'PRORATION',
        description:
          'El recibo incluye S/ 21.92 de prorrateo por un periodo parcial.',
        impact: 21.92
      }
    ],
    financialExplanation: {
      status:
        'NO_PREVIOUS_BILL',
      coveragePercent: null,
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RA',
          label:
            'Renta adelantada',
          definition:
            'Se factura por adelantado.'
        }
      },
      customerFacing: {
        headline:
          'Tu recibo incluye un prorrateo de S/ 21.92',
        summary:
          'El recibo incluye S/ 21.92 de prorrateo.',
        limitations: []
      }
    }
  };
}

test(
  'una definición general de prorrateo no requiere autenticación',
  () => {
    assert.equal(
      isGeneralBillingEducationQuery(
        '¿Qué es un prorrateo?'
      ),
      true
    );
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Qué es un prorrateo?'
      ),
      false
    );
  }
);

test(
  'una consulta de cómo ver el recibo sigue siendo pública',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Cómo consulto mi recibo o estado de cuenta?'
      ),
      false
    );
  }
);

test(
  'las definiciones públicas críticas tienen respuesta determinista aunque no haya LLM',
  () => {
    assert.match(
      buildGeneralBillingEducationReply(
        '¿Qué es un prorrateo?'
      ),
      /cobro proporcional/i
    );

    assert.match(
      buildGeneralBillingEducationReply(
        '¿Cómo consulto mi recibo?'
      ),
      /iniciando sesión/i
    );
  }
);


test(
  'por qué subió mi recibo requiere autenticación',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Por qué subió mi recibo?'
      ),
      true
    );
  }
);

test(
  'cuánto debo requiere autenticación aunque no diga recibo',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Cuánto debo pagar?'
      ),
      true
    );
  }
);


test(
  'cuánto pago ahora también se reconoce como consulta personal natural',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Cuánto pago ahora?'
      ),
      true
    );
    assert.equal(
      classifyPersonalBillingIntent(
        '¿Cuánto pago ahora?'
      ),
      'CURRENT_TOTAL'
    );
  }
);

test(
  'qué tipo de renta tengo se trata como consulta personal',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Qué tipo de renta tengo?'
      ),
      true
    );

    assert.equal(
      requiresPersonalBillingAccess(
        '¿Cuál es mi tipo de renta?'
      ),
      true
    );
  }
);

test(
  'un seguimiento corto se vuelve personal solo si ya existe contexto financiero autenticado',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Y el mes pasado?',
        {
          hasPersonalBillingContext:
            false
        }
      ),
      false
    );

    assert.equal(
      requiresPersonalBillingAccess(
        '¿Y el mes pasado?',
        {
          hasPersonalBillingContext:
            true
        }
      ),
      true
    );
  }
);

test(
  'clasifica preguntas por intención sin pedirle al LLM que razone montos',
  () => {
    assert.equal(
      classifyPersonalBillingIntent(
        '¿Cuánto debo pagar?'
      ),
      'CURRENT_TOTAL'
    );
    assert.equal(
      classifyPersonalBillingIntent(
        '¿Cuál es el total de mi recibo?'
      ),
      'CURRENT_TOTAL'
    );
    assert.equal(
      classifyPersonalBillingIntent(
        '¿Qué prorrateo tengo?'
      ),
      'PRORATION'
    );
    assert.equal(
      classifyPersonalBillingIntent(
        '¿Qué tipo de renta tengo?'
      ),
      'RENT_TYPE'
    );
  }
);

test(
  'la explicación de reconexión usa únicamente el texto seguro de Fase 3',
  () => {
    const result =
      buildPersonalBillingReply(
        reconnectionExperience(),
        '¿Por qué subió mi recibo?'
      );

    assert.equal(
      result.source,
      'DESAFIO1_DETERMINISTIC'
    );
    assert.equal(
      result.financialReasoningByLlm,
      false
    );
    assert.match(
      result.reply,
      /S\/ 4\.58/
    );
    assert.match(
      result.reply,
      /reconexión/i
    );
    assert.doesNotMatch(
      result.reply,
      /Brainy/i
    );
    assert.doesNotMatch(
      result.reply,
      /fecha de emisión/i
    );
  }
);

test(
  'la consulta de total actual responde el monto reconstruido',
  () => {
    const result =
      buildPersonalBillingReply(
        reconnectionExperience(),
        '¿Cuánto debo pagar?'
      );

    assert.equal(
      result.intent,
      'CURRENT_TOTAL'
    );
    assert.match(
      result.reply,
      /S\/ 34\.48/
    );

    const naturalTotalQuestion =
      buildPersonalBillingReply(
        reconnectionExperience(),
        '¿Cuál es el total de mi recibo?'
      );

    assert.equal(
      naturalTotalQuestion.intent,
      'CURRENT_TOTAL'
    );
    assert.match(
      naturalTotalQuestion.reply,
      /S\/ 34\.48/
    );
    assert.doesNotMatch(
      naturalTotalQuestion.reply,
      /mismo total/i
    );
  }
);

test(
  'Ana puede preguntar por prorrateo sin que se invente un recibo anterior',
  () => {
    const proration =
      buildPersonalBillingReply(
        prorationExperience(),
        'Explícame mi prorrateo'
      );

    assert.match(
      proration.reply,
      /S\/ 21\.92/
    );

    const previous =
      buildPersonalBillingReply(
        prorationExperience(),
        '¿Y el mes pasado?',
        {
          hasPersonalBillingContext:
            true
        }
      );

    assert.match(
      previous.reply,
      /no hay un recibo anterior/i
    );
  }
);

test(
  'el tipo de renta se responde solo cuando está resuelto',
  () => {
    const result =
      buildPersonalBillingReply(
        prorationExperience(),
        '¿Qué tipo de renta tengo?'
      );

    assert.match(
      result.reply,
      /Renta adelantada \(RA\)/
    );
  }
);


test(
  'detecta varias preguntas financieras en un solo turno',
  () => {
    assert.deepEqual(
      classifyPersonalBillingIntents(
        '¿Cuánto pago ahora, cuánto pagué el mes pasado y por qué cambió mi recibo?'
      ),
      [
        'PREVIOUS_BILL',
        'CURRENT_TOTAL',
        'EXPLANATION'
      ]
    );
  }
);

test(
  'no entendí conserva la última intención financiera en vez de cambiar de tema',
  () => {
    assert.equal(
      classifyPersonalBillingIntent(
        'No entendí, explícamelo más fácil',
        {
          hasPersonalBillingContext:
            true,
          lastBillingIntent:
            'CURRENT_TOTAL'
        }
      ),
      'CURRENT_TOTAL'
    );

    const result =
      buildPersonalBillingReply(
        reconnectionExperience(),
        'No entendí, explícamelo más fácil',
        {
          hasPersonalBillingContext:
            true,
          lastBillingIntent:
            'CURRENT_TOTAL'
        }
      );

    assert.match(
      result.reply,
      /Recibo actual: S\/ 34\.48/
    );
    assert.doesNotMatch(
      result.reply,
      /aumentó S\/ 4\.58/i
    );
  }
);


test(
  'una reparación financiera multi-intent responde en lenguaje corrido y no repite bullets',
  () => {
    const reply =
      buildPersonalBillingMultiReply(
        reconnectionExperience(),
        [
          'CURRENT_TOTAL',
          'PREVIOUS_BILL'
        ],
        { repair: true }
      );

    assert.match(reply, /En simple/i);
    assert.match(reply, /S\/ 34\.48/);
    assert.match(reply, /S\/ 29\.90/);
    assert.doesNotMatch(reply, /•/);
  }
);

test(
  'multi-intent financiero responde cada punto sin usar LLM para montos',
  () => {
    const reply =
      buildPersonalBillingMultiReply(
        reconnectionExperience(),
        [
          'CURRENT_TOTAL',
          'PREVIOUS_BILL',
          'EXPLANATION'
        ]
      );

    assert.match(
      reply,
      /S\/ 34\.48/
    );
    assert.match(
      reply,
      /S\/ 29\.90/
    );
    assert.match(
      reply,
      /reconexión/i
    );
  }
);

test(
  'una pregunta personal por un cobro de paquete requiere autenticación y usa intención dedicada',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        '¿Me cobraron algún paquete en mi recibo?'
      ),
      true
    );

    assert.equal(
      classifyPersonalBillingIntent(
        '¿Me cobraron algún paquete en mi recibo?'
      ),
      'PACKAGE_CHARGE'
    );
  }
);

test(
  'Lucía explica un paquete solo cuando Fase 13 lo reconoce como causa verificable',
  () => {
    const experience = {
      currentBill: {
        total: 49.89,
        period:
          'Ciclo 15/07/2026',
        status: 'Sin deuda'
      },
      previousBill: {
        total: 39.9,
        period:
          'Ciclo 15/06/2026'
      },
      comparison: {
        difference: 9.99,
        causes: [
          {
            code: 'PACKAGES',
            description:
              'En tu recibo apareció un cargo de S/ 9.99 correspondiente al paquete "Paquete 3GB de Internet".',
            impact: 9.99
          }
        ]
      },
      findings: [],
      financialExplanation: {
        status:
          'FULLY_EXPLAINED',
        coveragePercent: 100,
        customerFacing: {
          headline:
            'Tu recibo aumentó S/ 9.99',
          summary:
            'El paquete explica la variación.',
          limitations: []
        }
      }
    };

    const result =
      buildPersonalBillingReply(
        experience,
        '¿Me cobraron algún paquete en mi recibo?'
      );

    assert.equal(
      result.intent,
      'PACKAGE_CHARGE'
    );
    assert.match(
      result.reply,
      /S\/ 9\.99/
    );
    assert.match(
      result.reply,
      /Paquete 3GB/i
    );
    assert.equal(
      result.financialReasoningByLlm,
      false
    );
  }
);

test(
  'Lucía no inventa un paquete cuando el motor causal no lo verificó',
  () => {
    const result =
      buildPersonalBillingReply(
        reconnectionExperience(),
        '¿Me cobraron algún paquete en mi recibo?'
      );

    assert.equal(
      result.intent,
      'PACKAGE_CHARGE'
    );
    assert.match(
      result.reply,
      /no encontr[eé] una variaci[oó]n verificable/i
    );
  }
);
