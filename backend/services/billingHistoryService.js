const {
  MAX_HISTORY_BILLS
} = require(
  './desafio1BillingHistoryLogic'
);

class BillingHistoryService {
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
      const {
        createBillingAnalysisService
      } = require(
        './billingAnalysisService'
      );

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
      await this.analysisService.open();
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
      await this.analysisService.close();
    }

    this.opened = false;
  }

  async getHistoryForSubscriber(
    subscriberKey,
    {
      limit = MAX_HISTORY_BILLS
    } = {}
  ) {
    if (!this.opened) {
      await this.open();
    }

    return this.analysisService
      .getBillHistory(
        subscriberKey,
        { limit }
      );
  }
}

function createBillingHistoryService(
  options = {}
) {
  return new BillingHistoryService(
    options
  );
}

async function loadSubscriberBillingHistory(
  subscriberKey,
  options = {}
) {
  const service =
    createBillingHistoryService(
      options
    );

  try {
    return await service
      .getHistoryForSubscriber(
        subscriberKey,
        {
          limit:
            options.limit ||
            MAX_HISTORY_BILLS
        }
      );
  } finally {
    await service.close();
  }
}

module.exports = {
  BillingHistoryService,
  createBillingHistoryService,
  loadSubscriberBillingHistory
};
