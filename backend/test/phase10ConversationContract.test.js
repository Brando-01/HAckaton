const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(
  __dirname,
  '..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test(
  'el servidor prioriza handoff sobre consultas de perfil que aparezcan en la misma frase',
  () => {
    const server = read('server.js');

    assert.match(
      server,
      /const preHandoffPolicy[\s\S]{0,180}evaluatePreTurnHandoffPolicy/
    );
    assert.match(
      server,
      /const wantsHandoff\s*=\s*preHandoffPolicy\.decision\s*===\s*HANDOFF_DECISIONS\.TRANSFER_NOW/
    );
    assert.match(
      server,
      /conversationPlan\.isComposite\s*&&\s*!wantsHandoff/
    );
    assert.match(
      server,
      /customerProfileIntents\.length\s*&&\s*!wantsHandoff/
    );
  }
);

test(
  'las consultas compuestas cargan perfil y facturación en paralelo para no penalizar latencia',
  () => {
    const server = read('server.js');

    assert.match(
      server,
      /Promise\.all\(\[\s*profilePromise,\s*experiencePromise/s
    );
    assert.match(
      server,
      /DESAFIO1_CONTEXT_DETERMINISTIC/
    );
  }
);

test(
  'el contexto recuerda el dominio del último turno para reparar sin mezclar temas viejos',
  () => {
    const server = read('server.js');

    assert.match(
      server,
      /lastConversationDomain:\s*conversationPlan\s*\.domain/
    );
    assert.match(
      server,
      /lastConversationDomain:\s*'PROFILE'/
    );
    assert.match(
      server,
      /lastConversationDomain:\s*'BILLING'/
    );
    assert.match(
      server,
      /lastConversationDomain:\s*'GENERAL'/
    );
  }
);

test(
  'la interfaz distingue IA conversacional de datos del desafío sin exponer nombres de archivos',
  () => {
    const chat = read('../frontend/index.html');

    assert.match(
      chat,
      /En línea • Asistencia inteligente/
    );
    assert.match(
      chat,
      /La IA facilita la conversación/
    );
    assert.match(
      chat,
      /datos del servicio y los montos se consultan desde el dataset del desafío/i
    );
    assert.doesNotMatch(
      chat,
      /PLANTA CLIENTES|FACTURACION-CLIENTES|\.csv/i
    );
  }
);
