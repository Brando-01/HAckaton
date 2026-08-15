const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

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
  'Fase 21 publica benchmark de performance y artefacto local queda fuera de Git',
  () => {
    const packageJson =
      JSON.parse(
        read('backend/package.json')
      );

    assert.equal(
      packageJson.scripts
        ['audit:performance:desafio1'],
      'node scripts/auditarRendimientoDesafio1.js'
    );

    assert.match(
      read('.gitignore'),
      /phase21-performance-audit\.local\.json/
    );
  }
);

test(
  'contrato F21 multiplica volumen y concurrencia y no etiqueta el resultado como SLA',
  () => {
    const logic =
      read(
        'backend/services/desafio1PerformanceLogic.js'
      );

    assert.match(
      logic,
      /baselineJourneys:\s*8/
    );
    assert.match(
      logic,
      /loadMultiplier:\s*3/
    );
    assert.match(
      logic,
      /baselineConcurrency:\s*4/
    );
    assert.match(
      logic,
      /NOT_PRODUCTION_SLA/
    );
  }
);

test(
  'benchmark F21 usa rutas deterministas y exige guardia financiera sin invocar RAG',
  () => {
    const service =
      read(
        'backend/services/desafio1PerformanceBenchmarkService.js'
      );

    assert.match(
      service,
      /\/api\/app\/me/
    );
    assert.match(
      service,
      /\/api\/chat/
    );
    assert.match(
      service,
      /\/api\/channels\/whatsapp\/inbound/
    );
    assert.match(
      service,
      /financialReasoningByLlm\s*===\s*false/
    );
    assert.doesNotMatch(
      service,
      /procesarConsultaFactura|groq|openai/i
    );
  }
);

test(
  'instrumentación HTTP F21 registra solo metadata de rendimiento y permite silenciar logs del benchmark',
  () => {
    const server =
      read('backend/server.js');
    const metrics =
      read(
        'backend/services/desafio1PerformanceMetrics.js'
      );

    assert.match(
      server,
      /classifyPerformanceRequest/
    );
    assert.match(
      server,
      /recordPerformanceSample/
    );
    assert.match(
      server,
      /options\.requestLogging !== false/
    );
    assert.match(
      metrics,
      /MAX_RUNTIME_SAMPLES = 1000/
    );
    assert.doesNotMatch(
      metrics,
      /req\.body|cookie|subscriberKey|customerKey/
    );
  }
);

test(
  'dashboard F21 muestra p50 p95 éxito y muestras como telemetría local no SLA',
  () => {
    const html =
      read('frontend/dashboard.html');
    const js =
      read('frontend/dashboard.js');

    [
      'runtimeP50',
      'runtimeP95',
      'runtimeSuccessRate',
      'runtimeSampleCount'
    ].forEach(
      (id) =>
        assert.match(
          html,
          new RegExp(`id="${id}"`)
        )
    );

    assert.match(
      html,
      /no SLA/i
    );
    assert.match(
      js,
      /data\.performance/
    );
  }
);

test(
  'documentación F21 separa benchmark 3x de métricas runtime y reconoce límites de un solo proceso',
  () => {
    const docs =
      read(
        'backend/docs/desafio1-fase21.md'
      );

    assert.match(docs, /3×/);
    assert.match(docs, /p50/);
    assert.match(docs, /p95/);
    assert.match(docs, /throughput/i);
    assert.match(
      docs,
      /un solo proceso Node/i
    );
    assert.match(
      docs,
      /no un SLA|no SLA|no representa un SLA/i
    );
  }
);


test(
  'CLI F21 no convierte flags ausentes en mínimos de carga',
  () => {
    const cli =
      read(
        'backend/scripts/auditarRendimientoDesafio1.js'
      );

    assert.match(
      cli,
      /return undefined;/
    );
    assert.doesNotMatch(
      cli,
      /index < 0[\s\S]{0,120}return null;/
    );
  }
);
