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
      /Explora los casos utilizables/
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
  'el frontend del explorador es solo lectura y nunca intenta adoptar una identidad',
  () => {
    const source =
      read('frontend/explorer.js');
    const html =
      read('frontend/explorer.html');

    assert.match(
      source,
      /\/api\/explorer\/profiles/
    );
    assert.doesNotMatch(
      source,
      /\/api\/explorer\/open/
    );
    assert.doesNotMatch(
      source,
      /subscriberKey|customerKey/
    );
    assert.match(
      html,
      /solo lectura/i
    );
    assert.match(
      html,
      /href="\/login"/
    );
  }
);

test(
  'contrato web no presenta el Explorador como acceso a cuentas personales',
  () => {
    const html =
      read('frontend/explorer.html');
    const demo =
      read('frontend/demo.html');

    assert.doesNotMatch(
      html,
      /Abrir caso en Mi Movistar/i
    );
    assert.match(
      html,
      /no permite adoptar la identidad/i
    );
    assert.match(
      demo,
      /modo lectura/i
    );
    assert.match(
      demo,
      /no permiten adoptar identidades/i
    );
  }
);
