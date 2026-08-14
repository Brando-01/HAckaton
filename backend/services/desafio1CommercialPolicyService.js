const {
  CROSS_SELL_STATUS,
  BENEFIT_STATUS,
  buildEffervescentReminder,
  buildCommercialExperience
} = require(
  './desafio1CommercialPolicyLogic'
);

class Desafio1CommercialPolicyService {
  constructor({ dataService = null } = {}) {
    // Lazy require: la lógica pura y sus tests no dependen de SQLite.
    this.dataService =
      dataService ||
      require(
        './desafio1CommercialDataService'
      ).createDesafio1CommercialDataService();
  }

  async evaluateTurn({
    user,
    experience,
    resolution,
    sessionContext = {}
  } = {}) {
    const benefit =
      resolution?.status === 'RESOLVED'
        ? buildEffervescentReminder(
            experience,
            {
              alreadyShown:
                Boolean(
                  sessionContext
                    .effervescentBenefitShown
                )
            }
          )
        : {
            status:
              BENEFIT_STATUS.SUPPRESSED,
            available: false
          };

    const canAttemptCrossSell =
      user?.mode !== 'EXPLORER' &&
      resolution?.status === 'RESOLVED' &&
      benefit.status !== BENEFIT_STATUS.AVAILABLE &&
      !sessionContext.commercialOfferShown;

    let snapshot = null;
    let dataUnavailable = false;

    if (canAttemptCrossSell) {
      try {
        snapshot =
          await this.dataService
            .getCommercialSnapshot(
              user?.customerId
            );
      } catch (error) {
        dataUnavailable = true;
      }
    }

    const publicExperience =
      buildCommercialExperience({
        resolution,
        experience,
        commercialSnapshot:
          snapshot,
        commercialOfferShown:
          Boolean(
            sessionContext
              .commercialOfferShown
          ),
        effervescentBenefitShown:
          Boolean(
            sessionContext
              .effervescentBenefitShown
          ),
        evaluateCrossSellNow:
          user?.mode !== 'EXPLORER'
      });

    if (
      dataUnavailable &&
      publicExperience.crossSell.status !==
        CROSS_SELL_STATUS.SUPPRESSED
    ) {
      publicExperience.crossSell = {
        status:
          CROSS_SELL_STATUS.DATA_UNAVAILABLE,
        reasonCode:
          'COMMERCIAL_DATA_UNAVAILABLE',
        offered: false,
        ruleId: null,
        offer: null,
        action: null,
        guards: {
          llmUsedForCommercialDecision:
            false,
          fallbackOfferInvented: false,
          commercialDataScope:
            'SIMULATED_COMMERCIAL_LAYER'
        }
      };
    }

    const safeOffer =
      publicExperience.crossSell
        .offered
        ? {
            ...publicExperience
              .crossSell.offer
          }
        : null;

    return {
      publicExperience,
      internalOffer: safeOffer,
      contextPatch: {
        ...(publicExperience
          .existingBenefit
          .available
          ? {
              effervescentBenefitShown:
                true
            }
          : {}),
        ...(publicExperience
          .crossSell
          .offered
          ? {
              commercialOfferShown:
                true,
              lastCommercialOffer:
                safeOffer
            }
          : {}),
        lastCommercialDecision: {
          crossSellStatus:
            publicExperience
              .crossSell.status,
          crossSellReason:
            publicExperience
              .crossSell.reasonCode,
          benefitStatus:
            publicExperience
              .existingBenefit.status,
          benefitReason:
            publicExperience
              .existingBenefit.reasonCode
        }
      }
    };
  }

  buildAppExperience({
    experience
  } = {}) {
    return buildCommercialExperience({
      resolution: null,
      experience,
      evaluateCrossSellNow: false,
      allowBenefitWithoutResolvedTurn: true
    });
  }
}

function createDesafio1CommercialPolicyService(options) {
  return new Desafio1CommercialPolicyService(options);
}

module.exports = {
  Desafio1CommercialPolicyService,
  createDesafio1CommercialPolicyService
};
