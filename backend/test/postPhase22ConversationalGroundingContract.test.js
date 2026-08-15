const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(
  __dirname,
  '..',
  '..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test('hardening conversacional documenta que Groq no es autoridad financiera', () => {
  const doc = read(
    'backend/docs/desafio1-postfase22-hardening-conversacional.md'
  );

  assert.match(
    doc,
    /STRUCTURED_DATA_AND_DETERMINISTIC_RULES/
  );
  assert.match(
    doc,
    /Groq.*naturaliz|naturaliz.*Groq/is
  );
  assert.match(
    doc,
    /no.*crea.*hechos financieros|no puede.*crear.*financier/is
  );
});

test('server valida referencias explícitas antes de consultar y nunca delega razonamiento financiero al LLM', () => {
  const server = read(
    'backend/server.js'
  );

  assert.match(
    server,
    /extractExplicitInvoiceReference/
  );
  assert.match(
    server,
    /getInvoiceReferenceForUser/
  );
  assert.match(
    server,
    /DESAFIO1_INVOICE_REFERENCE_GROUNDED/
  );
  assert.match(
    server,
    /financialReasoningByLlm:\s*false/
  );
});

test('IDs escritos en el chat tienen una frontera explícita y no cambian la identidad autenticada', () => {
  const logic = read(
    'backend/services/desafio1ConversationReferenceLogic.js'
  );
  const server = read(
    'backend/server.js'
  );

  assert.match(
    logic,
    /CUSTOMER_REFERENCE_CANNOT_SWITCH_IDENTITY/
  );
  assert.match(
    server,
    /DESAFIO1_IDENTITY_BOUNDARY/
  );
  assert.match(
    server,
    /customerReferenceAccepted:\s*false/
  );
});

test('naturalización protege claims y conserva fallback determinista', () => {
  const logic = read(
    'backend/services/desafio1ConversationalAiLogic.js'
  );
  const service = read(
    'backend/services/desafio1ConversationalAiService.js'
  );

  assert.match(
    logic,
    /validateNaturalizedReply/
  );
  assert.match(
    logic,
    /deterministicFallbackRequired:\s*true/
  );
  assert.match(
    logic,
    /PROTECTED_.*MISMATCH/
  );
  assert.match(
    service,
    /baseReply/
  );
});

test('benchmark F21 desactiva explícitamente la capa de lenguaje para no contaminar p95', () => {
  const script = read(
    'backend/scripts/auditarRendimientoDesafio1.js'
  );
  const service = read(
    'backend/services/desafio1ChallengePreflightService.js'
  );

  assert.match(
    script,
    /createDesafio1ConversationalAiService\(\{[\s\S]*enabled:\s*false/
  );
  assert.match(
    service,
    /createDesafio1ConversationalAiService\(\{[\s\S]*enabled:\s*false/
  );
});

test('F22 exige la nueva frontera de grounding conversacional', () => {
  const manifest = read(
    'backend/config/desafio1ChallengeManifest.js'
  );
  const preflight = read(
    'backend/services/desafio1ChallengePreflightLogic.js'
  );

  assert.match(
    manifest,
    /CONVERSATIONAL_GROUNDING_BOUNDARY/
  );
  assert.match(
    preflight,
    /runConversationalGroundingAudit/
  );
  assert.match(
    preflight,
    /id:\s*'CONVERSATIONAL_GROUNDING_BOUNDARY'/
  );
});

test('README explica la validación de códigos y el rol acotado de Groq', () => {
  const readme = read('README.md');

  assert.match(
    readme,
    /referencias explícitas de (?:recibo|factura)|códigos explícitos de (?:recibo|factura)/i
  );
  assert.match(
    readme,
    /Groq/i
  );
  assert.match(
    readme,
    /motor.*determinista|hechos financieros.*determinista/is
  );
});


test('referencias explícitas de mes se validan contra el historial autenticado antes del intent genérico', () => {
  const logic = read(
    'backend/services/desafio1ConversationReferenceLogic.js'
  );
  const server = read(
    'backend/server.js'
  );

  assert.match(
    logic,
    /extractExplicitBillingPeriodReference/
  );
  assert.match(
    logic,
    /resolveBillingPeriodReference/
  );
  assert.match(
    logic,
    /No voy a sustituirlo por otro mes/
  );
  assert.match(
    server,
    /DESAFIO1_BILLING_PERIOD_REFERENCE_GROUNDED/
  );
  assert.match(
    server,
    /includeHistory:[\s\S]*explicitBillingPeriodReference/
  );
});

test('F22 congela también la validación temporal dentro del grounding conversacional', () => {
  const policy = read(
    'backend/services/desafio1ConversationalAiLogic.js'
  );
  const preflight = read(
    'backend/services/desafio1ChallengePreflightLogic.js'
  );

  assert.match(
    policy,
    /explicitBillingPeriodsValidatedAgainstAuthenticatedHistory:\s*true/
  );
  assert.match(
    preflight,
    /billingPeriodScopedToAuthenticatedHistory/
  );
});
