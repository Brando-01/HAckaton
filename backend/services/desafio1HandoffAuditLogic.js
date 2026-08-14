const {
  HANDOFF_DECISIONS,
  evaluatePreTurnHandoffPolicy,
  evaluatePostTurnHandoffPolicy
} = require('./desafio1HandoffPolicyLogic');

const HANDOFF_AUDIT_VERSION =
  'desafio1-phase19-handoff-policy-v1';

const GOLDEN_HANDOFF_CASES = Object.freeze([
  {
    caseRef: 'HOF001',
    stage: 'PRE',
    input: {
      message: 'Quiero hablar con un asesor'
    },
    expectedDecision: 'TRANSFER_NOW',
    expectedReason: 'CLIENT_REQUEST'
  },
  {
    caseRef: 'HOF002',
    stage: 'PRE',
    input: {
      message: 'No estoy de acuerdo'
    },
    expectedDecision: 'TRANSFER_NOW',
    expectedReason: 'CUSTOMER_DISAGREES'
  },
  {
    caseRef: 'HOF003',
    stage: 'PRE',
    input: {
      message: 'Esto no resolvió mi problema'
    },
    expectedDecision: 'TRANSFER_NOW',
    expectedReason: 'NOT_RESOLVED'
  },
  {
    caseRef: 'HOF004',
    stage: 'PRE',
    input: {
      message: 'Mi wifi no funciona desde ayer'
    },
    expectedDecision: 'TRANSFER_NOW',
    expectedReason: 'OUT_OF_BILLING_SCOPE'
  },
  {
    caseRef: 'HOF005',
    stage: 'PRE',
    input: {
      message: 'Me cobraron una reconexión después de quedarme sin internet'
    },
    expectedDecision: 'NONE',
    expectedReason: null
  },
  {
    caseRef: 'HOF006',
    stage: 'PRE',
    input: {
      message: 'No entendí, explícamelo más fácil',
      repair: true,
      previousRepairCount: 0,
      lastConversationDomain: 'BILLING'
    },
    expectedDecision: 'NONE',
    expectedReason: null
  },
  {
    caseRef: 'HOF007',
    stage: 'PRE',
    input: {
      message: 'Sigo sin entender, explícamelo otra vez',
      repair: true,
      previousRepairCount: 1,
      lastConversationDomain: 'BILLING'
    },
    expectedDecision: 'TRANSFER_NOW',
    expectedReason:
      'REPEATED_UNDERSTANDING_FAILURE'
  },
  {
    caseRef: 'HOF008',
    stage: 'PRE',
    input: {
      message: 'No entendí',
      repair: true,
      previousRepairCount: 1,
      lastConversationDomain: 'GENERAL'
    },
    expectedDecision: 'NONE',
    expectedReason: null
  },
  {
    caseRef: 'HOF009',
    stage: 'PRE',
    input: {
      message: 'Hola, buenos días'
    },
    expectedDecision: 'NONE',
    expectedReason: null
  },
  {
    caseRef: 'HOF010',
    stage: 'PRE',
    input: {
      message: '¿Qué es un prorrateo?'
    },
    expectedDecision: 'NONE',
    expectedReason: null
  },
  {
    caseRef: 'HOF011',
    stage: 'POST',
    input: {
      resolutionStatus: 'RESOLVED'
    },
    expectedDecision: 'NONE',
    expectedReason: null
  },
  {
    caseRef: 'HOF012',
    stage: 'POST',
    input: {
      resolutionStatus: 'PARTIALLY_RESOLVED'
    },
    expectedDecision: 'OFFER_ADVISOR',
    expectedReason: 'RESOLUTION_GAP'
  },
  {
    caseRef: 'HOF013',
    stage: 'POST',
    input: {
      resolutionStatus: 'UNRESOLVED'
    },
    expectedDecision: 'OFFER_ADVISOR',
    expectedReason: 'RESOLUTION_GAP'
  },
  {
    caseRef: 'HOF014',
    stage: 'PRE',
    input: {
      message: 'Necesito cambiar la contraseña del wifi'
    },
    expectedDecision: 'TRANSFER_NOW',
    expectedReason: 'OUT_OF_BILLING_SCOPE'
  }
]);

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function percentage(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return round(
    (numerator / denominator) * 100,
    2
  );
}

function evaluateGoldenCase(testCase) {
  const actual =
    testCase.stage === 'POST'
      ? evaluatePostTurnHandoffPolicy(
          testCase.input
        )
      : evaluatePreTurnHandoffPolicy(
          testCase.input
        );

  const decisionMatches =
    actual.decision ===
    testCase.expectedDecision;

  const reasonMatches =
    (actual.reasonCode || null) ===
    (testCase.expectedReason || null);

  return {
    caseRef: testCase.caseRef,
    stage: testCase.stage,
    expectedDecision:
      testCase.expectedDecision,
    actualDecision:
      actual.decision,
    expectedReason:
      testCase.expectedReason || null,
    actualReason:
      actual.reasonCode || null,
    ok:
      decisionMatches && reasonMatches
  };
}

function runHandoffPolicyBenchmark() {
  const cases =
    GOLDEN_HANDOFF_CASES.map(
      evaluateGoldenCase
    );

  const correct = cases.filter(
    (item) => item.ok
  ).length;

  const expectedTransfers =
    cases.filter(
      (item) =>
        item.expectedDecision ===
        HANDOFF_DECISIONS.TRANSFER_NOW
    );

  const predictedTransfers =
    cases.filter(
      (item) =>
        item.actualDecision ===
        HANDOFF_DECISIONS.TRANSFER_NOW
    );

  const truePositiveTransfers =
    cases.filter(
      (item) =>
        item.expectedDecision ===
          HANDOFF_DECISIONS.TRANSFER_NOW &&
        item.actualDecision ===
          HANDOFF_DECISIONS.TRANSFER_NOW
    ).length;

  const falsePositiveTransfers =
    predictedTransfers.length -
    truePositiveTransfers;

  const falseNegativeTransfers =
    expectedTransfers.length -
    truePositiveTransfers;

  const violations = cases.filter(
    (item) => !item.ok
  );

  return {
    version: HANDOFF_AUDIT_VERSION,
    scope:
      'DETERMINISTIC_POLICY_GOLDEN_CASES',
    status:
      violations.length === 0
        ? 'PASS'
        : 'FAIL',
    totalCases: cases.length,
    correctCases: correct,
    decisionAccuracy:
      percentage(correct, cases.length),
    expectedTransfers:
      expectedTransfers.length,
    predictedTransfers:
      predictedTransfers.length,
    transferPrecision:
      percentage(
        truePositiveTransfers,
        predictedTransfers.length
      ),
    transferRecall:
      percentage(
        truePositiveTransfers,
        expectedTransfers.length
      ),
    falsePositiveTransfers,
    falseNegativeTransfers,
    violations,
    cases
  };
}

module.exports = {
  HANDOFF_AUDIT_VERSION,
  GOLDEN_HANDOFF_CASES,
  evaluateGoldenCase,
  runHandoffPolicyBenchmark
};
