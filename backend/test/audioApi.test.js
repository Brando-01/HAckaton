const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../server');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('transcribe audio autenticado mediante el servicio configurado', async (t) => {
  let receivedAuthorization = '';
  let receivedContentType = '';
  let receivedBodySize = 0;
  const fakeGroq = http.createServer((req, res) => {
    receivedAuthorization = req.headers.authorization || '';
    receivedContentType = req.headers['content-type'] || '';
    req.on('data', (chunk) => { receivedBodySize += chunk.length; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: 'Yami Rey, quiero saber cuándo vence mi ojo.' }));
    });
  });
  await listen(fakeGroq);

  const previousBaseUrl = process.env.GROQ_API_BASE_URL;
  const previousApiKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_BASE_URL = `http://127.0.0.1:${fakeGroq.address().port}`;
  process.env.GROQ_API_KEY = 'test-audio-key';

  const appServer = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));

  t.after(async () => {
    if (previousBaseUrl === undefined) delete process.env.GROQ_API_BASE_URL;
    else process.env.GROQ_API_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousApiKey;
    await close(appServer);
    await close(fakeGroq);
  });

  const appUrl = `http://127.0.0.1:${appServer.address().port}`;
  const loginResponse = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'CLI000001', password: 'Demo1234!' })
  });
  assert.equal(loginResponse.status, 200);
  const { token } = await loginResponse.json();

  const response = await fetch(`${appUrl}/api/audio/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'audio/webm'
    },
    body: Buffer.alloc(512, 1)
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.text, 'Ya, mi rey, quiero saber cuándo vence mi recibo.');
  assert.equal(receivedAuthorization, 'Bearer test-audio-key');
  assert.match(receivedContentType, /^multipart\/form-data; boundary=/);
  assert.ok(receivedBodySize > 512);
});

test('rechaza la transcripción sin inicio de sesión', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => close(server));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/audio/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/webm' },
    body: Buffer.alloc(512, 1)
  });
  assert.equal(response.status, 401);
});

test('genera voz neural peruana autenticada sin exponer la clave al navegador', async (t) => {
  let receivedSsml = '';
  let receivedKey = '';
  const fakeAzure = http.createServer((req, res) => {
    receivedKey = req.headers['ocp-apim-subscription-key'] || '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { receivedSsml += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]));
    });
  });
  await listen(fakeAzure);

  const previous = {
    key: process.env.AZURE_SPEECH_KEY,
    region: process.env.AZURE_SPEECH_REGION,
    endpoint: process.env.AZURE_SPEECH_ENDPOINT,
    elevenLabsKey: process.env.ELEVENLABS_API_KEY
  };
  delete process.env.ELEVENLABS_API_KEY;
  process.env.AZURE_SPEECH_KEY = 'test-neural-key';
  process.env.AZURE_SPEECH_REGION = 'test-region';
  process.env.AZURE_SPEECH_ENDPOINT = `http://127.0.0.1:${fakeAzure.address().port}`;

  const appServer = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  t.after(async () => {
    for (const [name, value] of Object.entries({
      AZURE_SPEECH_KEY: previous.key,
      AZURE_SPEECH_REGION: previous.region,
      AZURE_SPEECH_ENDPOINT: previous.endpoint,
      ELEVENLABS_API_KEY: previous.elevenLabsKey
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await close(appServer);
    await close(fakeAzure);
  });

  const appUrl = `http://127.0.0.1:${appServer.address().port}`;
  const login = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'CLI000001', password: 'Demo1234!' })
  });
  const { token } = await login.json();
  const response = await fetch(`${appUrl}/api/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: 'Tu recibo es menor que S/ 40 & vence pronto.' })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(receivedKey, 'test-neural-key');
  assert.match(receivedSsml, /es-PE-CamilaNeural/);
  assert.match(receivedSsml, /S\/ 40 &amp; vence/);
});

test('prioriza ElevenLabs para generar una voz natural en español', async (t) => {
  let receivedKey = '';
  let receivedBody = null;
  const fakeElevenLabs = http.createServer((req, res) => {
    receivedKey = req.headers['xi-api-key'] || '';
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    });
  });
  await listen(fakeElevenLabs);

  const previous = {
    key: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    model: process.env.ELEVENLABS_MODEL,
    baseUrl: process.env.ELEVENLABS_API_BASE_URL
  };
  process.env.ELEVENLABS_API_KEY = 'sk_test_secret';
  process.env.ELEVENLABS_VOICE_ID = 'voz-espanol-prueba';
  process.env.ELEVENLABS_MODEL = 'eleven_flash_v2_5';
  process.env.ELEVENLABS_API_BASE_URL = `http://127.0.0.1:${fakeElevenLabs.address().port}`;

  const appServer = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  t.after(async () => {
    for (const [name, value] of Object.entries({
      ELEVENLABS_API_KEY: previous.key,
      ELEVENLABS_VOICE_ID: previous.voiceId,
      ELEVENLABS_MODEL: previous.model,
      ELEVENLABS_API_BASE_URL: previous.baseUrl
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await close(appServer);
    await close(fakeElevenLabs);
  });

  const appUrl = `http://127.0.0.1:${appServer.address().port}`;
  const login = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'CLI000001', password: 'Demo1234!' })
  });
  const { token } = await login.json();
  const response = await fetch(`${appUrl}/api/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: 'Hola, causa. Tu recibo vence pronto.' })
  });

  assert.equal(response.status, 200);
  assert.equal(receivedKey, 'sk_test_secret');
  assert.equal(receivedBody.language_code, 'es');
  assert.equal(receivedBody.model_id, 'eleven_flash_v2_5');
  assert.equal(receivedBody.voice_settings.speed, 0.96);
  assert.equal(receivedBody.voice_settings.stability, 0.46);
  assert.equal(receivedBody.voice_settings.style, 0.08);
  assert.match(receivedBody.text, /<break time="0\.32s" \/>/);
});
