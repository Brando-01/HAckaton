const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createOfficialDemoExperienceService,
  buildOfficialDemoExperience
} = require(
  '../services/officialDemoExperienceService'
);

function writeConfig() {
  const dir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'd1-official-experience-'
      )
    );

  const configPath =
    path.join(
      dir,
      'demo-users.local.json'
    );

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      schemaVersion:
        'desafio1-demo-users-v1',
      profiles: [
        {
          customerId:
            'CLI000001',
          subscriberKey:
            'SECRET_SUBSCRIBER_A',
          scenario:
            'RECONNECTION',
          scenarioLabel:
            'Reconexión',
          score: 100,
          evidenceLevel: 'HIGH',
          rentType: 'RV'
        },
        {
          customerId:
            'CLI000002',
          subscriberKey:
            'SECRET_SUBSCRIBER_B',
          scenario:
            'PRORATION',
          scenarioLabel:
            'Prorrateo',
          score: 100,
          evidenceLevel: 'HIGH',
          rentType: 'RA'
        }
      ]
    }),
    'utf8'
  );

  return {
    dir,
    configPath
  };
}

function baseInvoice({
  total,
  cycleDate,
  rentType = 'RV'
}) {
  return {
    cycleDate,
    total,
    debtStatuses: [
      'CON DEUDA'
    ],
    items: [
      {
        chargeCode:
          'PLAN_X',
        description:
          'Plan Demo S/29.90',
        classification:
          'Cargo Recurrente De Plan',
        group:
          'CARGO FIJO',
        amount:
          total,
        ignoreForExplanation:
          false,
        rentType
      },
      {
        chargeCode:
          'BONO_X',
        description:
          'Bono técnico',
        amount: 100,
        ignoreForExplanation:
          true,
        rentType: null
      }
    ]
  };
}

function reconnectionExplanation() {
  return {
    subscriber: {
      subscriberKey:
        'SECRET_SUBSCRIBER_A',
      customerKey:
        'SECRET_CUSTOMER_A',
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill:
      baseInvoice({
        total: 34.48,
        cycleDate:
          '2026-07-27'
      }),
    previousBill:
      baseInvoice({
        total: 29.9,
        cycleDate:
          '2026-06-27'
      }),
    comparison: {
      difference: 4.58,
      percentage: 15.3,
      direction: 'UP'
    },
    interpretation: {
      status:
        'FULLY_EXPLAINED',
      explainedNetAmount: 4.58,
      unexplainedAmount: 0,
      coveragePercent: 100,
      causes: [
        {
          code:
            'RECONNECTION',
          label:
            'Cargo por reconexión',
          explanation:
            'Se agregó S/ 4.58 por reconexión.',
          impactAmount: 4.58,
          evidenceLevel: 'HIGH'
        }
      ],
      currentBillFindings: [],
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV',
          label:
            'Renta vencida',
          definition:
            'Se factura después de transcurrido.'
        }
      }
    },
    customerFacing: {
      headline:
        'Tu recibo aumentó S/ 4.58',
      summary:
        'Se agregó S/ 4.58 por reconexión.',
      details: [
        'Se agregó S/ 4.58 por reconexión.'
      ],
      limitations: [
        'El ciclo no se interpreta como fecha de emisión.'
      ]
    },
    safeguards: {
      llmUsedForFinancialReasoning:
        false
    }
  };
}

function prorationExplanation() {
  return {
    subscriber: {
      subscriberKey:
        'SECRET_SUBSCRIBER_B',
      customerKey:
        'SECRET_CUSTOMER_B',
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill:
      baseInvoice({
        total: 51.83,
        cycleDate:
          '2026-06-30',
        rentType: 'RA'
      }),
    previousBill: null,
    comparison: null,
    interpretation: {
      status:
        'NO_PREVIOUS_BILL',
      explainedNetAmount: null,
      unexplainedAmount: null,
      coveragePercent: null,
      causes: [],
      currentBillFindings: [
        {
          code:
            'PRORATION',
          label:
            'Prorrateo',
          explanation:
            'El recibo incluye S/ 21.92 de prorrateo.',
          amount: 21.92,
          evidenceLevel: 'HIGH'
        }
      ],
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RA',
          label:
            'Renta adelantada',
          definition:
            'Se factura por adelantado.'
        }
      }
    },
    customerFacing: {
      headline:
        'Tu recibo incluye un prorrateo de S/ 21.92',
      summary:
        'El recibo incluye S/ 21.92 de prorrateo.',
      details: [],
      limitations: []
    },
    safeguards: {
      llmUsedForFinancialReasoning:
        false
    }
  };
}

test(
  'Carlos conserva su alias pero consulta un único suscriptor oficial local',
  async (t) => {
    const {
      dir,
      configPath
    } = writeConfig();

    t.after(
      () =>
        fs.rmSync(
          dir,
          {
            recursive: true,
            force: true
          }
        )
    );

    const requested = [];

    const service =
      createOfficialDemoExperienceService({
        configPath,
        explainSubscriber:
          async (subscriberKey) => {
            requested.push(
              subscriberKey
            );
            return reconnectionExplanation();
          }
      });

    const experience =
      await service.getExperienceForUser({
        customerId:
          'CLI000001',
        name:
          'Carlos Mendoza'
      });

    assert.deepEqual(
      requested,
      ['SECRET_SUBSCRIBER_A']
    );
    assert.equal(
      experience.customer.customerId,
      'CLI000001'
    );
    assert.equal(
      experience.customer.name,
      'Carlos Mendoza'
    );
    assert.equal(
      experience.customer.demoScenario,
      'RECONNECTION'
    );
  }
);

test(
  'la experiencia pública no expone subscriberKey ni customerKey oficiales',
  () => {
    const experience =
      buildOfficialDemoExperience({
        user: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        binding: {
          subscriberKey:
            'SECRET_SUBSCRIBER_A',
          scenario:
            'RECONNECTION',
          scenarioLabel:
            'Reconexión'
        },
        explanation:
          reconnectionExplanation()
      });

    const serialized =
      JSON.stringify(experience);

    assert.doesNotMatch(
      serialized,
      /SECRET_SUBSCRIBER_A/
    );
    assert.doesNotMatch(
      serialized,
      /SECRET_CUSTOMER_A/
    );
  }
);

test(
  'filtra conceptos NO CONSIDERAR de la vista sin alterar el total reconstruido',
  () => {
    const experience =
      buildOfficialDemoExperience({
        user: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        binding: {
          subscriberKey: 'X',
          scenario:
            'RECONNECTION',
          scenarioLabel:
            'Reconexión'
        },
        explanation:
          reconnectionExplanation()
      });

    assert.equal(
      experience.currentBill.total,
      34.48
    );
    assert.equal(
      experience.currentBill.items.length,
      1
    );
    assert.equal(
      experience.currentBill.items[0].label,
      'Plan Demo S/29.90'
    );
  }
);

test(
  'un primer recibo con prorrateo no inventa recibo anterior ni porcentaje',
  () => {
    const experience =
      buildOfficialDemoExperience({
        user: {
          customerId:
            'CLI000002',
          name: 'Ana Torres'
        },
        binding: {
          subscriberKey: 'X',
          scenario:
            'PRORATION',
          scenarioLabel:
            'Prorrateo'
        },
        explanation:
          prorationExplanation()
      });

    assert.equal(
      experience.previousBill,
      null
    );
    assert.equal(
      experience.comparison.difference,
      null
    );
    assert.equal(
      experience.comparison.percentage,
      null
    );
    assert.equal(
      experience.findings[0].code,
      'PRORATION'
    );
  }
);

test(
  'la fecha de vencimiento se omite en Fase 5 por la inconsistencia conocida del dataset',
  () => {
    const experience =
      buildOfficialDemoExperience({
        user: {
          customerId:
            'CLI000001',
          name:
            'Carlos Mendoza'
        },
        binding: {
          subscriberKey: 'X',
          scenario:
            'RECONNECTION',
          scenarioLabel:
            'Reconexión'
        },
        explanation:
          reconnectionExplanation()
      });

    assert.equal(
      experience.currentBill.dueDate,
      null
    );
    assert.match(
      experience.currentBill.period,
      /^Ciclo /
    );
  }
);
