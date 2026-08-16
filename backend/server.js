const express = require('express');
const cors = require('cors');
const path = require('path');
const { randomUUID } = require('crypto');

// Load environment variables from default .env
require('dotenv').config();

// Debug: print fallback mode at startup to help diagnose rate-limit/fallback issues
console.log('GROQ_FALLBACK_MODE=', String(process.env.GROQ_FALLBACK_MODE || '')); 

const {
  procesarConsultaFactura
} = require('./services/ragService');

const { dbReady } = require('./db');

const authService = require('./services/authService');
const nboRoutes = require('./routes/nbo');
const webhookRoutes = require('./routes/webhook');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // keep a reference if needed

const {
  resetSession,
  getOrCreateSession,
  getSessionSnapshot,
  addMessage,
  updateContext
} = require('./services/sessionService');

const {
  getCustomerExperience,
  getAvailableCustomers,
  customerExists
} = require('./services/appExperienceService');

const { getFichaCliente } = require('./services/dbService');
const { getBillingAnalysis } = require('./services/billingAnalysisService');

const {
  esSolicitudAsesor,
  determinarMotivoDerivacion,
  obtenerConsultaOriginal,
  crearCaso,
  listarCasos,
  obtenerCaso,
  actualizarEstadoCaso
} = require('./services/handoffService');

const {
  registerInteractionContext,
  registerMessage,
  registerHandoff,
  endInteraction,
  registerSatisfaction,
  getInteraction,
  getInteractions,
  getDashboardSummary
} = require('./services/metricsService');


const AUTH_COOKIE_NAME =
  'movistarAuth';

function parseCookies(header) {
  const cookies = {};

  String(header || '')
    .split(';')
    .forEach((part) => {
      const separator =
        part.indexOf('=');

      if (separator < 0) {
        return;
      }

      const key =
        part
          .slice(0, separator)
          .trim();

      const value =
        part
          .slice(separator + 1)
          .trim();

      if (!key) {
        return;
      }

      try {
        cookies[key] =
          decodeURIComponent(value);
      } catch (error) {
        cookies[key] = value;
      }
    });

  return cookies;
}

function getAuthToken(req) {
  return parseCookies(
    req.headers.cookie
  )[AUTH_COOKIE_NAME];
}

function getRequestAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : getAuthToken(req);
  if (!token) return null;

  try {
    const session = authService.getSession(token);
    if (!session) return null;
    return { session: { user: { userId: session.userId, customerId: session.customerId } }, token };
  } catch (e) {
    return null;
  }
}

function setAuthCookie(
  res,
  token
) {
  const maxAgeSeconds =
    Math.floor(
      SESSION_TTL_MS / 1000
    );

  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
}

function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function requirePageAuth(
  req,
  res,
  next
) {
  if (!getRequestAuth(req)) return res.redirect(302, '/login');
  return next();
}

function requireApiAuth(
  req,
  res,
  next
) {
  const auth = getRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Debes iniciar sesión para usar esta función.' });
  req.auth = auth;
  return next();
}

function requireAdvisorAuth(req, res, next) {
  const expectedKey = process.env.ADVISOR_API_KEY;
  if (!expectedKey || req.headers['x-advisor-key'] !== expectedKey) {
    return res.status(403).json({ error: 'Acceso exclusivo para asesores autorizados.' });
  }
  return next();
}

function audioFileExtension(contentType) {
  if (/ogg/i.test(contentType)) return 'ogg';
  if (/mp4|m4a/i.test(contentType)) return 'm4a';
  if (/mpeg|mp3/i.test(contentType)) return 'mp3';
  if (/wav/i.test(contentType)) return 'wav';
  return 'webm';
}

function normalizeVoiceTranscript(value) {
  return String(value || '')
    .replace(/\byami\s+rey\b/gi, 'Ya, mi rey')
    .replace(/\bmi\s+ojo\b/gi, 'mi recibo')
    .replace(/\bres[is]bo\b/gi, 'recibo')
    .replace(/\bvencimento\b/gi, 'vencimiento')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function prepareElevenLabsSpeech(value, modelId = 'eleven_multilingual_v2') {
  let text = String(value || '')
    // El texto procede de respuestas del chat, pero se eliminan etiquetas para
    // que solo nosotros controlemos las pausas que interpreta ElevenLabs.
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  // Un conector corto evita que una respuesta factual arranque como una
  // locución mecánica. No se agregan causas, cifras ni datos nuevos.
  const alreadyConversational = /^(?:¡?hola|¡?habla|claro|mira|a ver|te explico|entiendo|perfecto|chévere|por seguridad|lo siento|no pude|de acuerdo)\b/i.test(text);
  if (!alreadyConversational) {
    if (/^(?:la fecha|tu fecha|vence|el vencimiento)/i.test(text)) text = `Claro. ${text}`;
    else if (/\b(?:recibo|factura|monto|deuda|saldo|plan)\b/i.test(text)) {
      text = `Mira, ${text.charAt(0).toLocaleLowerCase('es-PE')}${text.slice(1)}`;
    }
  }

  let pauses = 0;
  const isV3 = /(?:^|_)v3(?:$|_)/i.test(modelId);
  const pause = isV3 ? '[short pause]' : '<break time="0.32s" />';
  text = text.replace(/([.!?])\s+/g, (match, punctuation) => {
    if (pauses >= 3) return match;
    pauses += 1;
    return `${punctuation} ${pause} `;
  });

  // Una pausa breve antes de explicar detalles mejora el ritmo sin llenar el
  // audio de silencios artificiales.
  if (pauses < 3) {
    text = text.replace(/:\s+/, () => {
      pauses += 1;
      return `: ${isV3 ? '[short pause]' : '<break time="0.22s" />'} `;
    });
  }

  return text;
}


function createApp() {
  const app = express();

  app.use(cors());

  // MediaRecorder sends a small binary clip. Keep this route before the JSON
  // parser so the audio never gets interpreted as text or stored on disk.
  app.post(
    '/api/audio/transcribe',
    requireApiAuth,
    express.raw({
      type: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'],
      limit: '6mb'
    }),
    async (req, res) => {
      if (!process.env.GROQ_API_KEY) {
        return res.status(503).json({ error: 'La transcripción por voz no está configurada.' });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length < 100) {
        return res.status(400).json({ error: 'No recibí audio suficiente para transcribir.' });
      }

      try {
        const contentType = String(req.headers['content-type'] || 'audio/webm').split(';')[0];
        const form = new FormData();
        form.append(
          'file',
          new Blob([req.body], { type: contentType }),
          `consulta.${audioFileExtension(contentType)}`
        );
        form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3');
        form.append('language', 'es');
        form.append('response_format', 'json');
        form.append('temperature', '0');
        form.append(
          'prompt',
          'Conversación peruana con Lucía, asistente Movistar. El usuario puede decir: ya mi rey, causa, mano, mi recibo, factura, deuda, fecha de vencimiento, cuánto tengo que pagar, plan, bono, reconexión, prorrateo y soles. Si parece decir “mi ojo” dentro de una consulta de facturación, probablemente dijo “mi recibo”. Conserva la jerga peruana y transcribe con buena ortografía.'
        );

        const groqApiBaseUrl = String(
          process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1'
        ).replace(/\/$/, '');
        const groqResponse = await fetch(
          `${groqApiBaseUrl}/audio/transcriptions`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            body: form,
            signal: AbortSignal.timeout(30000)
          }
        );
        const payload = await groqResponse.json().catch(() => ({}));
        if (!groqResponse.ok) {
          console.warn('[VOICE] Groq transcription failed:', groqResponse.status, payload.error?.message || 'unknown');
          return res.status(502).json({ error: 'No pude transcribir el audio en este momento.' });
        }

        const text = normalizeVoiceTranscript(payload.text);
        if (!text) return res.status(422).json({ error: 'No logré escuchar palabras con claridad.' });
        return res.json({ ok: true, text });
      } catch (error) {
        console.warn('[VOICE] transcription error:', error.message);
        return res.status(502).json({ error: 'El servicio de voz no respondió. Inténtalo otra vez.' });
      }
    }
  );

  // Accept JSON and URL-encoded form bodies for robustness
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/audio/capabilities', (req, res) => {
    // Voz predeterminada incluida por ElevenLabs y compatible con el plan gratuito.
    const defaultElevenLabsVoice = 'EXAVITQu4vr4xnSDxMaL';
    const elevenLabsReady = Boolean(process.env.ELEVENLABS_API_KEY);
    const azureReady = Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
    return res.json({
      neuralTts: elevenLabsReady || azureReady,
      provider: elevenLabsReady ? 'elevenlabs' : (azureReady ? 'azure' : null),
      locale: 'es-PE',
      voice: elevenLabsReady ? (process.env.ELEVENLABS_VOICE_ID || defaultElevenLabsVoice) : (process.env.AZURE_SPEECH_VOICE || 'es-PE-CamilaNeural')
    });
  });

  app.post('/api/audio/speech', requireApiAuth, async (req, res) => {
    const elevenLabsKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
    const elevenLabsVoiceId = String(process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL').trim();
    const speechKey = String(process.env.AZURE_SPEECH_KEY || '').trim();
    const speechRegion = String(process.env.AZURE_SPEECH_REGION || '').trim();
    const elevenLabsReady = Boolean(elevenLabsKey);
    const azureReady = Boolean(speechKey && speechRegion);
    if (!elevenLabsReady && !azureReady) {
      return res.status(503).json({ error: 'La voz neural todavía no está configurada completamente.' });
    }
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Texto requerido para generar la voz.' });
    if (text.length > 3000) return res.status(413).json({ error: 'El mensaje es demasiado largo para leerlo completo.' });

    if (elevenLabsReady) {
      try {
        const elevenLabsModel = String(process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2').trim();
        const spokenText = prepareElevenLabsSpeech(text, elevenLabsModel);
        const elevenLabsBaseUrl = String(process.env.ELEVENLABS_API_BASE_URL || 'https://api.elevenlabs.io/v1').replace(/\/$/, '');
        const elevenLabsResponse = await fetch(
          `${elevenLabsBaseUrl}/text-to-speech/${encodeURIComponent(elevenLabsVoiceId)}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': elevenLabsKey,
              Accept: 'audio/mpeg',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: spokenText,
              model_id: elevenLabsModel,
              language_code: 'es',
              voice_settings: {
                stability: 0.46,
                similarity_boost: 0.75,
                style: 0.08,
                use_speaker_boost: true,
                speed: 0.96
              }
            }),
            signal: AbortSignal.timeout(30000)
          }
        );
        if (elevenLabsResponse.ok) {
          const audio = Buffer.from(await elevenLabsResponse.arrayBuffer());
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'private, max-age=300');
          return res.send(audio);
        }
        const detail = await elevenLabsResponse.text().catch(() => '');
        console.warn('[VOICE] ElevenLabs failed:', elevenLabsResponse.status, detail.slice(0, 160));
        if (!azureReady) {
          let providerError = null;
          try { providerError = JSON.parse(detail)?.detail || null; } catch (_) {}
          const unusualActivity = providerError?.status === 'detected_unusual_activity';
          return res.status(502).json({
            error: unusualActivity
              ? 'ElevenLabs desactivó el acceso gratuito de esta cuenta por actividad inusual. Desactiva VPN/proxy o revisa el plan de la cuenta.'
              : 'ElevenLabs rechazó la generación de voz. Revisa la API key, permisos, Voice ID y créditos.',
            providerCode: providerError?.status || providerError?.code || null
          });
        }
      } catch (error) {
        console.warn('[VOICE] ElevenLabs error:', error.message);
        if (!azureReady) return res.status(502).json({ error: 'ElevenLabs no está disponible temporalmente.' });
      }
    }

    const voice = process.env.AZURE_SPEECH_VOICE || 'es-PE-CamilaNeural';
    const endpoint = process.env.AZURE_SPEECH_ENDPOINT
      || `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = [
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-PE">',
      `<voice name="${escapeXml(voice)}">`,
      `<prosody rate="-3%" pitch="+0Hz">${escapeXml(text)}</prosody>`,
      '</voice></speak>'
    ].join('');

    try {
      const speechResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-48khz-192kbitrate-mono-mp3',
          'User-Agent': 'Lucia-Movistar-Assistant'
        },
        body: ssml,
        signal: AbortSignal.timeout(30000)
      });
      if (!speechResponse.ok) {
        const detail = await speechResponse.text().catch(() => '');
        console.warn('[VOICE] Azure speech failed:', speechResponse.status, detail.slice(0, 160));
        return res.status(502).json({ error: 'La voz neural no respondió; usaré la voz del dispositivo.' });
      }
      const audio = Buffer.from(await speechResponse.arrayBuffer());
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.send(audio);
    } catch (error) {
      console.warn('[VOICE] Azure speech error:', error.message);
      return res.status(502).json({ error: 'La voz neural no está disponible temporalmente.' });
    }
  });

  const frontendPath = path.join(
    __dirname,
    '..',
    'frontend'
  );

  app.use(
    express.static(frontendPath, {
      index: false
    })
  );

  app.use('/api/nbo', requireApiAuth, (req, res, next) => {
    const customerId = req.body && req.body.cliente_id;
    const resolution = req.body && req.body.resolution;
    if (customerId !== req.auth.session.user.customerId) {
      return res.status(403).json({ error: 'Solo puedes solicitar una recomendación para tu propia cuenta.' });
    }
    if (resolution !== 'RESOLVED') {
      return res.status(409).json({ error: 'Las recomendaciones solo se habilitan tras resolver positivamente la consulta.' });
    }
    return next();
  }, nboRoutes);
  app.use('/api', webhookRoutes);

  // =========================================================
  // VISTAS
  // =========================================================

  app.get('/', (req, res) => {
    // Serve the chat-based index as the main entrypoint
    res.sendFile(
      path.join(
        frontendPath,
        'index.html'
      )
    );
  });

  app.get('/login', (req, res) => {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  });

  // =========================================================
  // AUTH (minimal prototype)
  // =========================================================
  app.post('/api/auth/register', (req, res) => {
    const body = req.body || {};
    console.log('[API] /api/auth/register body=', body);

    const userId   = (body.userId || '').toString().trim();
    const password = (body.password || '').toString();

    try {
      if (!userId)   return res.status(400).json({ error: 'ID de usuario requerido' });
      if (!password) return res.status(400).json({ error: 'Contraseña requerida' });

      const result = authService.registerUser({ userId, password });
      if (result && result.token) {
        setAuthCookie(res, result.token);
      }
      return res.status(201).json({ ok: true, token: result ? result.token : null, user: result.user });
    } catch (err) {
      if (err.code === 'user_exists')      return res.status(409).json({ error: err.message });
      if (err.code === 'invalid_user_id' || err.code === 'unknown_customer') return res.status(400).json({ error: err.message });
      if (err.code === 'password_too_short') return res.status(400).json({ error: err.message });
      return res.status(400).json({ error: err.message || 'Error al registrar' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const body     = req.body || {};
    const userId   = (body.userId || '').toString().trim();
    const password = (body.password || '').toString();
    try {
      const result = authService.loginUser({ userId, password });
      setAuthCookie(res, result.token);
      return res.json({ ok: true, token: result.token, user: result.user });
    } catch (err) {
      console.warn('[API] /api/auth/login failed, reason:', err.message);
      return res.status(401).json({ error: err.message || 'Credenciales inválidas' });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const auth  = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : getAuthToken(req);
    const session = authService.getSession(token);
    // This endpoint is used by the UI only to restore a prior session. Return
    // a neutral success response for a stale browser token so the normal
    // logged-out state does not generate a noisy 401 in the browser console.
    if (!session) return res.json({ ok: false, user: null });

    // Try to get real name from DB first, then fall back to session name
    const customerExp = session.customerId ? getCustomerExperience(session.customerId) : null;
    let name = session.name || session.userId;
    if (customerExp && customerExp.customer && customerExp.customer.name) {
      name = customerExp.customer.name;
    }

    return res.json({ ok: true, user: { userId: session.userId, customerId: session.customerId, name } });
  });

  app.post('/api/auth/logout', (req, res) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : getAuthToken(req);
    if (token) {
      authService.logout(token);
    }
    clearAuthCookie(res);
    return res.json({ ok: true, message: 'Sesión cerrada correctamente' });
  });

  app.get('/chat', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'index.html'
      )
    );
  });

  // Advisor removed — serve chat index instead
  app.get('/advisor', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
  // Keep /app compatible by serving index (chat UI)
  app.get('/app', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  // Dashboard removed — redirect to main chat UI
  app.get('/dashboard', (req, res) => {
    return res.redirect(302, '/');
  });


  // Authentication endpoints removed: local demo/login/logout and /api/app/me are disabled


  // =========================================================
  // HEALTH
  // =========================================================

  app.get('/health', (req, res) => {
    return res.json({
      ok: true
    });
  });


  // =========================================================
  // SESIONES
  // =========================================================

  app.delete(
    '/api/session/:sessionId',
    (req, res) => {
      const { sessionId } =
        req.params;
      const snapshot = getSessionSnapshot(sessionId);
      const auth = getRequestAuth(req);

      if (
        snapshot.context.ownerUserId &&
        (!auth || snapshot.context.ownerUserId !== auth.session.user.userId)
      ) {
        return res.status(403).json({
          error: 'Esta conversación pertenece a otro usuario.'
        });
      }

      const interaction =
        getInteraction(sessionId);

      // Si la interacción todavía estaba activa,
      // "Nueva consulta" finaliza la conversación anterior.
      if (
        interaction &&
        interaction.status === 'ACTIVE'
      ) {
        endInteraction(
          sessionId,
          'NEW_CHAT'
        );
      }

      resetSession(sessionId);

      return res.json({
        ok: true,
        message:
          'Sesión eliminada correctamente'
      });
    }
  );


  // =========================================================
  // CHAT
  // =========================================================

  app.post(
    '/api/chat',
    async (req, res) => {
      const {
        message,
        sessionId
      } = req.body || {};

      if (
        !message ||
        typeof message !== 'string' ||
        !message.trim()
      ) {
        return res.status(400).json({
          error:
            'El mensaje no puede estar vacío'
        });
      }

      const activeSessionId =
        sessionId ||
        `s_${randomUUID()}`;

      try {
        const chatSession = getOrCreateSession(activeSessionId);
        const auth = getRequestAuth(req);
        const authenticatedUser = auth && auth.session.user;
        if (chatSession.context.ownerUserId && (!authenticatedUser || chatSession.context.ownerUserId !== authenticatedUser.userId)) {
          return res.status(403).json({ error: 'Esta conversación pertenece a otro usuario.' });
        }
        // Guest sessions can ask general questions. Only an authenticated
        // identity may attach personal customer data to the conversation.
        if (authenticatedUser) {
          updateContext(activeSessionId, {
            ownerUserId: authenticatedUser.userId,
            customerIdentifier: authenticatedUser.customerId
          });
        }
        console.log(
          '[API] /api/chat message=',
          message,
          'sessionId=',
          activeSessionId
        );

        const cleanMessage =
          message.trim();

        const existingInteraction =
            getInteraction(
              activeSessionId
            );

          if (
            existingInteraction &&
            existingInteraction.status === 'ENDED' &&
            existingInteraction.endReason === 'HANDOFF'
          ) {
            return res.json({
              reply:
                `Tu consulta ya fue derivada al asesor en el caso ${existingInteraction.handoffCaseId}. ` +
                'Si deseas iniciar una consulta diferente, selecciona "Nueva consulta".',

              sessionId:
                activeSessionId,

              handoff: {
                caseId:
                  existingInteraction.handoffCaseId,

                status:
                  'PENDING',

                alreadyTransferred:
                  true
              }
            });
          }

        // Persona 3:
        // registramos cada mensaje real del usuario.
        registerMessage(
          activeSessionId,
          'user'
        );


        // Asociamos la interacción de métricas con el cliente
        // autenticado/conocido. Esto permite medir contactos
        // repetidos sin confiar en parámetros enviados por URL.
        const metricsSession =
          getOrCreateSession(
            activeSessionId
          );

        const metricsCustomerId =
          metricsSession.context
            .customerIdentifier ||
          null;

        if (metricsCustomerId) {
          const metricsExperience =
            getCustomerExperience(
              metricsCustomerId
            );

          registerInteractionContext(
            activeSessionId,
            {
              customerIdentifier:
                metricsCustomerId,

              customerName:
                metricsExperience &&
                metricsExperience.customer
                  ? metricsExperience.customer.name
                  : null
            }
          );
        }


        // =====================================================
        // HANDOFF A ASESOR
        // Persona 2
        // =====================================================

        if (
          esSolicitudAsesor(
            cleanMessage
          )
        ) {
          const session =
            getOrCreateSession(
              activeSessionId
            );

          // Conservamos la primera consulta útil del cliente
          // como motivo original. Así evitamos mostrar como
          // "consulta original" la última pregunta de seguimiento.
          const originalQuery =
            obtenerConsultaOriginal(
              session.history,
              cleanMessage
            );

          const conversation =
            session.history.map(
              ({
                role,
                content
              }) => ({
                role,
                content
              })
            );

          // El mensaje actual todavía no se
          // encuentra en SessionService.
          conversation.push({
            role: 'user',
            content: cleanMessage
          });

          const customerIdentifier =
            session.context
              .customerIdentifier;

          const customerExperience =
            customerIdentifier
              ? getCustomerExperience(
                  customerIdentifier
                )
              : null;

          const caso =
            crearCaso({
              sessionId:
                activeSessionId,

              customerIdentifier,

              originalQuery,

              handoffMessage:
                cleanMessage,

              conversation,

              reason:
                determinarMotivoDerivacion(
                  cleanMessage
                ),

              // Transferimos un snapshot de los datos que el bot
              // ya utilizó. El asesor recibe contexto útil sin tener
              // que reconstruirlo leyendo todo el transcript.
              customerContext:
                customerExperience
                  ? customerExperience.customer
                  : null,

              billingContext:
                customerExperience
                  ? {
                      previousBill:
                        customerExperience.previousBill,
                      currentBill:
                        customerExperience.currentBill,
                      comparison:
                        customerExperience.comparison
                    }
                  : null
            });


          // Persona 3:
          // registramos que la interacción
          // terminó siendo derivada.
          registerHandoff(
            activeSessionId,
            caso.caseId,
            caso.reason
          );


          const reply =
            `Listo. Generé el caso ${caso.caseId}. ` +
            'Un asesor podrá revisar el contexto de esta conversación para que no tengas que explicar todo nuevamente.';


          // Persona 1:
          // historial conversacional.
          addMessage(
            activeSessionId,
            'user',
            cleanMessage
          );

          addMessage(
            activeSessionId,
            'assistant',
            reply
          );


          // Persona 3:
          // métrica de respuesta.
          registerMessage(
            activeSessionId,
            'assistant'
          );


          // El handoff finaliza esta
          // interacción de atención automática.
          endInteraction(
            activeSessionId,
            'HANDOFF'
          );


          return res.json({
            reply,

            foundData:
              Boolean(
                session.context
                  .customerIdentifier
              ),

            sessionId:
              activeSessionId,

            handoff: {
              caseId:
                caso.caseId,

              status:
                caso.status,

              reason:
                caso.reason
            }
          });
        }


        // =====================================================
            // If the user mentions sensitive terms and no customer is associated,
            // prompt to login first. procesarConsultaFactura also performs a
            // server-side check, but deny early to avoid unnecessary processing.
            const session = getOrCreateSession(activeSessionId);
            const isSensitive = /\b(deuda|debo pagar|cuánto debo|cuanto debo|tengo deuda|mi recibo|recibo)\b/i.test(cleanMessage);
            const hasCustomer = Boolean(session.context && session.context.customerIdentifier);

            if (isSensitive && !hasCustomer) {
              return res.json({
                reply: 'Para ver información personal sobre tu recibo o deuda debes iniciar sesión. Pulsa "Iniciar sesión" y vuelve a intentarlo.',
                foundData: false,
                sessionId: activeSessionId
              });
            }

        // CONSULTA NORMAL AL RAG
        // =====================================================

        const result =
          await procesarConsultaFactura(
            cleanMessage,
            activeSessionId
          );


        // Compatibilidad con respuestas
        // antiguas tipo string.
        if (
          typeof result === 'string'
        ) {
          registerMessage(
            activeSessionId,
            'assistant'
          );

          return res.json({
            reply: result,
            foundData: false,
            sessionId:
              activeSessionId
          });
        }


        // Si tenemos una respuesta normal,
        // registramos el mensaje del asistente.
        if (
          result &&
          typeof result.reply ===
            'string'
        ) {
          registerMessage(
            activeSessionId,
            'assistant'
          );
        }


        return res.json({
          ...result,
          sessionId:
            activeSessionId
        });

      } catch (error) {
        console.error(
          'Error en servidor:',
          error
        );

        // Aunque haya fallado el procesamiento,
        // el sistema sí está enviando una respuesta
        // al cliente, así que la contamos.
        try {
          registerMessage(
            activeSessionId,
            'assistant'
          );
        } catch (
          metricsError
        ) {
          console.error(
            'Error registrando métrica:',
            metricsError
          );
        }

        return res
          .json({
            reply:
              'Lo siento, tuve un problema al procesar tu consulta. Intenta de nuevo.',

            sessionId:
              activeSessionId
          });
      }
    }
  );


  // =========================================================
  // ASESOR
  // Persona 2
  // =========================================================

  app.get(
    '/api/advisor/cases',
    requireAdvisorAuth,
    (req, res) => {
      return res.json({
        cases:
          listarCasos()
      });
    }
  );


  app.get(
    '/api/advisor/cases/:caseId',
    requireAdvisorAuth,
    (req, res) => {
      const caso =
        obtenerCaso(
          req.params.caseId
        );

      if (!caso) {
        return res
          .status(404)
          .json({
            error:
              'Caso no encontrado'
          });
      }

      return res.json(caso);
    }
  );


  app.patch(
    '/api/advisor/cases/:caseId',
    requireAdvisorAuth,
    (req, res) => {
      const {
        status
      } = req.body || {};

      if (
        ![
          'PENDING',
          'ATTENDED'
        ].includes(status)
      ) {
        return res
          .status(400)
          .json({
            error:
              'Estado inválido'
          });
      }

      const caso =
        actualizarEstadoCaso(
          req.params.caseId,
          status
        );

      if (!caso) {
        return res
          .status(404)
          .json({
            error:
              'Caso no encontrado'
          });
      }

      return res.json(caso);
    }
  );


  // =========================================================
  // SATISFACCIÓN
  // HU05
  // =========================================================

  app.post(
    '/api/metrics/:sessionId/satisfaction',
    (req, res) => {
      const {
        rating,
        comment
      } = req.body || {};

      try {
        const interaction =
          registerSatisfaction(
            req.params.sessionId,
            rating,
            comment
          );

        return res.json({
          ok: true,

          satisfaction:
            interaction
              .satisfaction
        });

      } catch (error) {
        return res
          .status(400)
          .json({
            error:
              error.message
          });
      }
    }
  );


  // =========================================================
  // FINALIZAR INTERACCIÓN
  // HU06
  // =========================================================

  app.post(
    '/api/metrics/:sessionId/end',
    (req, res) => {
      const interaction =
        getInteraction(
          req.params.sessionId
        );

      if (!interaction) {
        return res
          .status(404)
          .json({
            error:
              'Interacción no encontrada'
          });
      }

      const ended =
        endInteraction(
          req.params.sessionId,
          'USER_ENDED'
        );

      return res.json({
        ok: true,
        interaction: ended
      });
    }
  );


  // =========================================================
  // DASHBOARD
  // HU07
  // =========================================================

  app.get(
    '/api/metrics/dashboard',
    requireAdvisorAuth,
    (req, res) => {
      return res.json(
        getDashboardSummary()
      );
    }
  );


  app.get(
    '/api/metrics/interactions',
    requireAdvisorAuth,
    (req, res) => {
      return res.json({
        interactions:
          getInteractions()
      });
    }
  );

  // =========================================================
  // APP MI MOVISTAR SIMULADA
  // PERSONA 4
  // =========================================================

  app.get(
    '/api/app/customers',
    requireApiAuth,
    (req, res) => {
      return res.status(403).json({ error: 'No está permitido listar información de otros usuarios.' });
    }
  );


  app.get(
    '/api/app/customers/:customerId',
    requireApiAuth,
    (req, res) => {
      if (req.params.customerId !== req.auth.session.user.customerId) {
        return res.status(403).json({ error: 'Solo puedes consultar tu propia información.' });
      }
      const experience =
        getCustomerExperience(
          req.params.customerId
        );

      if (!experience) {
        return res
          .status(404)
          .json({
            error:
              'Cliente no encontrado'
          });
      }

      return res.json(
        experience
      );
    }
  );

  // Resumen privado para el panel lateral del cliente. El identificador se
  // obtiene exclusivamente de la sesión autenticada: el navegador no puede
  // solicitar el resumen de otra persona mediante parámetros.
  app.get('/api/billing/summary', requireApiAuth, (req, res) => {
    const customerId = req.auth.session.user.customerId;
    const overview = getBillingAnalysis(customerId);

    if (!overview.found || !overview.services.length) {
      return res.status(404).json({ error: 'No encontramos recibos asociados a tu usuario.' });
    }

    const categoryLabels = {
      RECONNECTION: 'un cargo por reconexión',
      PLAN: 'un cambio en tu plan',
      BONUS_PACKAGE: 'ajustes en tus bonos o paquetes',
      PRORRATION: 'un cobro proporcional del ciclo',
      OTHER: 'otros cambios facturados'
    };

    const services = overview.services.map((service) => {
      const analysis = getBillingAnalysis(customerId, service.subscriberId);
      const current = analysis.current;
      if (!current) return null;

      const groupedCauses = (analysis.variation.causes || []).reduce((groups, cause) => {
        const category = cause.category || 'OTHER';
        groups[category] = Number(((groups[category] || 0) + cause.delta).toFixed(2));
        return groups;
      }, {});
      const causes = Object.entries(groupedCauses)
        .map(([category, delta]) => ({ category, label: categoryLabels[category] || categoryLabels.OTHER, delta }))
        .filter((cause) => Math.abs(cause.delta) >= 0.01)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      const chargeGroups = current.charges.reduce((groups, charge) => {
        const key = charge.description || charge.code || 'Cargo';
        groups[key] = Number(((groups[key] || 0) + charge.amount).toFixed(2));
        return groups;
      }, {});

      return {
        serviceType: service.serviceType || 'Servicio',
        subscriberSuffix: String(service.subscriberId || '').slice(-4),
        invoiceId: current.invoiceId,
        cycle: current.cycle || '',
        dueDate: current.dueDate || '',
        status: current.status || '',
        total: Number(current.total.toFixed(2)),
        charges: Object.entries(chargeGroups)
          .map(([description, amount]) => ({ description, amount }))
          .filter((charge) => Math.abs(charge.amount) >= 0.01),
        previousTotal: analysis.previous ? Number(analysis.previous.total.toFixed(2)) : null,
        previousInvoiceId: analysis.previous ? analysis.previous.invoiceId : null,
        variation: analysis.variation.available ? Number(analysis.variation.difference.toFixed(2)) : null,
        mainCause: causes[0] || null,
        causes,
        changeDetails: (analysis.variation.causes || []).map((cause) => ({
          description: cause.description,
          delta: cause.delta,
          evidence: cause.evidence
        })),
        history: analysis.invoices.slice(0, 5).map((invoice) => ({
          invoiceId: invoice.invoiceId,
          cycle: invoice.cycle || '',
          dueDate: invoice.dueDate || '',
          total: Number(invoice.total.toFixed(2)),
          status: invoice.status || ''
        })),
        exactPendingBalanceAvailable: false
      };
    }).filter(Boolean);

    if (!services.length) {
      return res.status(404).json({ error: 'No encontramos facturas para tus servicios.' });
    }

    return res.json({ ok: true, services });
  });

  // =========================================================
  // DICCIONARIO DE DATOS (endpoint de ejemplo)
  // =========================================================
  app.get('/api/dictionary/cliente/:dni', requireApiAuth, async (req, res) => {
    try {
      const dni = req.params.dni;
      if (dni !== req.auth.session.user.customerId) {
        return res.status(403).json({ error: 'Solo puedes consultar tu propia información.' });
      }
      const ficha = await getFichaCliente(dni);

      if (!ficha || !ficha.cliente) {
        return res.status(404).json({ error: 'Cliente no encontrado en el diccionario' });
      }

      return res.json(ficha);
    } catch (error) {
      console.error('Error al consultar diccionario:', error);
      return res.status(500).json({ error: error.message });
    }
  });


  // En producción esto vendría de la
  // autenticación real del usuario.
  // Para el hackathon simulamos ese contexto.
  app.post(
    '/api/session/:sessionId/customer',
    requireApiAuth,
    (req, res) => {
      const auth =
        getRequestAuth(req);

      const requestedCustomerId =
        req.body &&
        req.body.customerId;

      const customerId = auth.session.user.customerId;

      // Si existe una sesión autenticada,
      // la identidad de la cookie manda sobre
      // cualquier customerId enviado por el cliente.
      if (
        requestedCustomerId &&
        requestedCustomerId !==
          customerId
      ) {
        return res
          .status(403)
          .json({
            error:
              'El cliente no coincide con la sesión autenticada'
          });
      }

      if (
        !customerId ||
        !customerExists(customerId)
      ) {
        return res
          .status(400)
          .json({
            error:
              'Cliente inválido'
          });
      }

      updateContext(
        req.params.sessionId,
        {
          customerIdentifier:
            customerId
        }
      );

      return res.json({
        ok: true,

        sessionId:
          req.params.sessionId,

        customerId
      });
    }
  );


  return app;
}


const app = createApp();


if (require.main === module) {
  const PORT =
    process.env.PORT ||
    3000;

  dbReady
    .then(async () => {
      // Inicializar diccionario de datos (si existe)
      try {
        const { initDiccionario } = require('./services/dbService');
        await initDiccionario();
      } catch (err) {
        // ya se imprime dentro de initDiccionario
      }

      const startServer = (port) => {
        const server = app.listen(port, () => {
          console.log(
            `🚀 Servidor ejecutándose en http://localhost:${port}`
          );
        });

        server.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            console.warn(`⚠️ Puerto ${port} ocupado, intentando ${port + 1}...`);
            server.close(() => startServer(port + 1));
            return;
          }

          console.error('Error al iniciar el servidor:', error);
          process.exit(1);
        });
      };

      startServer(PORT);
    })
    .catch((error) => {
      console.error(
        'No se pudo inicializar la base de datos:',
        error
      );

      process.exit(1);
    });
}


module.exports = {
  app,
  createApp,
  prepareElevenLabsSpeech
};
