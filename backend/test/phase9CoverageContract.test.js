const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const backendRoot =
  path.resolve(__dirname, '..');
const projectRoot =
  path.resolve(backendRoot, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      projectRoot,
      relativePath
    ),
    'utf8'
  );
}

test(
  'package.json publica generación y resumen de cobertura masiva',
  () => {
    const pkg = JSON.parse(
      read('backend/package.json')
    );

    assert.equal(
      pkg.scripts[
        'demo:coverage:desafio1'
      ],
      'node scripts/generarCoberturaDesafio1.js'
    );
    assert.equal(
      pkg.scripts[
        'demo:coverage:summary:desafio1'
      ],
      'node scripts/resumirCoberturaDesafio1.js'
    );
  }
);

test(
  'el índice masivo local queda ignorado por Git',
  () => {
    const gitignore =
      read('.gitignore');

    assert.match(
      gitignore,
      /\/backend\/data\/demo-coverage\.local\.db\*/
    );
  }
);

test(
  'Fase 9 no añade rutas web ni convierte perfiles masivos en authService',
  () => {
    const server =
      read('backend/server.js');
    const auth =
      read(
        'backend/services/authService.js'
      );

    assert.equal(
      server.includes(
        '/api/demo/coverage'
      ),
      false
    );
    assert.equal(
      auth.includes(
        'DEMO000001'
      ),
      false
    );
  }
);

test(
  'documentación declara que las métricas no se extrapolan desde una muestra',
  () => {
    const doc =
      read(
        'backend/docs/desafio1-fase9.md'
      );

    assert.match(
      doc,
      /no se clasifica una muestra y luego se extrapola al resto/i
    );
    assert.match(
      doc,
      /no crea más credenciales/i
    );
  }
);

test(
  'el resumen CLI no imprime subscriberKey ni customerKey',
  () => {
    const script =
      read(
        'backend/scripts/resumirCoberturaDesafio1.js'
      );

    assert.equal(
      script.includes(
        '.subscriberKey'
      ),
      false
    );
    assert.equal(
      script.includes(
        '.customerKey'
      ),
      false
    );
  }
);
