const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test('Fase 20 publica auditoría omnicanal reproducible', () => {
  const pkg = JSON.parse(
    read('backend/package.json')
  );

  assert.equal(
    pkg.scripts['audit:omnichannel:desafio1'],
    'node scripts/auditarOmnicanalDesafio1.js'
  );
});

test('server expone WhatsApp autenticado y continuidad sin montar un webhook público real', () => {
  const server = read('backend/server.js');

  assert.match(
    server,
    /\/api\/channels\/whatsapp\/inbound/
  );
  assert.match(
    server,
    /requireApiAuth[\s\S]*whatsapp|whatsapp[\s\S]*requireApiAuth/i
  );
  assert.match(
    server,
    /\/api\/session\/:sessionId\/continuity/
  );
  assert.doesNotMatch(
    server,
    /\/webhook\/whatsapp|verify_token|hub\.challenge/i
  );
});

test('el endpoint web de Lucía no confía en channel enviado por el navegador', () => {
  const server = read('backend/server.js');

  assert.match(
    server,
    /req\.omnichannelChannel\s*\|\|[\s\S]*CHANNELS\.LUCIA_WEB/
  );
  assert.doesNotMatch(
    server,
    /activeChannel\s*=\s*normalizeChannel\(\s*req\.body.*channel/s
  );
});

test('Mi Movistar registra el canal sobre el mismo chatSessionId', () => {
  const app = read('frontend/app.js');

  assert.match(
    app,
    /sessionStorage\.getItem\(\s*'chatSessionId'/
  );
  assert.match(
    app,
    /channel:\s*'MI_MOVISTAR'/
  );
  assert.match(
    app,
    /\/api\/session\/.*\/channel/
  );
  assert.match(
    app,
    /await\s+registerMiMovistarContinuity\(\s*auth\.user\.customerId/
  );
});

test('simulador de WhatsApp declara proveedor simulado y usa el endpoint adaptador', () => {
  const html = read('frontend/whatsapp.html');
  const js = read('frontend/whatsapp.js');

  assert.match(
    html,
    /No está conectada a Meta\/Twilio/i
  );
  assert.match(
    js,
    /\/api\/channels\/whatsapp\/inbound/
  );
  assert.match(
    js,
    /providerMessageId/
  );
  assert.doesNotMatch(
    js,
    /phone\s*:|subscriberKey|customerKey/i
  );
});

test('portal del asesor muestra journey y canal por mensaje', () => {
  const advisor = read('frontend/advisor.js');

  assert.match(
    advisor,
    /Continuidad omnicanal/
  );
  assert.match(
    advisor,
    /visitedChannels/
  );
  assert.match(
    advisor,
    /conversation-channel/
  );
});

test('handoff conserva omnichannel seguro y no ids privados dentro del snapshot', () => {
  const handoff = read(
    'backend/services/handoffService.js'
  );

  assert.match(
    handoff,
    /normalizarContextoOmnicanal/
  );
  assert.match(
    handoff,
    /buildSafeContinuitySnapshot/
  );
});

test('documentación F20 acota la demo y no afirma integración productiva de WhatsApp', () => {
  const doc = read(
    'backend/docs/desafio1-fase20.md'
  );

  assert.match(
    doc,
    /No hay webhook firmado de Meta/i
  );
  assert.match(
    doc,
    /sessionStorage/i
  );
  assert.match(
    doc,
    /No afirma.*productiva|no afirma una integración productiva/i
  );
});
