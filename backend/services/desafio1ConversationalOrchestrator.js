const {
  resolveCustomerProfileIntents,
  isConversationRepairRequest,
  buildCustomerProfileMultiReply
} = require(
  './desafio1CustomerProfileLogic'
);

const {
  classifyPersonalBillingIntents,
  isBillingRepairRequest,
  buildPersonalBillingMultiReply
} = require(
  './desafio1ConversationLogic'
);

function inferConversationDomain(
  profileIntents = [],
  billingIntents = []
) {
  const hasProfile =
    profileIntents.length > 0;
  const hasBilling =
    billingIntents.length > 0;

  if (hasProfile && hasBilling) {
    return 'COMPOSITE';
  }

  if (hasProfile) {
    return 'PROFILE';
  }

  if (hasBilling) {
    return 'BILLING';
  }

  return null;
}

function planCustomerConversationTurn(
  message,
  {
    lastProfileIntents = [],
    lastBillingIntent = null,
    lastConversationDomain = null,
    hasPersonalBillingContext = false
  } = {}
) {
  const repair =
    isConversationRepairRequest(
      message
    ) ||
    isBillingRepairRequest(
      message
    );

  const repairProfileContext =
    repair &&
    [
      'PROFILE',
      'COMPOSITE'
    ].includes(
      lastConversationDomain
    );

  const repairBillingContext =
    repair &&
    [
      'BILLING',
      'COMPOSITE'
    ].includes(
      lastConversationDomain
    );

  const profileIntents =
    resolveCustomerProfileIntents(
      message,
      {
        lastIntents:
          repairProfileContext
            ? lastProfileIntents
            : []
      }
    );

  const billingIntents =
    classifyPersonalBillingIntents(
      message,
      {
        hasPersonalBillingContext:
          repair
            ? repairBillingContext
            : hasPersonalBillingContext,
        lastBillingIntent:
          repairBillingContext
            ? lastBillingIntent
            : null
      }
    );

  const intentCount =
    profileIntents.length +
    billingIntents.length;

  const domain =
    inferConversationDomain(
      profileIntents,
      billingIntents
    );

  return {
    profileIntents,
    billingIntents,
    repair,
    domain,
    intentCount,
    isComposite:
      intentCount > 1,
    needsProfile:
      profileIntents.length > 0,
    needsBilling:
      billingIntents.length > 0
  };
}

function buildCompositeCustomerReply({
  plan,
  profile,
  experience
}) {
  const blocks = [
    plan?.repair
      ? 'Claro. En simple:'
      : 'Claro. Te respondo punto por punto:'
  ];

  if (
    plan?.profileIntents?.length
  ) {
    blocks.push(
      buildCustomerProfileMultiReply({
        intents:
          plan.profileIntents,
        profile,
        experience,
        repair:
          Boolean(plan.repair),
        includeIntro: false
      })
    );
  }

  if (
    plan?.billingIntents?.length
  ) {
    blocks.push(
      buildPersonalBillingMultiReply(
        experience,
        plan.billingIntents,
        {
          repair:
            Boolean(plan.repair),
          includeIntro: false
        }
      )
    );
  }

  return blocks
    .filter(Boolean)
    .join('\n\n');
}

module.exports = {
  inferConversationDomain,
  planCustomerConversationTurn,
  buildCompositeCustomerReply
};
