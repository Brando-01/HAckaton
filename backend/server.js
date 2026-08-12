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
  addMessage,
  updateContext
} = require('./services/sessionService');

const {
  getCustomerExperience,
  getAvailableCustomers,
  customerExists
} = require('./services/appExperienceService');

const { getFichaCliente } = require('./services/dbService');

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
    return { session: { user: { phone: session.phone, customerId: session.customerId } }, token };
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
  // Auth removed: allow all page requests (guest mode)
  return next();
}

function requireApiAuth(
  req,
  res,
  next
) {
  // API auth disabled: attach a guest auth object when available
  const auth = getRequestAuth(req);
  req.auth = auth || null;
  return next();
}


function createApp() {
  const app = express();

  app.use(cors());
  // Accept JSON and URL-encoded form bodies for robustness
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  app.use('/api/nbo', nboRoutes);
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
    // Login UI removed: redirect all login requests to the app
    return res.redirect(302, '/app');
  });

  // =========================================================
  // AUTH (minimal prototype)
  // =========================================================
  app.post('/api/auth/register', (req, res) => {
    const body = req.body || {};
    console.log('[API] /api/auth/register body=', body);

    const phone    = (body.phone || body.phoneNumber || req.query.phone || '').toString().trim();
    const password = (body.password || body.pass || req.query.password || '').toString();
    const dni      = (body.dni || body.customerId || req.query.dni || '').toString().trim() || null;

    try {
      if (!phone)    return res.status(400).json({ error: 'Número de celular requerido' });
      if (!password) return res.status(400).json({ error: 'Contraseña requerida' });

      const user = authService.registerUser({ phone, password, dni });
      return res.status(201).json({ ok: true, user: { phone: user.phone, customerId: user.customerId } });
    } catch (err) {
      if (err.code === 'user_exists')      return res.status(409).json({ error: err.message });
      if (err.code === 'invalid_phone')    return res.status(400).json({ error: err.message });
      if (err.code === 'password_too_short') return res.status(400).json({ error: err.message });
      return res.status(400).json({ error: err.message || 'Error al registrar' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const body     = req.body || {};
    const phone    = (body.phone || body.phoneNumber || req.query.phone || '').toString().trim();
    const password = (body.password || body.pass || req.query.password || '').toString();
    try {
      const result = authService.loginUser({ phone, password });
      setAuthCookie(res, result.token);
      return res.json({ ok: true, token: result.token, user: result.user });
    } catch (err) {
      return res.status(401).json({ error: err.message || 'Credenciales inválidas' });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const auth  = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : getAuthToken(req);
    const session = authService.getSession(token);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });

    // Try to get real name from DB first, then fall back to session name
    const customerExp = session.customerId ? getCustomerExperience(session.customerId) : null;
    let name = session.name || 'Usuario Mi Movistar';
    if (customerExp && customerExp.customer && customerExp.customer.name) {
      name = customerExp.customer.name;
    }

    return res.json({ ok: true, user: { phone: session.phone, customerId: session.customerId, name } });
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
    (req, res) => {
      return res.json({
        cases:
          listarCasos()
      });
    }
  );


  app.get(
    '/api/advisor/cases/:caseId',
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
    (req, res) => {
      return res.json(
        getDashboardSummary()
      );
    }
  );


  app.get(
    '/api/metrics/interactions',
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
    (req, res) => {
      return res.json({
        customers:
          getAvailableCustomers()
      });
    }
  );


  app.get(
    '/api/app/customers/:customerId',
    (req, res) => {
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

  // =========================================================
  // DICCIONARIO DE DATOS (endpoint de ejemplo)
  // =========================================================
  app.get('/api/dictionary/cliente/:dni', requireApiAuth, async (req, res) => {
    try {
      const dni = req.params.dni;
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
    (req, res) => {
      const auth =
        getRequestAuth(req);

      const requestedCustomerId =
        req.body &&
        req.body.customerId;

      const customerId =
        auth
          ? auth.session.user
              .customerId
          : requestedCustomerId;

      // Si existe una sesión autenticada,
      // la identidad de la cookie manda sobre
      // cualquier customerId enviado por el cliente.
      if (
        auth &&
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
  createApp
};