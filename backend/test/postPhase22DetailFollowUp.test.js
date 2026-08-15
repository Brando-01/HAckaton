const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  isBillingDetailRequest,
  isBillingRepairRequest,
  requiresPersonalBillingAccess,
  classifyPersonalBillingIntents,
  buildCurrentBillDetailReply,
  buildPreviousBillDetailReply,
  buildPersonalBillingReply
} = require(
  '../services/desafio1ConversationLogic'
);

const {
  planCustomerConversationTurn
} = require(
  '../services/desafio1ConversationalOrchestrator'
);

function experience() {
  return {
    currentBill: {
      total: 67.47,
      period: 'Ciclo 15/07/2026',
      status: 'Estado no disponible',
      items: [
        {
          label: 'Plan principal',
          amount: 62.89
        },
        {
          label: 'Cargo por reconexión',
          amount: 4.58
        }
      ]
    },
    previousBill: {
      total: 62.89,
      period: 'Ciclo 15/06/2026',
      items: [
        {
          label: 'Plan principal',
          amount: 62.89
        }
      ]
    },
    comparison: {
      difference: 4.58,
      percentage: 7.3,
      causes: [
        {
          code: 'RECONNECTION',
          description:
            'Se agregó S/ 4.58 por la reconexión del servicio.',
          impact: 4.58
        }
      ]
    },
    findings: [],
    financialExplanation: {
      status: 'FULLY_EXPLAINED',
      coveragePercent: 100,
      customerFacing: {
        headline: 'Tu recibo aumentó S/ 4.58',
        summary:
          'Se agregó S/ 4.58 por la reconexión de tu servicio realizada el 17/06/2026. Este cargo ya está incluido en el total de tu recibo.',
        limitations: []
      },
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV',
          label: 'Renta vencida'
        }
      }
    }
  };
}

test(
  'reconoce solicitudes naturales de mayor detalle',
  () => {
    assert.equal(
      isBillingDetailRequest(
        'Quiero saber más detalles de mi recibo actual'
      ),
      true
    );
    assert.equal(
      isBillingDetailRequest(
        'explícamelo a más detalle'
      ),
      true
    );
    assert.equal(
      isBillingDetailRequest(
        'más a detalle'
      ),
      true
    );
  }
);

test(
  'pedir mayor detalle no consume el umbral de incomprensión',
  () => {
    assert.equal(
      isBillingRepairRequest(
        'explícamelo a más detalle'
      ),
      false
    );
    assert.equal(
      isBillingRepairRequest(
        'No entendí, explícamelo más fácil'
      ),
      true
    );
  }
);

test(
  'un seguimiento de detalle sigue requiriendo contexto personal autenticado',
  () => {
    assert.equal(
      requiresPersonalBillingAccess(
        'más a detalle',
        {
          hasPersonalBillingContext: true
        }
      ),
      true
    );
  }
);

test(
  'detalle explícito del recibo actual conserva CURRENT_TOTAL como sujeto',
  () => {
    assert.deepEqual(
      classifyPersonalBillingIntents(
        'Quiero saber más detalles de mi recibo actual'
      ),
      ['CURRENT_TOTAL']
    );
  }
);

test(
  'más a detalle reutiliza el último sujeto financiero grounded',
  () => {
    assert.deepEqual(
      classifyPersonalBillingIntents(
        'más a detalle',
        {
          hasPersonalBillingContext: true,
          lastBillingIntent: 'CURRENT_TOTAL'
        }
      ),
      ['CURRENT_TOTAL']
    );
  }
);

test(
  'detalle del recibo actual amplía total comparación causa y conceptos sin inventar',
  () => {
    const reply =
      buildCurrentBillDetailReply(
        experience()
      );

    assert.match(reply, /S\/ 67\.47/);
    assert.match(reply, /S\/ 62\.89/);
    assert.match(reply, /aument[oó] S\/ 4\.58/i);
    assert.match(reply, /reconexi[oó]n/i);
    assert.match(reply, /Plan principal: S\/ 62\.89/);
    assert.match(reply, /Cargo por reconexi[oó]n: S\/ 4\.58/i);
  }
);

test(
  'buildPersonalBillingReply usa detalle expandido en vez de repetir el total',
  () => {
    const result =
      buildPersonalBillingReply(
        experience(),
        'Quiero saber más detalles de mi recibo actual',
        {
          forcedIntent: 'CURRENT_TOTAL',
          hasPersonalBillingContext: true,
          lastBillingIntent: 'CURRENT_TOTAL'
        }
      );

    assert.equal(result.intent, 'CURRENT_TOTAL');
    assert.match(result.reply, /S\/ 67\.47/);
    assert.match(result.reply, /S\/ 62\.89/);
    assert.match(result.reply, /reconexi[oó]n/i);
    assert.equal(
      result.financialReasoningByLlm,
      false
    );
  }
);

test(
  'detalle del recibo anterior no atribuye automáticamente la causa del recibo actual',
  () => {
    const reply =
      buildPreviousBillDetailReply(
        experience()
      );

    assert.match(reply, /S\/ 62\.89/);
    assert.match(reply, /S\/ 67\.47/);
    assert.match(reply, /subi[oó] S\/ 4\.58/i);
    assert.doesNotMatch(reply, /reconexi[oó]n/i);
  }
);

test(
  'primer recibo detallado no inventa comparación y conserva hallazgo verificado',
  () => {
    const firstBill = {
      currentBill: {
        total: 51.83,
        period: 'Ciclo 30/06/2026',
        items: []
      },
      previousBill: null,
      comparison: {
        difference: null,
        causes: []
      },
      financialExplanation: {
        customerFacing: {
          summary:
            'El recibo incluye S/ 21.92 de prorrateo por un periodo parcial.'
        }
      }
    };

    const reply =
      buildCurrentBillDetailReply(
        firstBill
      );

    assert.match(reply, /S\/ 51\.83/);
    assert.match(reply, /no hay un recibo anterior comparable/i);
    assert.match(reply, /S\/ 21\.92 de prorrateo/i);
  }
);

test(
  'orquestador conserva CURRENT_TOTAL en una cadena de mayor detalle sin marcar reparación',
  () => {
    const plan =
      planCustomerConversationTurn(
        'más a detalle',
        {
          lastBillingIntent: 'CURRENT_TOTAL',
          lastConversationDomain: 'BILLING',
          hasPersonalBillingContext: true
        }
      );

    assert.equal(plan.detailRequest, true);
    assert.equal(plan.repair, false);
    assert.equal(plan.domain, 'BILLING');
    assert.deepEqual(
      plan.billingIntents,
      ['CURRENT_TOTAL']
    );
  }
);

test(
  'orquestador puede profundizar una explicación de variación sin activar handoff de reparación',
  () => {
    const plan =
      planCustomerConversationTurn(
        'profundiza más',
        {
          lastBillingIntent: 'EXPLANATION',
          lastConversationDomain: 'BILLING',
          hasPersonalBillingContext: true
        }
      );

    assert.equal(plan.detailRequest, true);
    assert.equal(plan.repair, false);
    assert.deepEqual(
      plan.billingIntents,
      ['EXPLANATION']
    );
  }
);

test(
  'F22 congela que los follow-ups de detalle reutilicen sujeto grounded y no creen hechos',
  () => {
    const root = path.join(
      __dirname,
      '..',
      '..'
    );
    const policy = fs.readFileSync(
      path.join(
        root,
        'backend/services/desafio1ConversationalAiLogic.js'
      ),
      'utf8'
    );
    const preflight = fs.readFileSync(
      path.join(
        root,
        'backend/services/desafio1ChallengePreflightLogic.js'
      ),
      'utf8'
    );

    assert.match(
      policy,
      /groundedDetailFollowUpsReuseLastFinancialSubject:\s*true/
    );
    assert.match(
      preflight,
      /groundedDetailFollowUpsReuseSubject/
    );
  }
);
