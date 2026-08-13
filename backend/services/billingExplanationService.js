const {
  createBillingAnalysisService
} = require(
  './billingAnalysisService'
);

const {
  interpretBillingAnalysis
} = require(
  './desafio1ExplanationLogic'
);

class BillingExplanationService {
  constructor({
    analysisService = null,
    repository = null,
    dbPath = null
  } = {}) {
    if (analysisService) {
      this.analysisService =
        analysisService;

      this.ownsAnalysisService =
        false;
    } else {
      this.analysisService =
        createBillingAnalysisService({
          repository,
          dbPath
        });

      this.ownsAnalysisService =
        true;
    }

    this.opened = false;
  }

  async open() {
    if (this.opened) {
      return this;
    }

    if (
      this.analysisService &&
      typeof this.analysisService.open ===
        'function'
    ) {
      await this.analysisService
        .open();
    }

    this.opened = true;

    return this;
  }

  async close() {
    if (!this.opened) {
      return;
    }

    if (
      this.ownsAnalysisService &&
      this.analysisService &&
      typeof this.analysisService.close ===
        'function'
    ) {
      await this.analysisService
        .close();
    }

    this.opened = false;
  }

  async ensureOpen() {
    if (!this.opened) {
      await this.open();
    }
  }

  async explainSubscriber(
    subscriberKey
  ) {
    await this.ensureOpen();

    const phase2Analysis =
      await this.analysisService
        .analyzeSubscriber(
          subscriberKey
        );

    return interpretBillingAnalysis(
      phase2Analysis
    );
  }
}

function createBillingExplanationService(
  options = {}
) {
  return new BillingExplanationService(
    options
  );
}

async function explainSubscriberBilling(
  subscriberKey,
  options = {}
) {
  const service =
    createBillingExplanationService(
      options
    );

  try {
    return await service
      .explainSubscriber(
        subscriberKey
      );
  } finally {
    await service.close();
  }
}

module.exports = {
  BillingExplanationService,
  createBillingExplanationService,
  explainSubscriberBilling
};
