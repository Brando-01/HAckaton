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
  loadSubscriberBillingHistory
} = require(
  './billingHistoryService'
);

const {
  buildBillingHistoryView
} = require(
  './desafio1BillingHistoryLogic'
);

const {
  buildAppNextActions
} = require(
  './desafio1ResolutionLogic'
);

const {
  buildSafeFinancialResponseTrace
} = require(
  './desafio1FinancialAuditLogic'
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
      ),
    subject:
      cause?.chargeChange
        ? {
            chargeCode:
              cause.chargeChange
                .chargeCode || null,
            label:
              cause.chargeChange
                .description ||
              cause.label ||
              null
          }
        : null
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
    subject:
      finding?.chargeCode
        ? {
            chargeCode:
              finding.chargeCode,
            label:
              finding
                .chargeDescription ||
              finding.description ||
              finding.label ||
              null
          }
        : null,
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
    // FACTURACION v2 ya no entrega FECHA-VENCIMIENTO.
    // No se infiere a partir del ciclo ni de los periodos del cargo.
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
  explanation,
  historyInvoices = null
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

  const historySource =
    Array.isArray(historyInvoices) &&
    historyInvoices.length
      ? historyInvoices
      : [
          explanation.currentBill,
          explanation.previousBill
        ].filter(Boolean);

  const billingHistory =
    buildBillingHistoryView(
      historySource
        .map(transformBill)
        .filter(Boolean)
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
            'ACTIVE_DISCOUNT',
            'SUSPENSION_ADJUSTMENT'
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

  const experience = {
    schemaVersion:
      'desafio1-demo-experience-v1',
    dataSource:
      'DESAFIO1_OFFICIAL_LOCAL',
    customer: {
      customerId:
        user.customerId,
      customerCode:
        user.customerCode || null,
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
    billingHistory,
    comparison,
    findings,
    financialTrace:
      buildSafeFinancialResponseTrace(
        explanation
      ),
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
    }
  };

  const actionPolicy =
    buildAppNextActions(
      experience
    );

  return {
    ...experience,
    resolution:
      actionPolicy.resolution,
    nextActions:
      actionPolicy.nextActions
  };
}

class OfficialDemoExperienceService {
  constructor({
    configPath = null,
    explainSubscriber = null,
    loadHistory = null
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

    this.loadHistory =
      loadHistory ||
      (
        (subscriberKey) =>
          loadSubscriberBillingHistory(
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

  getBindingForUser(user) {
    if (
      user?.mode === 'DATASET' &&
      user?.datasetSubscriberKey
    ) {
      return {
        customerId:
          user.customerId,
        subscriberKey:
          user.datasetSubscriberKey,
        scenario:
          'DATASET_ACCOUNT',
        scenarioLabel:
          'Cuenta validada del dataset',
        score: null,
        evidenceLevel: null,
        rentType: null,
        source:
          'PLANTA_CLIENTES_LOGIN'
      };
    }

    return this.getBinding(
      user?.customerId
    );
  }

  async getInvoiceReferenceForUser(
    user,
    reference
  ) {
    const binding =
      this.getBindingForUser(
        user
      );

    if (!binding) {
      throw new DemoProfileBindingError(
        'DEMO_PROFILE_NOT_BOUND',
        `El perfil ${user?.customerId || 'desconocido'} no tiene un caso oficial asociado.`
      );
    }

    const normalizedReference =
      String(reference ?? '')
        .trim()
        .toUpperCase();

    if (!normalizedReference) {
      return {
        status: 'NOT_PROVIDED',
        reference: null
      };
    }

    const invoices =
      await this.loadHistory(
        binding.subscriberKey
      );

    const matchIndex =
      (invoices || []).findIndex(
        (invoice) =>
          String(
            invoice?.invoiceNumber ?? ''
          )
            .trim()
            .toUpperCase() ===
          normalizedReference
      );

    if (matchIndex < 0) {
      return {
        status: 'NOT_FOUND',
        reference:
          normalizedReference,
        availableBillCount:
          (invoices || []).length
      };
    }

    const invoice =
      invoices[matchIndex];

    return {
      status: 'MATCHED',
      reference:
        normalizedReference,
      position:
        matchIndex === 0
          ? 'CURRENT'
          : matchIndex === 1
            ? 'PREVIOUS'
            : 'HISTORY',
      period:
        formatCycleLabel(
          invoice?.cycleDate
        ),
      total:
        Number.isFinite(
          Number(invoice?.total)
        )
          ? Number(invoice.total)
          : null,
      availableBillCount:
        (invoices || []).length
    };
  }

  async getExperienceForUser(
    user,
    {
      includeHistory = false
    } = {}
  ) {
    const binding =
      this.getBindingForUser(
        user
      );

    if (!binding) {
      throw new DemoProfileBindingError(
        'DEMO_PROFILE_NOT_BOUND',
        `El perfil ${user?.customerId || 'desconocido'} no tiene un caso oficial asociado.`
      );
    }

    const [
      explanation,
      historyInvoices
    ] = await Promise.all([
      this.explainSubscriber(
        binding.subscriberKey
      ),
      includeHistory
        ? this.loadHistory(
            binding.subscriberKey
          )
        : Promise.resolve(null)
    ]);

    return buildOfficialDemoExperience({
      user,
      binding,
      explanation,
      historyInvoices
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
