const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isGeneralBillingEducationQuery,
  requiresPersonalBillingAccess,
  classifyPersonalBillingIntent,
  buildGeneralBillingEducationReply,
  buildPersonalBillingReply
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
            'Se agregó S/ 4.58 por reconexión.',
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
