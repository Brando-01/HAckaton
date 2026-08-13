const {
  getDemoProfileBinding,
  DemoProfileBindingError
} = require(
  './demoProfileBindingService'
);

const {
  explainSubscriberBilling
} = require(
  './billingExplanationService'
);

const {
  buildCustomerCauseDescription,
  buildCustomerFindingDescription,
  getImpactPresentation,
  buildVerification,
  buildCustomerFacing
} = require(
  './desafio1CustomerPresentation'
);

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function formatCycleLabel(
  cycleDate
) {
  const match =
    String(cycleDate || '')
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

  if (!match) {
    return cycleDate ||
      'Ciclo no disponible';
  }

  return (
    `Ciclo ${match[3]}/` +
    `${match[2]}/${match[1]}`
  );
}

function deriveBillStatus(
  invoice
) {
  const statuses =
    invoice?.debtStatuses || [];

  if (
    statuses.some(
      (status) =>
        String(status)
          .toUpperCase()
          .includes('CON DEUDA')
    )
  ) {
    return 'Pendiente';
  }

  if (
    statuses.some(
      (status) =>
        String(status)
          .toUpperCase()
          .includes('SIN DEUDA')
    )
  ) {
    return 'Sin deuda';
  }

  return 'Estado no disponible';
}

function visibleInvoiceItems(
  invoice
) {
  return (
    invoice?.items || []
  )
    .filter(
      (item) =>
        !item.ignoreForExplanation
    )
    .map(
      (item) => ({
        label:
          item.description ||
          item.chargeCode ||
          'Concepto',
        amount:
          Number(item.amount) || 0,
        chargeCode:
          item.chargeCode || null,
        rentType:
          item.rentType || null
      })
    );
}

function derivePlanLabel(
  explanation
) {
  const planItem =
    (
      explanation?.currentBill
        ?.items || []
    ).find(
      (item) => {
        const classification =
          String(
            item.classification || ''
          ).toLowerCase();

        const group =
          String(
            item.group || ''
          ).toLowerCase();

        const description =
          String(
            item.description || ''
          ).toLowerCase();

        return (
          classification.includes(
            'cargo recurrente de plan'
          ) ||
          (
            group.includes(
              'cargo fijo'
            ) &&
            description.includes(
              'plan'
            )
          )
        );
      }
    );

  if (planItem?.description) {
    return planItem.description;
  }

  const subscriber =
    explanation?.subscriber || {};

  return [
    subscriber.businessType,
    subscriber.lobType
  ]
    .filter(Boolean)
    .join(' · ') ||
    'Servicio Movistar';
}

function transformCause(cause) {
  return {
    code:
      cause.code,
    title:
      cause.label ||
      cause.title ||
      cause.code,
    description:
      buildCustomerCauseDescription(
        cause
      ),
    impact:
      Number(
        cause.impactAmount
      ) || 0,
    impactPresentation:
      getImpactPresentation(
        cause
      ),
    evidenceLevel:
      cause.evidenceLevel ||
      null,
    verification:
      buildVerification(
        cause
      )
  };
}

function transformFinding(
  finding
) {
  return {
    code:
      finding.code,
    title:
      finding.label ||
      finding.title ||
      finding.code,
    description:
      buildCustomerFindingDescription(
        finding
      ),
    impact:
      Number(
        finding.amount ??
        finding.impactAmount ??
        finding.impactOnBill
      ) || 0,
    impactPresentation:
      getImpactPresentation(
        finding
      ),
    evidenceLevel:
      finding.evidenceLevel ||
      null,
    verification:
      buildVerification(
        finding
      ),
    finding: true
  };
}

function transformBill(invoice) {
  if (!invoice) {
    return null;
  }

  return {
    period:
      formatCycleLabel(
        invoice.cycleDate
      ),
    cycleDate:
      invoice.cycleDate || null,
    total:
      Number(invoice.total) || 0,
    status:
      deriveBillStatus(invoice),
    // El dataset no permite asumir que FECHA-VENCIMIENTO
    // sea coherente con ciclo como una fecha de emisión.
    // No la mostramos en esta integración hasta tener
    // una regla de negocio confirmada.
    dueDate: null,
    items:
      visibleInvoiceItems(
        invoice
      )
  };
}

function buildOfficialDemoExperience({
  user,
  binding,
  explanation
}) {
  if (!user?.customerId) {
    throw new Error(
      'Se requiere un usuario demo autenticado.'
    );
  }

  if (!binding) {
    throw new Error(
      'Se requiere un mapeo demo válido.'
    );
  }

  if (!explanation?.currentBill) {
    throw new Error(
      'La explicación oficial no contiene un recibo actual.'
    );
  }

  const currentBill =
    transformBill(
      explanation.currentBill
    );

  const previousBill =
    transformBill(
      explanation.previousBill
    );

  const interpretation =
    explanation.interpretation || {};

  const causes =
    (
      interpretation.causes || []
    ).map(transformCause);

  const findings =
    (
      interpretation
        .currentBillFindings || []
    )
      .filter(
        (finding) =>
          [
            'PRORATION',
            'ACTIVE_DISCOUNT'
          ].includes(
            finding.code
          )
      )
      .map(transformFinding);

  const comparison =
    explanation.comparison
      ? {
          difference:
            explanation.comparison
              .difference,
          percentage:
            explanation.comparison
              .percentage,
          direction:
            explanation.comparison
              .direction,
          causes
        }
      : {
          difference: null,
          percentage: null,
          direction: null,
          causes: []
        };

  return {
    schemaVersion:
      'desafio1-demo-experience-v1',
    dataSource:
      'DESAFIO1_OFFICIAL_LOCAL',
    customer: {
      customerId:
        user.customerId,
      name:
        user.name,
      plan:
        derivePlanLabel(
          explanation
        ),
      demoScenario:
        binding.scenario,
      demoScenarioLabel:
        binding.scenarioLabel,
      lobType:
        explanation.subscriber
          ?.lobType || null,
      businessType:
        explanation.subscriber
          ?.businessType || null
    },
    currentBill,
    previousBill,
    comparison,
    findings,
    financialExplanation: {
      status:
        interpretation.status,
      explainedNetAmount:
        interpretation
          .explainedNetAmount,
      unexplainedAmount:
        interpretation
          .unexplainedAmount,
      coveragePercent:
        interpretation
          .coveragePercent,
      rentContext:
        clone(
          interpretation
            .rentContext || {}
        ),
      customerFacing:
        buildCustomerFacing({
          explanation,
          causes,
          findings
        }),
      safeguards:
        clone(
          explanation.safeguards || {}
        )
    },
    nextActions: [
      {
        id:
          'EXPLAIN_BILL',
        label:
          previousBill
            ? 'Entender mi variación'
            : 'Entender mi recibo',
        type: 'CHAT',
        prompt:
          previousBill
            ? 'Explícame por qué cambió mi recibo'
            : 'Explícame mi recibo y el prorrateo'
      },
      {
        id:
          'CONTACT_ADVISOR',
        label:
          'Hablar con un asesor',
        type: 'CHAT',
        prompt:
          'Quiero hablar con un asesor'
      }
    ]
  };
}

class OfficialDemoExperienceService {
  constructor({
    configPath = null,
    explainSubscriber = null
  } = {}) {
    this.configPath =
      configPath;

    this.explainSubscriber =
      explainSubscriber ||
      (
        (subscriberKey) =>
          explainSubscriberBilling(
            subscriberKey
          )
      );
  }

  getBinding(customerId) {
    return getDemoProfileBinding(
      customerId,
      this.configPath
        ? {
            configPath:
              this.configPath
          }
        : {}
    );
  }

  async getExperienceForUser(
    user
  ) {
    const binding =
      this.getBinding(
        user?.customerId
      );

    if (!binding) {
      throw new DemoProfileBindingError(
        'DEMO_PROFILE_NOT_BOUND',
        `El perfil ${user?.customerId || 'desconocido'} no tiene un caso oficial asociado.`
      );
    }

    const explanation =
      await this.explainSubscriber(
        binding.subscriberKey
      );

    return buildOfficialDemoExperience({
      user,
      binding,
      explanation
    });
  }
}

function createOfficialDemoExperienceService(
  options = {}
) {
  return new OfficialDemoExperienceService(
    options
  );
}

module.exports = {
  OfficialDemoExperienceService,
  createOfficialDemoExperienceService,
  buildOfficialDemoExperience,
  transformBill,
  derivePlanLabel,
  formatCycleLabel
};
