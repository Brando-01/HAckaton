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

test(
  'login público post-F22 valida la pareja real del dataset y no expone perfiles demo',
  () => {
    const js =
      read('frontend/login.js');
    const html =
      read('frontend/login.html');

    assert.match(
      js,
      /\/api\/auth\/dataset-login/
    );
    assert.match(
      html,
      /COD_CLIENTE/
    );
    assert.match(
      html,
      /NUM_ANEXO/
    );
    assert.doesNotMatch(
      js,
      /demoProfiles|demoLogin\(/
    );
  }
);

test(
  'los perfiles de Fase 8 permanecen como catálogo interno para pruebas y benchmarks',
  () => {
    const catalog =
      read(
        'backend/config/demoProfiles.js'
      );

    assert.match(
      catalog,
      /CLI000001/
    );
    assert.match(
      catalog,
      /CLI000006/
    );
    assert.match(
      catalog,
      /release1Pitch/
    );
  }
);

test(
  'package.json publica el comando seguro para listar perfiles demo',
  () => {
    const packageJson =
      JSON.parse(
        read(
          'backend/package.json'
        )
      );

    assert.equal(
      packageJson.scripts[
        'demo:profiles:desafio1'
      ],
      'node scripts/listarPerfilesDemoDesafio1.js'
    );
  }
);

test(
  'Lucía oculta por completo el badge cuando no hay autenticación',
  () => {
    const css =
      read('frontend/chat.css');

    assert.match(
      css,
      /\.auth-context-badge\[hidden\][\s\S]*display:\s*none/
    );
  }
);

test(
  'Lucía resincroniza identidad y adopta un sessionId nuevo al cambiar de perfil',
  () => {
    const js =
      read('frontend/chat.js');

    assert.match(
      js,
      /await associateAuthenticatedCustomer\(\s*currentSessionId\s*\)/
    );
    assert.match(
      js,
      /associationData\.sessionId/
    );
    assert.match(
      js,
      /sessionStorage\.setItem\(\s*'chatSessionId'/
    );
    assert.match(
      js,
      /window\.addEventListener\(\s*'focus'/
    );
  }
);

test(
  'Lucía fuerza revalidación sin caché y retira el aviso obsoleto al recuperar autenticación',
  () => {
    const js =
      read('frontend/chat.js');

    assert.match(
      js,
      /\/api\/auth\/me'[\s\S]*cache:\s*'no-store'[\s\S]*credentials:\s*'same-origin'/
    );
    assert.match(
      js,
      /function clearAuthSessionWarning/
    );
    assert.match(
      js,
      /clearAuthSessionWarning\(\);[\s\S]*authContextBadge\.textContent/
    );
    assert.match(
      js,
      /warning\.id\s*=\s*'authSessionWarning'/
    );
  }
);

