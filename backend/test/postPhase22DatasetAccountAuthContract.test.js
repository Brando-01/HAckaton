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
  'login cliente usa COD_CLIENTE + NUM_ANEXO y no muestra perfiles ficticios',
  () => {
    const html =
      read('frontend/login.html');
    const js =
      read('frontend/login.js');

    assert.match(html, /COD_CLIENTE/);
    assert.match(html, /NUM_ANEXO/);
    assert.match(
      js,
      /\/api\/auth\/dataset-login/
    );
    assert.doesNotMatch(
      html,
      /Carlos Mendoza|Ana Torres|Demo1234!|carlos\.demo@movistar\.pe/
    );
    assert.doesNotMatch(
      js,
      /\/api\/auth\/demo-login|\/api\/auth\/demo-profiles/
    );
  }
);

test(
  'backend conserva demo-login solo para automatización pero publica dataset-login para cliente',
  () => {
    const server =
      read('backend/server.js');

    assert.match(
      server,
      /\/api\/auth\/dataset-login/
    );
    assert.match(
      server,
      /createDatasetAccountAuthService/
    );
    assert.match(
      server,
      /toPublicAuthUser/
    );
  }
);

test(
  'F22 exige DATASET_AUTH_BOUNDARY',
  () => {
    const manifest =
      read(
        'backend/config/desafio1ChallengeManifest.js'
      );
    const preflight =
      read(
        'backend/services/desafio1ChallengePreflightLogic.js'
      );

    assert.match(
      manifest,
      /'DATASET_AUTH_BOUNDARY'/
    );
    assert.match(
      preflight,
      /id:\s*'DATASET_AUTH_BOUNDARY'/
    );
    assert.match(
      preflight,
      /COD_CLIENTE \+ NUM_ANEXO/
    );
  }
);

test(
  'la UI muestra NUM_ANEXO enmascarado después de autenticarse',
  () => {
    const app =
      read('frontend/app.js');

    assert.match(
      app,
      /serviceNumberMasked/
    );
    assert.match(
      app,
      /Dataset validado/
    );
  }
);


test(
  'repositorio exige coincidencia exacta de customer_key y subscriber_key',
  () => {
    const repository =
      read(
        'backend/services/desafio1Repository.js'
      );

    assert.match(
      repository,
      /WHERE customer_key = \?[\s\S]*AND subscriber_key = \?/
    );
    assert.match(
      repository,
      /subscriberHasBilling/
    );
  }
);
