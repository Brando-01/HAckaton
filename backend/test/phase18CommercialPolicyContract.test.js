const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test('Fase 18 documenta RESOLVED + regla explícita y prohíbe oferta genérica', () => {
  const doc = read(
    'backend/docs/desafio1-fase18.md'
  );

  assert.match(doc, /consulta RESOLVED/);
  assert.match(doc, /regla explícita/i);
  assert.match(doc, /No existe una oferta por defecto/);
  assert.match(doc, /regla simplificada del prototipo/i);
});

test('Efecto Efervescente exige beneficio existente HIGH y nunca alta nueva', () => {
  const logic = read(
    'backend/services/desafio1CommercialPolicyLogic.js'
  );

  assert.match(logic, /ACTIVE_DISCOUNT/);
  assert.match(logic, /evidenceLevel === 'HIGH'/);
  assert.match(logic, /existingBenefit: true/);
  assert.match(logic, /newAddition: false/);
});

test('la capa comercial se declara simulada y separada de las ocho fuentes financieras', () => {
  const dataService = read(
    'backend/services/desafio1CommercialDataService.js'
  );
  const doc = read(
    'backend/docs/desafio1-fase18.md'
  );

  assert.match(
    dataService,
    /SIMULATED_COMMERCIAL_LAYER/
  );
  assert.match(
    dataService,
    /affectsOfficialFinancialReasoning:\s*false/
  );
  assert.match(
    doc,
    /no pueden alterar.*totales.*deltas.*causas/is
  );
});

test('server integra la política después de resolución y conserva decisión por sesión', () => {
  const server = read('backend/server.js');

  assert.match(
    server,
    /createDesafio1CommercialPolicyService/
  );
  assert.match(
    server,
    /evaluateCommercialTurn/
  );
  assert.match(
    server,
    /commercialExperience/
  );
  assert.match(
    server,
    /\.\.\.commercialTurn\s*\.contextPatch/
  );
});

test('el NBO legado con fallbacks no está montado por server.js', () => {
  const server = read('backend/server.js');
  const legacy = read(
    'backend/services/nboService.js'
  );

  assert.match(legacy, /Oferta por defecto/);
  assert.equal(
    server.includes("require('./routes/nbo')"),
    false
  );
  assert.equal(
    server.includes('recomendarOferta'),
    false
  );
});

test('Lucía renderiza comercial solo fuera de auth y handoff y usa prompt backend', () => {
  const chat = read('frontend/chat.js');

  assert.match(chat, /appendCommercialExperience/);
  assert.match(
    chat,
    /!data\.requiresAuth[\s\S]*!data\.handoff[\s\S]*data\.commercialExperience/
  );
  assert.match(
    chat,
    /crossSell\.action\.prompt/
  );
});

test('Mi Movistar muestra beneficios existentes pero no contiene UI de contratación', () => {
  const html = read('frontend/app.html');
  const app = read('frontend/app.js');

  assert.match(html, /Beneficios que ya tienes/);
  assert.match(app, /renderExistingBenefits/);
  assert.match(app, /newAddition === false/);
  assert.equal(
    /contratar|comprar ahora|pagar oferta/i.test(html),
    false
  );
});

test('la separación F15/F18 mantiene comercial fuera del resolution engine', () => {
  const resolution = read(
    'backend/services/desafio1ResolutionLogic.js'
  );

  assert.match(
    resolution,
    /commercialActionOffered:\s*false/
  );
  assert.match(
    resolution,
    /HANDLED_BY_PHASE18_SEPARATE_COMMERCIAL_POLICY/
  );
});
