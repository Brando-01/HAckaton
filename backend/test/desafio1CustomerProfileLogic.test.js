const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyCustomerProfileIntent,
  classifyCustomerProfileIntents,
  resolveCustomerProfileIntents,
  buildCustomerProfileReply,
  buildCustomerProfileMultiReply
} = require(
  '../services/desafio1CustomerProfileLogic'
);

function profile() {
  return {
    visibleId: 'DEMO000001',
    customerCode: 'TEST-CUSTOMER-001',
    activationDate:
      '2020-08-01 15:22:00',
    billingCycleDay: 9,
    lobType: 'WRLS',
    businessType: 'MOVIL'
  };
}

function experience() {
  return {
    customer: {
      plan:
        'RV Plan Mi Movistar S/82.9'
    },
    currentBill: {
      total: 82.9,
      status: 'Sin deuda',
      items: [
        {
          label:
            'RV Plan Mi Movistar S/82.9',
          amount: 82.9
        }
      ]
    },
    comparison: {
      causes: [
        {
          code:
            'RECONNECTION'
        }
      ]
    },
    findings: [],
    financialExplanation: {
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV',
          label:
            'Renta vencida'
        }
      }
    }
  };
}

test(
  'clasifica preguntas de perfil sin interceptar el total del recibo',
  () => {
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Qué datos tienes de mí?'
      ),
      'PROFILE_SUMMARY'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Cuál es mi ID?'
      ),
      'CUSTOMER_ID'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Desde cuándo tengo el servicio?'
      ),
      'ACTIVATION_DATE'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Cuál es mi ciclo de facturación?'
      ),
      'BILLING_CYCLE'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Qué tipo de servicio tengo?'
      ),
      'SERVICE_TYPE'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Cuál es mi plan?'
      ),
      'CURRENT_PLAN'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Tengo deuda?'
      ),
      'DEBT_STATUS'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Qué cargos tengo?'
      ),
      'CURRENT_CHARGES'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Tuve una reconexión?'
      ),
      'RECONNECTION_STATUS'
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Estos datos vienen del CSV?'
      ),
      'DATA_ORIGIN'
    );

    assert.equal(
      classifyCustomerProfileIntent(
        '¿Cuál es el total de mi recibo?'
      ),
      null
    );
    assert.equal(
      classifyCustomerProfileIntent(
        '¿Cuánto debo?'
      ),
      null
    );
  }
);

test(
  'detecta varias preguntas de perfil en un solo turno y conserva su orden',
  () => {
    assert.deepEqual(
      classifyCustomerProfileIntents(
        '¿Desde cuándo tengo el servicio? ¿Cuál es mi ciclo de facturación? ¿Qué tipo de servicio tengo? ¿Cuál es mi plan? ¿Tengo deuda? ¿Qué cargos tengo?'
      ),
      [
        'ACTIVATION_DATE',
        'BILLING_CYCLE',
        'SERVICE_TYPE',
        'CURRENT_PLAN',
        'DEBT_STATUS',
        'CURRENT_CHARGES'
      ]
    );
  }
);

test(
  'una petición de aclaración reutiliza el último contexto de perfil',
  () => {
    assert.deepEqual(
      resolveCustomerProfileIntents(
        'No entendí, explícamelo más fácil',
        {
          lastIntents: [
            'CURRENT_PLAN',
            'DEBT_STATUS'
          ]
        }
      ),
      [
        'CURRENT_PLAN',
        'DEBT_STATUS'
      ]
    );
  }
);

test(
  'el ID distingue alias demo de código anonimizado sin sonar como consola técnica',
  () => {
    const reply =
      buildCustomerProfileReply({
        intent: 'CUSTOMER_ID',
        profile: profile(),
        experience: experience()
      });

    assert.match(
      reply,
      /DEMO000001/
    );
    assert.match(
      reply,
      /TEST-CUSTOMER-001/
    );
    assert.doesNotMatch(
      reply,
      /PLANTA CLIENTES|SUBSCRIBER_KEY|NUM_ANEXO/
    );
  }
);

test(
  'el resumen demuestra varios datos concretos del perfil y del recibo',
  () => {
    const reply =
      buildCustomerProfileReply({
        intent:
          'PROFILE_SUMMARY',
        profile: profile(),
        experience: experience()
      });

    assert.match(
      reply,
      /TEST-CUSTOMER-001/
    );
    assert.match(
      reply,
      /Móvil \(WRLS\)/
    );
    assert.match(
      reply,
      /MOVIL/
    );
    assert.match(
      reply,
      /01\/08\/2020/
    );
    assert.match(
      reply,
      /día 9/
    );
    assert.match(
      reply,
      /S\/ 82\.90/
    );
    assert.match(
      reply,
      /Renta vencida \(RV\)/
    );
  }
);

test(
  'las respuestas normales son naturales y reservan los nombres de CSV para trazabilidad',
  () => {
    const intents = [
      'ACTIVATION_DATE',
      'BILLING_CYCLE',
      'SERVICE_TYPE',
      'BUSINESS_TYPE',
      'CURRENT_PLAN',
      'DEBT_STATUS',
      'CURRENT_CHARGES'
    ];

    for (const intent of intents) {
      const reply =
        buildCustomerProfileReply({
          intent,
          profile: profile(),
          experience: experience()
        });

      assert.doesNotMatch(
        reply,
        /PLANTA CLIENTES|FACTURACION-CLIENTES|no lo genera la IA/i
      );
    }
  }
);

test(
  'multi-intent responde todos los puntos en una sola intervención',
  () => {
    const reply =
      buildCustomerProfileMultiReply({
        intents: [
          'ACTIVATION_DATE',
          'BILLING_CYCLE',
          'SERVICE_TYPE',
          'CURRENT_PLAN',
          'DEBT_STATUS',
          'CURRENT_CHARGES'
        ],
        profile: profile(),
        experience: experience()
      });

    assert.match(reply, /punto por punto/i);
    assert.match(reply, /01\/08\/2020/);
    assert.match(reply, /día 9/);
    assert.match(reply, /Móvil \(WRLS\)/);
    assert.match(reply, /RV Plan Mi Movistar/);
    assert.doesNotMatch(
      reply,
      /RV Plan Mi Movistar S\/82\.9/
    );
    assert.match(reply, /sin deuda/i);
  }
);


test(
  'una reparación multi-intent simplifica y agrupa la información en lugar de repetir bullets',
  () => {
    const reply =
      buildCustomerProfileMultiReply({
        intents: [
          'ACTIVATION_DATE',
          'BILLING_CYCLE',
          'SERVICE_TYPE',
          'CURRENT_PLAN',
          'DEBT_STATUS',
          'CURRENT_CHARGES'
        ],
        profile: profile(),
        experience: experience(),
        repair: true
      });

    assert.match(reply, /En simple/i);
    assert.match(reply, /Móvil \(WRLS\).*01\/08\/2020.*día 9/i);
    assert.match(reply, /RV Plan Mi Movistar/);
    assert.doesNotMatch(
      reply,
      /RV Plan Mi Movistar S\/82\.9/
    );
    assert.match(reply, /sin deuda/i);
    assert.doesNotMatch(
      reply,
      /S\/82\.9.*S\/ 82\.90/i
    );
    assert.doesNotMatch(reply, /•/);
    assert.doesNotMatch(reply, /punto por punto/i);
  }
);


test(
  'elimina un precio embebido del nombre cuando coincide con el monto estructurado',
  () => {
    const planReply =
      buildCustomerProfileReply({
        intent: 'CURRENT_PLAN',
        profile: profile(),
        experience: experience()
      });

    const chargesReply =
      buildCustomerProfileReply({
        intent: 'CURRENT_CHARGES',
        profile: profile(),
        experience: experience()
      });

    assert.match(
      planReply,
      /RV Plan Mi Movistar/
    );
    assert.doesNotMatch(
      planReply,
      /S\/82\.9/
    );

    assert.match(
      chargesReply,
      /RV Plan Mi Movistar — S\/ 82\.90/
    );
    assert.doesNotMatch(
      chargesReply,
      /S\/82\.9:\s*S\/ 82\.90/
    );
  }
);

test(
  'conserva un precio descriptivo si no coincide con el monto estructurado',
  () => {
    const differentAmount =
      experience();

    differentAmount.customer.plan =
      'Plan Promo S/99.90';
    differentAmount.currentBill.items = [
      {
        label: 'Plan Promo S/99.90',
        amount: 79.9
      }
    ];

    const planReply =
      buildCustomerProfileReply({
        intent: 'CURRENT_PLAN',
        profile: profile(),
        experience: differentAmount
      });

    const chargesReply =
      buildCustomerProfileReply({
        intent: 'CURRENT_CHARGES',
        profile: profile(),
        experience: differentAmount
      });

    assert.match(
      planReply,
      /Plan Promo S\/99\.90/
    );
    assert.match(
      chargesReply,
      /Plan Promo S\/99\.90 — S\/ 79\.90/
    );
  }
);

test(
  'reconexión solo se afirma cuando el motor la reconoce con evidencia',
  () => {
    const yes =
      buildCustomerProfileReply({
        intent:
          'RECONNECTION_STATUS',
        profile: profile(),
        experience: experience()
      });

    const noExperience =
      experience();
    noExperience.comparison.causes = [];

    const no =
      buildCustomerProfileReply({
        intent:
          'RECONNECTION_STATUS',
        profile: profile(),
        experience: noExperience
      });

    assert.match(
      yes,
      /reconexión verificada/i
    );
    assert.match(
      no,
      /no encuentro una reconexión verificada/i
    );
  }
);

test(
  'solo al preguntar por la procedencia explica dataset y razonamiento sin exponer nombres de archivos',
  () => {
    const reply =
      buildCustomerProfileReply({
        intent: 'DATA_ORIGIN',
        profile: profile(),
        experience: experience()
      });

    assert.match(
      reply,
      /dataset entregado para el desafío/i
    );
    assert.match(
      reply,
      /IA ayuda a entender y redactar la conversación/i
    );
    assert.match(
      reply,
      /reglas deterministas/i
    );
    assert.doesNotMatch(
      reply,
      /PLANTA CLIENTES|FACTURACION-CLIENTES|\.csv/i
    );
  }
);

test(
  'FACTURACION v2 se abstiene de inventar deuda cuando el estado ya no viene en la fuente',
  () => {
    const updatedExperience =
      experience();

    updatedExperience.currentBill = {
      ...updatedExperience.currentBill,
      status:
        'Estado no disponible'
    };

    const reply =
      buildCustomerProfileReply({
        intent: 'DEBT_STATUS',
        profile: profile(),
        experience:
          updatedExperience
      });

    assert.match(
      reply,
      /no tengo información verificable sobre tu estado de deuda/i
    );
    assert.match(
      reply,
      /no puedo confirmar/i
    );
    assert.doesNotMatch(
      reply,
      /sin deuda|pendiente/i
    );
  }
);

test(
  'Fase 19 reconoce sigo sin entender como reparación de perfil',
  () => {
    assert.deepEqual(
      resolveCustomerProfileIntents(
        'Sigo sin entender, explícamelo otra vez',
        {
          lastIntents: [
            'CURRENT_PLAN',
            'DEBT_STATUS'
          ]
        }
      ),
      [
        'CURRENT_PLAN',
        'DEBT_STATUS'
      ]
    );
  }
);
