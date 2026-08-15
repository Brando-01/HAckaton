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
            'Se agregó S/ 4.58 por reconexión. Brainy Reconexiones confirma el monto.',
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
        'Brainy Reconexiones confirma S/ 4.58.',
      details: [
        'Brainy Reconexiones confirma S/ 4.58.'
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
            'El recibo incluye S/ 21.92 de prorrateo. Brainy Prorrateo confirma el monto.',
          amount: 21.92,
          periodStartDate:
            '2026-06-09',
          periodEndDate:
            '2026-06-30',
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
        'Brainy Prorrateo confirma S/ 21.92.',
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
    assert.equal(
      experience.resolution.status,
      'RESOLVED'
    );
    assert.equal(
      experience.nextActions.some(
        (item) =>
          item.id ===
            'CONTACT_ADVISOR'
      ),
      false
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
    assert.doesNotMatch(
      serialized,
      /Brainy/i
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
    assert.equal(
      experience.findings[0]
        .impactPresentation,
      'INCLUDED_IN_TOTAL'
    );
    assert.equal(
      experience.resolution.status,
      'RESOLVED'
    );
    assert.equal(
      experience.nextActions.some(
        (item) =>
          item.id ===
            'CONTACT_ADVISOR'
      ),
      false
    );
    assert.match(
      experience.findings[0]
        .description,
      /ya está incluido en el total/i
    );
    assert.doesNotMatch(
      JSON.stringify(experience),
      /Brainy/i
    );
  }
);

test(
  'la fecha de vencimiento permanece no disponible y no se infiere en FACTURACION v2',
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

test(
  'Fase 14 expone un histórico seguro de hasta seis recibos en la experiencia pública',
  () => {
    const explanation =
      reconnectionExplanation();

    const historyInvoices = [
      baseInvoice({
        total: 34.48,
        cycleDate: '2026-07-27'
      }),
      baseInvoice({
        total: 29.9,
        cycleDate: '2026-06-27'
      }),
      baseInvoice({
        total: 31.9,
        cycleDate: '2026-05-27'
      })
    ];

    const experience =
      buildOfficialDemoExperience({
        user: {
          customerId: 'CLI000001',
          name: 'Carlos Mendoza'
        },
        binding: {
          subscriberKey:
            'SECRET_SUBSCRIBER_A',
          scenario: 'RECONNECTION',
          scenarioLabel: 'Reconexión'
        },
        explanation,
        historyInvoices
      });

    assert.equal(
      experience.billingHistory
        .availableBills,
      3
    );
    assert.equal(
      experience.billingHistory
        .previousBills,
      2
    );
    assert.equal(
      experience.billingHistory
        .bills[0].period,
      'Ciclo 27/07/2026'
    );
    const publicHistory =
      JSON.stringify(
        experience.billingHistory
      );

    assert.doesNotMatch(
      publicHistory,
      /SECRET_SUBSCRIBER_A|SECRET_CUSTOMER_A/
    );
    assert.doesNotMatch(
      publicHistory,
      /subscriberKey|customerKey|invoiceNumber|billingArrangement|financialAccount/i
    );
  }
);

test(
  'el histórico completo se consulta solo cuando el consumidor lo solicita',
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

    let historyCalls = 0;

    const service =
      createOfficialDemoExperienceService({
        configPath,
        explainSubscriber:
          async () =>
            reconnectionExplanation(),
        loadHistory:
          async () => {
            historyCalls += 1;
            return [
              baseInvoice({
                total: 34.48,
                cycleDate:
                  '2026-07-27'
              }),
              baseInvoice({
                total: 29.9,
                cycleDate:
                  '2026-06-27'
              }),
              baseInvoice({
                total: 31.9,
                cycleDate:
                  '2026-05-27'
              })
            ];
          }
      });

    const user = {
      customerId: 'CLI000001',
      name: 'Carlos Mendoza'
    };

    const regular =
      await service
        .getExperienceForUser(user);

    assert.equal(historyCalls, 0);
    assert.equal(
      regular.billingHistory
        .availableBills,
      2
    );

    const historical =
      await service
        .getExperienceForUser(
          user,
          { includeHistory: true }
        );

    assert.equal(historyCalls, 1);
    assert.equal(
      historical.billingHistory
        .availableBills,
      3
    );
  }
);

test(
  'FACTURACION v2 deja deuda y vencimiento como no disponibles sin inferirlos',
  () => {
    const explanation =
      reconnectionExplanation();

    delete explanation.currentBill
      .debtStatuses;
    delete explanation.previousBill
      .debtStatuses;

    const experience =
      buildOfficialDemoExperience({
        user: {
          customerId: 'CLI000001',
          name: 'Carlos Mendoza'
        },
        binding: {
          scenario: 'RECONNECTION',
          scenarioLabel: 'Reconexión'
        },
        explanation
      });

    assert.equal(
      experience.currentBill.status,
      'Estado no disponible'
    );
    assert.equal(
      experience.currentBill.dueDate,
      null
    );
    assert.equal(
      experience.previousBill.status,
      'Estado no disponible'
    );
    assert.equal(
      experience.previousBill.dueDate,
      null
    );
  }
);

test(
  'Checkpoint 14B publica el ajuste de suspensión verificado como hallazgo seguro',
  () => {
    const explanation =
      reconnectionExplanation();

    explanation.interpretation
      .currentBillFindings = [
        {
          code: 'SUSPENSION_ADJUSTMENT',
          label: 'Ajuste por suspensión',
          amount: 7.21,
          suspendedDays: 3,
          periodStartDate: '2026-05-05',
          periodEndDate: '2026-05-07',
          chargeCode: 'PLAN_RA',
          evidenceLevel: 'HIGH',
          causalImpact: false
        }
      ];

    const experience =
      buildOfficialDemoExperience({
        user: {
          customerId: 'CLI000001',
          name: 'Carlos Mendoza'
        },
        binding: {
          scenario: 'RECONNECTION',
          scenarioLabel: 'Reconexión'
        },
        explanation
      });

    const finding =
      experience.findings.find(
        (item) =>
          item.code ===
          'SUSPENSION_ADJUSTMENT'
      );

    assert.ok(finding);
    assert.equal(
      finding.impactPresentation,
      'VERIFIED_CREDIT_CONTEXT'
    );
    assert.equal(
      finding.evidenceLevel,
      'HIGH'
    );
    assert.match(
      finding.description,
      /3 días sin servicio/i
    );

    const serialized =
      JSON.stringify(experience);
    assert.doesNotMatch(
      serialized,
      /SECRET_SUBSCRIBER|SECRET_CUSTOMER/
    );
  }
);

test(
  'una cuenta autenticada desde PLANTA usa su NUM_ANEXO interno sin depender del catálogo demo',
  async () => {
    const requested = [];

    const service =
      createOfficialDemoExperienceService({
        explainSubscriber:
          async (subscriberKey) => {
            requested.push(
              subscriberKey
            );
            return reconnectionExplanation();
          },
        loadHistory:
          async () => []
      });

    const experience =
      await service.getExperienceForUser({
        userId: 'D1U-TEST',
        customerId: 'D1A-TEST',
        customerCode: '100000001',
        name: 'Cliente 100000001',
        mode: 'DATASET',
        datasetSubscriberKey:
          'SECRET_SUBSCRIBER_A'
      });

    assert.deepEqual(
      requested,
      ['SECRET_SUBSCRIBER_A']
    );
    assert.equal(
      experience.customer.name,
      'Cliente 100000001'
    );
    assert.equal(
      experience.customer.demoScenario,
      'DATASET_ACCOUNT'
    );
  }
);
