const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runConversationalGroundingAudit
} = require(
  '../services/desafio1ChallengePreflightLogic'
);
const {
  getConversationalGroundingPolicy
} = require(
  '../services/desafio1ConversationalAiLogic'
);

test('F22 aprueba la frontera cuando Groq solo interpreta/naturaliza y los facts siguen deterministas', () => {
  const audit =
    runConversationalGroundingAudit(
      getConversationalGroundingPolicy()
    );

  assert.equal(audit.status, 'PASS');
  assert.equal(
    audit.checks
      .deterministicFinancialAuthority,
    true
  );
  assert.equal(
    audit.checks
      .llmCannotCreateFinancialFacts,
    true
  );
  assert.equal(
    audit.checks
      .invoiceReferenceScopedToAuthenticatedHistory,
    true
  );
});

test('F22 falla si una futura modificación permite al LLM crear hechos financieros', () => {
  const policy = {
    ...getConversationalGroundingPolicy(),
    llmMayCreateFinancialFacts: true
  };

  const audit =
    runConversationalGroundingAudit(
      policy
    );

  assert.equal(audit.status, 'FAIL');
  assert.equal(
    audit.checks
      .llmCannotCreateFinancialFacts,
    false
  );
});
