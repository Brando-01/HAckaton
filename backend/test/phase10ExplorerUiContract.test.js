const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(
  __dirname,
  '../..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test(
  'Fase 10 publica una vista de explorador separada del login masivo',
  () => {
    const server =
      read('backend/server.js');
    const html =
      read('frontend/explorer.html');
    const demo =
      read('frontend/demo.html');

    assert.match(
      server,
      /app\.get\('\/explorer'/
    );
    assert.match(
      html,
      /Explora los clientes utilizables/
    );
    assert.match(
      demo,
      /Explorador del dataset/
    );
    assert.doesNotMatch(
      html,
      /20 000 contraseñas/i
    );
  }
);

test(
  'el frontend consume solo endpoints explorer y nunca solicita subscriberKey o customerKey',
  () => {
    const source =
      read('frontend/explorer.js');

    assert.match(
      source,
      /\/api\/explorer\/profiles/
    );
    assert.match(
      source,
      /\/api\/explorer\/open/
    );
    assert.doesNotMatch(
      source,
      /subscriberKey/
    );
    assert.doesNotMatch(
      source,
      /customerKey/
    );
  }
);

test(
  'Mi Movistar distingue la sesión temporal del explorador y permite regresar al índice',
  () => {
    const appJs =
      read('frontend/app.js');
    const appHtml =
      read('frontend/app.html');

    assert.match(
      appJs,
      /EXPLORER/
    );
    assert.match(
      appJs,
      /Explorador dataset/
    );
    assert.match(
      appHtml,
      /returnExplorerLink/
    );
  }
);

test(
  'Lucía identifica visualmente sesiones del explorador',
  () => {
    const chatJs =
      read('frontend/chat.js');
    const chatHtml =
      read('frontend/index.html');

    assert.match(
      chatJs,
      /'explorador'/
    );
    assert.match(
      chatHtml,
      /href="\/explorer"/
    );
  }
);
