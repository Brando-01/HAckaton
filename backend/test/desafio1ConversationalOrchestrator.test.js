const test = require('node:test');
const assert = require('node:assert/strict');

const {
  planCustomerConversationTurn,
  buildCompositeCustomerReply
} = require(
  '../services/desafio1ConversationalOrchestrator'
);

function profile() {
  return {
    visibleId: 'DEMO000001',
    customerCode: 'TEST-CUSTOMER-001',
    activationDate:
      '2017-12-14 00:00:00',
    billingCycleDay: 15,
    lobType: 'WRLS',
    businessType: 'MOVIL'
  };
}

function experience() {
  return {
    customer: {
      plan: 'Plan Conversacional'
    },
    currentBill: {
      total: 82.9,
      period: 'Ciclo 15/07/2026',
      status: 'Sin deuda',
      items: []
    },
    previousBill: {
      total: 79.9,
      period: 'Ciclo 15/06/2026'
    },
    comparison: {
      causes: []
    },
    findings: [],
    financialExplanation: {
      customerFacing: {
        headline:
          'Tu recibo aumentó S/ 3.00',
        summary:
          'La variación tiene una causa verificada.'
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
  'planifica en un solo turno preguntas de perfil y facturación',
  () => {
    const plan =
      planCustomerConversationTurn(
        '¿Cuál es mi plan, cuánto pago ahora y tengo deuda?'
      );

    assert.deepEqual(
      plan.profileIntents,
      [
        'CURRENT_PLAN',
        'DEBT_STATUS'
      ]
    );
    assert.deepEqual(
      plan.billingIntents,
      ['CURRENT_TOTAL']
    );
    assert.equal(
      plan.isComposite,
      true
    );
    assert.equal(
      plan.intentCount,
      3
    );
  }
);

test(
  'construye una respuesta compuesta natural con todos los datos solicitados',
  () => {
    const plan =
      planCustomerConversationTurn(
        '¿Cuál es mi plan, cuánto pago ahora y tengo deuda?'
      );

    const reply =
      buildCompositeCustomerReply({
        plan,
        profile: profile(),
        experience: experience()
      });

    assert.match(
      reply,
      /punto por punto/i
    );
    assert.match(
      reply,
      /Plan Conversacional/
    );
    assert.match(
      reply,
      /S\/ 82\.90/
    );
    assert.match(
      reply,
      /sin deuda/i
    );
    assert.doesNotMatch(
      reply,
      /PLANTA CLIENTES|FACTURACION-CLIENTES/i
    );
  }
);

test(
  'una aclaración conserva varias intenciones anteriores de perfil',
  () => {
    const plan =
      planCustomerConversationTurn(
        'No entendí, explícamelo más fácil',
        {
          lastProfileIntents: [
            'CURRENT_PLAN',
            'DEBT_STATUS'
          ],
          lastConversationDomain:
            'PROFILE'
        }
      );

    assert.equal(
      plan.repair,
      true
    );
    assert.equal(
      plan.isComposite,
      true
    );

    const reply =
      buildCompositeCustomerReply({
        plan,
        profile: profile(),
        experience: experience()
      });

    assert.match(
      reply,
      /En simple/i
    );
    assert.match(
      reply,
      /Plan Conversacional/
    );
    assert.match(
      reply,
      /sin deuda/i
    );
  }
);


test(
  'una aclaración no mezcla un intent financiero viejo si el último turno fue de perfil',
  () => {
    const plan =
      planCustomerConversationTurn(
        'No entendí',
        {
          lastProfileIntents: [
            'CURRENT_PLAN'
          ],
          lastBillingIntent:
            'CURRENT_TOTAL',
          lastConversationDomain:
            'PROFILE',
          hasPersonalBillingContext:
            true
        }
      );

    assert.deepEqual(
      plan.profileIntents,
      ['CURRENT_PLAN']
    );
    assert.deepEqual(
      plan.billingIntents,
      []
    );
  }
);

test(
  'multi-intent solo de perfil conserva dominio PROFILE y una reparación no inventa EXPLANATION',
  () => {
    const firstPlan =
      planCustomerConversationTurn(
        '¿Desde cuándo tengo el servicio? ¿Cuál es mi ciclo? ¿Qué tipo de servicio tengo? ¿Cuál es mi plan? ¿Tengo deuda? ¿Qué cargos tengo?'
      );

    assert.equal(
      firstPlan.isComposite,
      true
    );
    assert.equal(
      firstPlan.domain,
      'PROFILE'
    );
    assert.equal(
      firstPlan.billingIntents.length,
      0
    );

    const repairPlan =
      planCustomerConversationTurn(
        'No entendí, explícamelo más fácil.',
        {
          lastProfileIntents:
            firstPlan.profileIntents,
          // Simula un intent financiero antiguo que pudo quedar
          // en la sesión antes de cambiar al tema de perfil.
          lastBillingIntent:
            'EXPLANATION',
          lastConversationDomain:
            firstPlan.domain,
          hasPersonalBillingContext:
            true
        }
      );

    assert.equal(
      repairPlan.repair,
      true
    );
    assert.equal(
      repairPlan.domain,
      'PROFILE'
    );
    assert.deepEqual(
      repairPlan.profileIntents,
      firstPlan.profileIntents
    );
    assert.deepEqual(
      repairPlan.billingIntents,
      []
    );

    const reply =
      buildCompositeCustomerReply({
        plan: repairPlan,
        profile: profile(),
        experience: experience()
      });

    assert.match(reply, /En simple/i);
    assert.match(reply, /Plan Conversacional/);
    assert.doesNotMatch(reply, /•/);
    assert.match(
      reply,
      /Móvil \(WRLS\).*14\/12\/2017.*día 15/i
    );
    assert.doesNotMatch(
      reply,
      /recibo aument|causa verificada|reconexi[oó]n|descuento|prorrateo/i
    );
  }
);

test(
  'distingue dominio conversacional de cantidad de intenciones',
  () => {
    const profileOnly =
      planCustomerConversationTurn(
        '¿Cuál es mi plan y tengo deuda?'
      );
    const mixed =
      planCustomerConversationTurn(
        '¿Cuál es mi plan y cuánto pago ahora?'
      );
    const billingOnly =
      planCustomerConversationTurn(
        '¿Cuánto pago ahora y cuánto pagué el mes pasado?'
      );

    assert.equal(profileOnly.domain, 'PROFILE');
    assert.equal(profileOnly.isComposite, true);
    assert.equal(mixed.domain, 'COMPOSITE');
    assert.equal(billingOnly.domain, 'BILLING');
  }
);

test(
  'Fase 19 conserva dominio BILLING en una segunda reformulación natural',
  () => {
    const plan =
      planCustomerConversationTurn(
        'Sigo sin entender, explícamelo otra vez',
        {
          lastBillingIntent: 'EXPLANATION',
          lastConversationDomain: 'BILLING',
          hasPersonalBillingContext: true
        }
      );

    assert.equal(plan.repair, true);
    assert.equal(plan.domain, 'BILLING');
    assert.deepEqual(
      plan.billingIntents,
      ['EXPLANATION']
    );
  }
);
