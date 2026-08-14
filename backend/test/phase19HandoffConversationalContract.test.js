const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(__dirname, '..', '..', relativePath),
    'utf8'
  );
}

test('Fase 19 publica benchmark reproducible de precisión de handoff', () => {
  const packageJson = JSON.parse(read('backend/package.json'));

  assert.equal(
    packageJson.scripts['audit:handoff:desafio1'],
    'node scripts/auditarHandoffDesafio1.js'
  );
});

test('política declara umbral de dos reformulaciones y derivación fuera de facturación', () => {
  const source = read('backend/services/desafio1HandoffPolicyLogic.js');

  assert.match(source, /REPAIR_TRANSFER_THRESHOLD\s*=\s*2/);
  assert.match(source, /OUT_OF_BILLING_SCOPE/);
  assert.match(source, /REPEATED_UNDERSTANDING_FAILURE/);
});

test('server aplica política antes de handoff y registra outcomes de resolución', () => {
  const source = read('backend/server.js');

  assert.match(source, /evaluatePreTurnHandoffPolicy/);
  assert.match(source, /trackResolutionOutcome/);
  assert.match(source, /registerTurnOutcome/);
  assert.match(
    source,
    /registerTurnSignal[\s\S]{0,260}repair:\s*conversationPlan\.repair/
  );
});

test('dashboard deja de presentar resolución y silencio como proxies', () => {
  const html = read('frontend/dashboard.html');

  assert.match(html, /Resolución verificada/i);
  assert.match(html, /Silencio post-explicación/i);
  assert.doesNotMatch(html, /Resolución digital[\s\S]{0,80}proxy/i);
  assert.doesNotMatch(html, /Sin respuesta[\s\S]{0,80}proxy/i);
});

test('dashboard mantiene contacto repetido identificado como proxy local', () => {
  const html = read('frontend/dashboard.html');

  assert.match(html, /Contactos repetidos[\s\S]{0,80}proxy/i);
});

test('portal del asesor muestra la regla y el umbral cuando existen', () => {
  const source = read('frontend/advisor.js');

  assert.match(source, /Regla aplicada/);
  assert.match(source, /Umbral de incomprensión/);
  assert.match(source, /OUT_OF_BILLING_SCOPE/);
});

test('documentación F19 acota la precisión de handoff a casos etiquetados', () => {
  const doc = read('backend/docs/desafio1-fase19.md');

  assert.match(doc, /casos etiquetados/i);
  assert.match(doc, /no equivale a precisión productiva/i);
  assert.match(doc, /silencio post-explicación/i);
});
