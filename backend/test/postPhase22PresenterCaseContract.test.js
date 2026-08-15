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
  'package publica la herramienta local para resolver un caso hacia el login',
  () => {
    const packageJson =
      require('../package.json');

    assert.equal(
      packageJson.scripts[
        'demo:login-case:desafio1'
      ],
      'node scripts/resolverCasoLoginDesafio1.js'
    );
  }
);

test(
  'el Explorador presenta números de caso y no aliases DEMO como identidad visible',
  () => {
    const html =
      read('frontend/explorer.html');
    const js =
      read('frontend/explorer.js');

    assert.match(
      html,
      /Buscar y filtrar casos de cobertura/
    );
    assert.match(
      html,
      /Número de caso/
    );
    assert.doesNotMatch(
      html,
      /Buscar y filtrar perfiles DEMO/
    );
    assert.match(
      js,
      /Caso #\$\{match\[1\]\}/
    );
  }
);

test(
  'la herramienta del presentador no se monta como endpoint HTTP',
  () => {
    const server =
      read('backend/server.js');
    const script =
      read(
        'backend/scripts/resolverCasoLoginDesafio1.js'
      );

    assert.doesNotMatch(
      server,
      /PresenterCaseService|demo\/login-case|presenter-case/i
    );
    assert.doesNotMatch(
      script,
      /app\.(get|post|put|patch|delete)\s*\(/
    );
    assert.match(
      script,
      /SOLO PARA LA TERMINAL LOCAL DEL PRESENTADOR/
    );
  }
);

test(
  'el CLI no persiste COD_CLIENTE ni NUM_ANEXO en un artefacto local',
  () => {
    const script =
      read(
        'backend/scripts/resolverCasoLoginDesafio1.js'
      );

    assert.doesNotMatch(
      script,
      /writeFile|writeFileSync|appendFile|createWriteStream/
    );
    assert.match(
      script,
      /no la publiques/i
    );
  }
);

test(
  'documentación conserva la separación Explorer → terminal local → login normal',
  () => {
    const doc =
      read(
        'backend/docs/desafio1-postfase22-presenter-case-login.md'
      );
    const readme =
      read('README.md');

    assert.match(
      doc,
      /Explorador[\s\S]*terminal local[\s\S]*COD_CLIENTE \+ NUM_ANEXO[\s\S]*\/login/i
    );
    assert.match(
      doc,
      /No crea cookie ni sesión/i
    );
    assert.match(
      readme,
      /demo:login-case:desafio1/
    );
  }
);
