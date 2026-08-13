const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      '..',
      relativePath
    ),
    'utf8'
  );
}

test('la portada muestra el estado vivo del Release 1 y el flujo recomendado', () => {
  const html = read('frontend/demo.html');
  const js = read('frontend/demo.js');

  assert.match(
    html,
    /releaseStatusCard/
  );
  assert.match(
    html,
    /¿Por qué subió mi recibo\?/i
  );
  assert.match(
    html,
    /Carlos/i
  );
  assert.match(
    html,
    /Ana/i
  );
  assert.match(
    js,
    /\/api\/demo\/release\/readiness/
  );
});

test('el dashboard reemplaza estados Pendiente de calidad por controles del preflight', () => {
  const html = read(
    'frontend/dashboard.html'
  );

  assert.match(
    html,
    /PREPARACIÓN DEL RELEASE 1/
  );
  assert.match(
    html,
    /Grounding financiero/
  );
  assert.match(
    html,
    /Privacidad de la experiencia/
  );
  assert.doesNotMatch(
    html,
    /Retrieval Accuracy[\s\S]{0,400}Pendiente/i
  );
  assert.doesNotMatch(
    html,
    /Alucinación financiera[\s\S]{0,400}Pendiente/i
  );
});

test('el dashboard conserva explícitamente que los KPIs operativos son proxies cuando corresponde', () => {
  const html = read(
    'frontend/dashboard.html'
  );

  assert.match(
    html,
    /Resolución digital[\s\S]*proxy/i
  );
  assert.match(
    html,
    /no demuestra por sí solo que la consulta haya quedado resuelta/i
  );
});

test('package.json publica preflight y smoke test como comandos de Release 1', () => {
  const packageJson = JSON.parse(
    read('backend/package.json')
  );

  assert.equal(
    packageJson.scripts[
      'demo:preflight:desafio1'
    ],
    'node scripts/verificarRelease1Desafio1.js'
  );
  assert.equal(
    packageJson.scripts[
      'demo:smoke:desafio1'
    ],
    'node scripts/smokeRelease1Desafio1.js'
  );
});
