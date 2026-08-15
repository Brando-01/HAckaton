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

test(
  'package publica un único comando challenge preflight F22',
  () => {
    const pkg = JSON.parse(
      read('backend/package.json')
    );

    assert.equal(
      pkg.scripts[
        'challenge:preflight:desafio1'
      ],
      'node scripts/preflightIntegralDesafio1.js'
    );
  }
);

test(
  'artefacto local F22 queda fuera de Git',
  () => {
    const ignore =
      read('.gitignore');

    assert.match(
      ignore,
      /phase22-challenge-preflight\.local\.json/
    );
  }
);

test(
  'manifiesto congela ocho fuentes y dos casos representativos sin subscriber keys',
  () => {
    const manifest =
      read(
        'backend/config/desafio1ChallengeManifest.js'
      );

    assert.match(
      manifest,
      /CLI000001/
    );
    assert.match(
      manifest,
      /CLI000002/
    );
    assert.match(
      manifest,
      /RECONNECTION/
    );
    assert.match(
      manifest,
      /PRORATION/
    );
    assert.equal(
      /subscriberKey\s*:/.test(
        manifest
      ),
      false
    );
  }
);

test(
  'documentación F22 acepta READY_WITH_KNOWN_LIMITS y no fuerza cobertura inexistente',
  () => {
    const doc = read(
      'backend/docs/desafio1-fase22.md'
    );

    assert.match(
      doc,
      /READY_WITH_KNOWN_LIMITS/
    );
    assert.match(
      doc,
      /equipo financiado pendiente/i
    );
    assert.match(
      doc,
      /no se fuerza `PASS`|no se transforma artificialmente/i
    );
  }
);

test(
  'documentación F22 congela arquitectura y separa benchmark local de SLA',
  () => {
    const doc = read(
      'backend/docs/desafio1-fase22.md'
    );

    assert.match(
      doc,
      /Motor financiero determinista/
    );
    assert.match(
      doc,
      /WhatsApp.*simulado/is
    );
    assert.match(
      doc,
      /no.*SLA|no representa SLA/i
    );
  }
);

test(
  'script F22 ejecuta suite, B2C completo, performance y smoke mediante el service',
  () => {
    const script = read(
      'backend/scripts/preflightIntegralDesafio1.js'
    );
    const service = read(
      'backend/services/desafio1ChallengePreflightService.js'
    );

    assert.match(
      service,
      /runNodeTestSuite/
    );
    assert.match(
      service,
      /limit:\s*null/
    );
    assert.match(
      service,
      /runLocalPerformanceAudit/
    );
    assert.match(
      service,
      /runReleaseSmoke/
    );
    assert.match(
      script,
      /challenge.*preflight|PREFLIGHT INTEGRAL/is
    );
  }
);

test(
  'preflight final auto-audita claves privadas del propio reporte',
  () => {
    const logic = read(
      'backend/services/desafio1ChallengePreflightLogic.js'
    );

    assert.match(
      logic,
      /FORBIDDEN_REPORT_KEYS/
    );
    assert.match(
      logic,
      /collectForbiddenReportKeys/
    );
    assert.match(
      logic,
      /reportPrivacy/
    );
    assert.match(
      logic,
      /REVIEW_REQUIRED/
    );
  }
);

test(
  'preflight F22 congela explícitamente la frontera de autenticación del Explorador',
  () => {
    const manifest =
      read(
        'backend/config/desafio1ChallengeManifest.js'
      );
    const logic =
      read(
        'backend/services/desafio1ChallengePreflightLogic.js'
      );
    const hardening =
      read(
        'backend/docs/desafio1-postfase22-hardening-explorer-auth.md'
      );

    assert.match(
      manifest,
      /EXPLORER_AUTH_BOUNDARY/
    );
    assert.match(
      logic,
      /runExplorerAuthBoundaryAudit/
    );
    assert.match(
      hardening,
      /EXPLORER_READ_ONLY/
    );
    assert.match(
      hardening,
      /no crea.*Set-Cookie|no crea `Set-Cookie`/i
    );
  }
);

test(
  'README publica el comando final y explica known limits',
  () => {
    const readme =
      read('README.md');

    assert.match(
      readme,
      /challenge:preflight:desafio1/
    );
    assert.match(
      readme,
      /READY_WITH_KNOWN_LIMITS/
    );
    assert.match(
      readme,
      /desafio1-fase22\.md/
    );
  }
);
