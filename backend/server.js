const express = require('express');
const cors = require('cors');
const path = require('path');
const { randomUUID } = require('crypto');

require('dotenv').config();

const {
  procesarConsultaFactura
} = require('./services/ragService');

const { dbReady } = require('./db');

const {
  SESSION_TTL_MS,
  authenticateUser,
  authenticateDemoCustomer,
  createAuthSession,
  getAuthSession,
  destroyAuthSession,
  getDemoProfiles
} = require('./services/authService');

const {
  resetSession,
  getOrCreateSession,
  addMessage,
  updateContext
} = require('./services/sessionService');

const {
  getCustomerExperience,
  getAvailableCustomers
} = require('./services/appExperienceService');

const {
  createOfficialDemoExperienceService
} = require('./services/officialDemoExperienceService');

const {
  getDemoMappingStatus
} = require('./services/demoProfileBindingService');

const {
  createRelease1ReadinessService
} = require('./services/release1ReadinessService');

const {
  createDesafio1FunctionalCoverageService
} = require('./services/desafio1FunctionalCoverageService');

const {
  createDesafio1ScenarioMappingService
} = require('./services/desafio1ScenarioMappingService');

const {
  createDatasetExplorerService,
  isDatasetExplorerError
} = require('./services/datasetExplorerService');

const {
  createDatasetCustomerProfileService
} = require('./services/desafio1CustomerProfileService');

const {
  buildCustomerProfileMultiReply
} = require('./services/desafio1CustomerProfileLogic');

const {
  requiresPersonalBillingAccess,
  buildGeneralBillingEducationReply,
  buildPersonalBillingReply,
  needsBillingHistoryForIntents
} = require('./services/desafio1ConversationLogic');

const {
  planCustomerConversationTurn,
  buildCompositeCustomerReply
} = require('./services/desafio1ConversationalOrchestrator');

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
  const token =
    getAuthToken(req);

  const session =
    getAuthSession(token);

  return session
    ? {
        token,
        session
      }
    : null;
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
  if (!getRequestAuth(req)) {
    return res.redirect(
      302,
      '/login'
    );
  }

  return next();
}

function requireApiAuth(
  req,
  res,
  next
) {
  const auth =
    getRequestAuth(req);

  if (!auth) {
    return res
      .status(401)
      .json({
        error:
          'Debes iniciar sesión'
      });
  }

  req.auth = auth;
  return next();
}


function sanitizeReturnTo(value) {
  const candidate =
    String(value || '').trim();

  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//')
  ) {
    return null;
  }

  if (
    candidate === '/app' ||
    candidate.startsWith('/app?') ||
    candidate === '/chat' ||
    candidate.startsWith('/chat?')
  ) {
    return candidate;
  }

  return null;
}

function isDemoMappingError(error) {
  return [
    'DEMO_MAPPING_NOT_CONFIGURED',
    'DEMO_MAPPING_READ_ERROR',
    'DEMO_MAPPING_INVALID',
    'DEMO_MAPPING_SCHEMA_INVALID',
    'DEMO_MAPPING_PROFILES_REQUIRED',
    'DEMO_MAPPING_PROFILE_MISSING',
    'DEMO_PROFILE_NOT_BOUND'
  ].includes(error?.code);
}

function createApp(options = {}) {
  const app = express();

  const officialDemoExperienceService =
    options.officialDemoExperienceService ||
    createOfficialDemoExperienceService();

  const release1ReadinessService =
    options.release1ReadinessService ||
    createRelease1ReadinessService({
      officialDemoExperienceService
    });

  const functionalCoverageService =
    options.functionalCoverageService ||
    createDesafio1FunctionalCoverageService();

  const scenarioMappingService =
    options.scenarioMappingService ||
    createDesafio1ScenarioMappingService();

  const datasetExplorerService =
    options.datasetExplorerService ||
    createDatasetExplorerService();

  const customerProfileService =
    options.customerProfileService ||
    createDatasetCustomerProfileService({
      resolveSubscriberKey:
        async (user) => {
          if (
            user?.mode === 'EXPLORER' &&
            user?.explorerDemoId
          ) {
            const explorerProfile =
              await datasetExplorerService
                .getPrivateProfile(
                  user.explorerDemoId
                );

            return (
              explorerProfile
                ?.subscriberKey ||
              null
            );
          }

          const binding =
            officialDemoExperienceService
              .getBinding(
                user?.customerId
              );

          return (
            binding?.subscriberKey ||
            null
          );
        }
    });

  async function getPersonalExperience(
    user,
    options = {}
  ) {
    if (user?.mode === 'EXPLORER') {
      return datasetExplorerService
        .getExperienceForUser(
          user,
          options
        );
    }

    return officialDemoExperienceService
      .getExperienceForUser(
        user,
        options
      );
  }

  async function getAppExperience(user) {
    if (user?.mode === 'EXPLORER') {
      return getPersonalExperience(
        user,
        { includeHistory: true }
      );
    }

    try {
      return await getPersonalExperience(
        user,
        { includeHistory: true }
      );
    } catch (error) {
      if (!isDemoMappingError(error)) {
        throw error;
      }

      const legacy =
        getCustomerExperience(
          user?.customerId
        );

      if (!legacy) {
        throw error;
      }

      return {
        ...legacy,
        dataSource:
          'SYNTHETIC_FALLBACK',
        integrationStatus: {
          officialDataConfigured:
            false,
          code:
            error.code
        }
      };
    }
  }


  function sendExplorerError(
    res,
    error
  ) {
    const code =
      error?.code ||
      'EXPLORER_ERROR';

    if (
      code ===
        'EXPLORER_INDEX_NOT_FOUND'
    ) {
      return res
        .status(503)
        .json({
          error:
            'El índice local del explorador todavía no está disponible.',
          code,
          action:
            'npm run demo:coverage:desafio1'
        });
    }

    if (
      code ===
        'EXPLORER_PROFILE_NOT_FOUND'
    ) {
      return res
        .status(404)
        .json({
          error:
            'Perfil DEMO no encontrado',
          code
        });
    }

    if (isDatasetExplorerError(error)) {
      return res
        .status(400)
        .json({
          error:
            error.message ||
            'No se pudo abrir el perfil del explorador',
          code
        });
    }

    console.error(
      '[EXPLORER] Error inesperado:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          'No se pudo procesar la solicitud del explorador.',
        code:
          'EXPLORER_INTERNAL_ERROR'
      });
  }

  app.use(cors());
  app.use(express.json());

  // Las respuestas API del prototipo pueden depender de una
  // cookie de sesión, métricas en memoria o del perfil demo
  // seleccionado. Evitamos que el navegador reutilice una
  // respuesta 401/200 antigua después de cambiar de cuenta.
  app.use(
    '/api',
    (req, res, next) => {
      res.setHeader(
        'Cache-Control',
        'no-store, private, max-age=0'
      );
      res.setHeader(
        'Pragma',
        'no-cache'
      );
      res.setHeader(
        'Expires',
        '0'
      );
      next();
    }
  );

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

  // =========================================================
  // VISTAS
  // =========================================================

  app.get('/', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'demo.html'
      )
    );
  });

  app.get('/login', (req, res) => {
    if (getRequestAuth(req)) {
      return res.redirect(
        302,
        sanitizeReturnTo(
          req.query.returnTo
        ) || '/app'
      );
    }

    return res.sendFile(
      path.join(
        frontendPath,
        'login.html'
      )
    );
  });

  app.get('/chat', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'index.html'
      )
    );
  });


  app.get('/advisor', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'advisor.html'
      )
    );
  });

  app.get(
    '/app',
    requirePageAuth,
    (req, res) => {
      res.sendFile(
        path.join(
          frontendPath,
          'app.html'
        )
      );
    }
  );

  app.get('/dashboard', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'dashboard.html'
      )
    );
  });


  app.get('/explorer', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'explorer.html'
      )
    );
  });


  // =========================================================
  // AUTENTICACIÓN LOCAL DE DEMO
  // =========================================================

  app.get(
    '/api/auth/demo-profiles',
    (req, res) => {
      const mappingStatus =
        getDemoMappingStatus();

      const demoProfiles =
        getDemoProfiles();

      return res.json({
        profiles:
          demoProfiles.map(
            (profile) => {
              const mapped =
                mappingStatus.profiles
                  ?.find(
                    (item) =>
                      item.customerId ===
                      profile.customerId
                  );

              return {
                ...profile,
                officialDataReady:
                  Boolean(mapped),
                demoScenario:
                  mapped?.scenario ||
                  null,
                demoScenarioLabel:
                  mapped?.scenarioLabel ||
                  null
              };
            }
          ),
        officialDataConfigured:
          mappingStatus.configured,
        configuredProfileCount:
          mappingStatus.profileCount || 0,
        availableProfileCount:
          demoProfiles.length
      });
    }
  );

  app.post(
    '/api/auth/login',
    (req, res) => {
      const {
        email,
        password
      } = req.body || {};

      const user =
        authenticateUser(
          email,
          password
        );

      if (!user) {
        return res
          .status(401)
          .json({
            error:
              'Correo o contraseña incorrectos'
          });
      }

      const authSession =
        createAuthSession(user);

      setAuthCookie(
        res,
        authSession.token
      );

      return res.json({
        ok: true,
        user:
          authSession.user
      });
    }
  );

  app.post(
    '/api/auth/demo-login',
    (req, res) => {
      const {
        customerId
      } = req.body || {};

      const user =
        authenticateDemoCustomer(
          customerId
        );

      if (!user) {
        return res
          .status(400)
          .json({
            error:
              'Perfil demo inválido'
          });
      }

      const authSession =
        createAuthSession(user);

      setAuthCookie(
        res,
        authSession.token
      );

      return res.json({
        ok: true,
        user:
          authSession.user
      });
    }
  );

  app.get(
    '/api/auth/me',
    requireApiAuth,
    (req, res) => {
      return res.json({
        authenticated: true,
        user:
          req.auth.session.user
      });
    }
  );

  app.post(
    '/api/auth/logout',
    (req, res) => {
      const token =
        getAuthToken(req);

      destroyAuthSession(token);
      clearAuthCookie(res);

      return res.json({
        ok: true
      });
    }
  );

  app.get(
    '/api/app/me',
    requireApiAuth,
    async (req, res) => {
      try {
        const experience =
          await getAppExperience(
            req.auth.session.user
          );

        return res.json(
          experience
        );
      } catch (error) {
        console.error(
          '[APP] No se pudo cargar el caso demo oficial:',
          error
        );

        return res
          .status(503)
          .json({
            error:
              'No se pudo cargar la información de facturación del perfil demo',
            code:
              error?.code ||
              'OFFICIAL_DEMO_EXPERIENCE_ERROR'
          });
      }
    }
  );

  app.get(
    '/api/demo/config/status',
    (req, res) => {
      return res.json(
        getDemoMappingStatus()
      );
    }
  );

  app.get(
    '/api/demo/release/readiness',
    async (req, res) => {
      try {
        const report =
          await release1ReadinessService
            .buildReport();

        return res.json(report);
      } catch (error) {
        console.error(
          '[RELEASE] No se pudo ejecutar el preflight:',
          error
        );

        return res
          .status(500)
          .json({
            schemaVersion:
              'desafio1-release1-readiness-v1',
            release: 'R1',
            ready: false,
            status:
              'PREFLIGHT_ERROR',
            error:
              'No se pudo verificar la preparación del Release 1.'
          });
      }
    }
  );

  app.get(
    '/api/demo/data-coverage',
    async (req, res) => {
      try {
        const report =
          await functionalCoverageService
            .buildReport();

        return res.json(report);
      } catch (error) {
        console.error(
          '[DATA COVERAGE] No se pudo generar la cobertura funcional:',
          error
        );

        return res
          .status(503)
          .json({
            schemaVersion:
              'desafio1-functional-coverage-v1',
            phase: 'PHASE_11',
            status:
              'COVERAGE_UNAVAILABLE',
            error:
              'No se pudo consultar la cobertura funcional del dataset.'
          });
      }
    }
  );

  app.get(
    '/api/demo/scenario-mapping',
    async (req, res) => {
      try {
        const report =
          await scenarioMappingService
            .buildReport();

        return res.json(report);
      } catch (error) {
        console.error(
          '[SCENARIO MAPPING] No se pudo generar el mapeo:',
          error
        );

        return res
          .status(503)
          .json({
            schemaVersion:
              'desafio1-scenario-mapping-v1',
            phase: 'PHASE_12',
            status:
              'MAPPING_UNAVAILABLE',
            error:
              'No se pudo consultar el mapeo de escenarios del dataset.'
          });
      }
    }
  );


  // =========================================================
  // EXPLORADOR MASIVO DEL DATASET · FASE 10
  // =========================================================

  app.get(
    '/api/explorer/summary',
    async (req, res) => {
      try {
        return res.json(
          await datasetExplorerService
            .getSummary()
        );
      } catch (error) {
        return sendExplorerError(
          res,
          error
        );
      }
    }
  );

  app.get(
    '/api/explorer/profiles',
    async (req, res) => {
      try {
        const result =
          await datasetExplorerService
            .searchProfiles({
              search:
                req.query.search,
              capability:
                req.query.capability,
              scenario:
                req.query.scenario,
              rentType:
                req.query.rentType,
              qualityTier:
                req.query.qualityTier,
              sort:
                req.query.sort,
              page:
                req.query.page,
              pageSize:
                req.query.pageSize
            });

        return res.json(result);
      } catch (error) {
        return sendExplorerError(
          res,
          error
        );
      }
    }
  );

  app.get(
    '/api/explorer/profiles/:demoId',
    async (req, res) => {
      try {
        return res.json(
          await datasetExplorerService
            .getSafeProfile(
              req.params.demoId
            )
        );
      } catch (error) {
        return sendExplorerError(
          res,
          error
        );
      }
    }
  );

  app.post(
    '/api/explorer/open',
    async (req, res) => {
      try {
        const user =
          await datasetExplorerService
            .createAuthUserForDemoId(
              req.body?.demoId
            );

        // El explorador crea una sesión temporal, no una cuenta.
        // Reemplazamos cualquier cookie demo anterior para que el
        // chat rote su contexto al nuevo alias DEMO seleccionado.
        destroyAuthSession(
          getAuthToken(req)
        );

        const authSession =
          createAuthSession(user);

        setAuthCookie(
          res,
          authSession.token
        );

        return res.json({
          ok: true,
          user:
            authSession.user,
          redirect:
            '/app?source=explorer'
        });
      } catch (error) {
        return sendExplorerError(
          res,
          error
        );
      }
    }
  );


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

      let activeSessionId =
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

        const requestAuth =
          getRequestAuth(req);

        // La cookie autenticada es la autoridad de identidad.
        // Si este sessionId conservaba contexto de otro cliente
        // o de una autenticación que ya expiró, rotamos a una
        // conversación nueva antes de procesar el mensaje. Así
        // evitamos mezclar transcript, métricas o handoff entre
        // identidades distintas.
        const requestedSession =
          getOrCreateSession(
            activeSessionId
          );

        const previousCustomerId =
          requestedSession.context
            .customerIdentifier ||
          null;

        const authenticatedCustomerId =
          requestAuth
            ?.session
            ?.user
            ?.customerId ||
          null;

        if (
          previousCustomerId &&
          previousCustomerId !==
            authenticatedCustomerId
        ) {
          activeSessionId =
            `s_${randomUUID()}`;
        }

        if (requestAuth) {
          updateContext(
            activeSessionId,
            {
              customerIdentifier:
                authenticatedCustomerId,
              identityLocked: true
            }
          );
        }

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
                requestAuth
                  ?.session
                  ?.user
                  ?.name ||
                (
                  metricsExperience &&
                  metricsExperience.customer
                    ? metricsExperience.customer.name
                    : null
                )
            }
          );
        }


        // =====================================================
        // CALIDAD CONVERSACIONAL · FASE 10
        // Multi-intent, reparación y cambios de tema.
        // =====================================================

        const conversationPlan =
          planCustomerConversationTurn(
            cleanMessage,
            {
              lastProfileIntents:
                metricsSession.context
                  .lastCustomerProfileIntents ||
                [],
              lastBillingIntent:
                metricsSession.context
                  .lastBillingIntent ||
                null,
              lastConversationDomain:
                metricsSession.context
                  .lastConversationDomain ||
                null,
              hasPersonalBillingContext:
                Boolean(
                  metricsSession.context
                    .hasOfficialBillingContext
                )
            }
          );

        const wantsHandoff =
          esSolicitudAsesor(
            cleanMessage
          );

        // Si el usuario mezcla varias preguntas en un solo
        // turno, resolvemos todas con una sola carga del perfil
        // y de la facturación. No hacemos varias llamadas al LLM.
        if (
          conversationPlan.isComposite &&
          !wantsHandoff
        ) {
          if (!requestAuth) {
            const reply =
              'Puedo responder esas preguntas con los datos de tu perfil y recibo, pero primero debes iniciar sesión para vincular la consulta con tu servicio.';

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
            registerMessage(
              activeSessionId,
              'assistant'
            );

            return res.json({
              reply,
              intents: [
                ...conversationPlan
                  .profileIntents,
                ...conversationPlan
                  .billingIntents
              ],
              foundData: false,
              sessionId:
                activeSessionId,
              requiresAuth: true,
              authUrl:
                '/login?returnTo=' +
                encodeURIComponent(
                  '/chat?resume=1'
                ),
              requestedCapability:
                'CUSTOMER_CONTEXT'
            });
          }

          try {
            const profilePromise =
              conversationPlan.needsProfile
                ? customerProfileService
                    .getProfileForUser(
                      requestAuth.session.user
                    )
                : Promise.resolve(null);

            const experiencePromise =
              getPersonalExperience(
                requestAuth.session.user,
                {
                  includeHistory:
                    needsBillingHistoryForIntents(
                      conversationPlan
                        .billingIntents
                    )
                }
              );

            const [
              datasetProfile,
              personalExperience
            ] = await Promise.all([
              profilePromise,
              experiencePromise
            ]);

            const reply =
              buildCompositeCustomerReply({
                plan: conversationPlan,
                profile:
                  datasetProfile,
                experience:
                  personalExperience
              });

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
            registerMessage(
              activeSessionId,
              'assistant'
            );

            updateContext(
              activeSessionId,
              {
                customerIdentifier:
                  requestAuth.session.user
                    .customerId,
                identityLocked: true,
                hasOfficialBillingContext:
                  conversationPlan
                    .needsBilling ||
                  Boolean(
                    metricsSession.context
                      .hasOfficialBillingContext
                  ),
                lastCustomerProfileIntents:
                  conversationPlan
                    .needsProfile
                    ? conversationPlan
                        .profileIntents
                    : [],
                lastBillingIntent:
                  conversationPlan
                    .needsBilling
                    ? (
                        conversationPlan
                          .billingIntents
                          .slice(-1)[0] ||
                        null
                      )
                    : null,
                lastConversationDomain:
                  conversationPlan
                    .domain
              }
            );

            registerInteractionContext(
              activeSessionId,
              {
                customerIdentifier:
                  requestAuth.session.user
                    .customerId,
                customerName:
                  requestAuth.session.user
                    .name
              }
            );

            return res.json({
              reply,
              intent:
                conversationPlan
                  .profileIntents[0] ||
                conversationPlan
                  .billingIntents[0] ||
                null,
              intents: [
                ...conversationPlan
                  .profileIntents,
                ...conversationPlan
                  .billingIntents
              ],
              source:
                'DESAFIO1_CONTEXT_DETERMINISTIC',
              financialReasoningByLlm:
                false,
              foundData: true,
              authenticated: true,
              sessionId:
                activeSessionId,
              conversation: {
                multiIntent: true,
                intentCount:
                  conversationPlan
                    .intentCount,
                repair:
                  conversationPlan.repair,
                domain:
                  conversationPlan.domain
              }
            });
          } catch (error) {
            console.error(
              '[CONVERSATION] No se pudo resolver el turno compuesto:',
              error
            );

            return res
              .status(503)
              .json({
                error:
                  'No se pudo consultar el contexto del cliente',
                code:
                  error?.code ||
                  'CUSTOMER_CONTEXT_ERROR',
                sessionId:
                  activeSessionId
              });
          }
        }


        // =====================================================
        // PERFIL DEL CLIENTE DESDE EL DATASET · FASE 10
        // =====================================================

        const customerProfileIntents =
          conversationPlan
            .profileIntents;

        if (
          customerProfileIntents.length &&
          !wantsHandoff
        ) {
          if (!requestAuth) {
            const reply =
              'Puedo consultar los datos disponibles de tu perfil, pero primero debes iniciar sesión para vincular la consulta con un cliente.';

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
            registerMessage(
              activeSessionId,
              'assistant'
            );

            return res.json({
              reply,
              intent:
                customerProfileIntents[0],
              intents:
                customerProfileIntents,
              foundData: false,
              sessionId:
                activeSessionId,
              requiresAuth: true,
              authUrl:
                '/login?returnTo=' +
                encodeURIComponent(
                  '/chat?resume=1'
                ),
              requestedCapability:
                'CUSTOMER_PROFILE'
            });
          }

          try {
            const [
              datasetProfile,
              personalExperience
            ] = await Promise.all([
              customerProfileService
                .getProfileForUser(
                  requestAuth.session.user
                ),
              getPersonalExperience(
                requestAuth.session.user
              )
            ]);

            const reply =
              buildCustomerProfileMultiReply({
                intents:
                  customerProfileIntents,
                profile:
                  datasetProfile,
                experience:
                  personalExperience,
                repair:
                  conversationPlan.repair
              });

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
            registerMessage(
              activeSessionId,
              'assistant'
            );

            updateContext(
              activeSessionId,
              {
                customerIdentifier:
                  requestAuth.session.user
                    .customerId,
                identityLocked: true,
                lastCustomerProfileIntents:
                  customerProfileIntents,
                lastConversationDomain:
                  'PROFILE'
              }
            );

            registerInteractionContext(
              activeSessionId,
              {
                customerIdentifier:
                  requestAuth.session.user
                    .customerId,
                customerName:
                  requestAuth.session.user
                    .name
              }
            );

            return res.json({
              reply,
              intent:
                customerProfileIntents[0],
              intents:
                customerProfileIntents,
              source:
                'DESAFIO1_PROFILE_DETERMINISTIC',
              foundData: true,
              authenticated: true,
              sessionId:
                activeSessionId,
              conversation: {
                multiIntent:
                  customerProfileIntents
                    .length > 1,
                repair:
                  conversationPlan.repair
              },
              dataOrigin: {
                profile:
                  'PLANTA CLIENTES.csv',
                billing:
                  'FACTURACION-CLIENTES_.csv',
                generatedByLlm: false
              }
            });
          } catch (error) {
            console.error(
              '[PROFILE] No se pudo consultar el perfil del dataset:',
              error
            );

            return res
              .status(503)
              .json({
                error:
                  'No se pudo consultar la información del perfil en el dataset',
                code:
                  error?.code ||
                  'CUSTOMER_PROFILE_ERROR',
                sessionId:
                  activeSessionId
              });
          }
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

          let customerExperience =
            null;

          if (requestAuth) {
            try {
              customerExperience =
                await getAppExperience(
                  requestAuth.session.user
                );
            } catch (error) {
              console.warn(
                '[HANDOFF] No se pudo cargar el contexto oficial; se conserva el transcript:',
                error?.message || error
              );
            }
          } else if (
            customerIdentifier
          ) {
            customerExperience =
              getCustomerExperience(
                customerIdentifier
              );
          }

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
                        customerExperience.comparison,
                      findings:
                        customerExperience.findings || []
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
        // FACTURACIÓN PERSONAL · FASE 5
        // =====================================================

        const billingSession =
          getOrCreateSession(
            activeSessionId
          );

        const needsPersonalBilling =
          requiresPersonalBillingAccess(
            cleanMessage,
            {
              hasPersonalBillingContext:
                Boolean(
                  billingSession.context
                    .hasOfficialBillingContext
                )
            }
          );

        if (needsPersonalBilling) {
          if (!requestAuth) {
            const reply =
              'Puedo revisar tu recibo y explicarte los montos, pero primero debes iniciar sesión en Mi Movistar para proteger tu información personal.';

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
            registerMessage(
              activeSessionId,
              'assistant'
            );

            return res.json({
              reply,
              foundData: false,
              sessionId:
                activeSessionId,
              requiresAuth: true,
              authUrl:
                '/login?returnTo=' +
                encodeURIComponent(
                  '/chat?resume=1'
                ),
              requestedCapability:
                'PERSONAL_BILLING'
            });
          }

          try {
            const officialExperience =
              await getPersonalExperience(
                requestAuth.session.user,
                {
                  includeHistory:
                    needsBillingHistoryForIntents(
                      conversationPlan
                        .billingIntents
                    )
                }
              );

            const personalReply =
              buildPersonalBillingReply(
                officialExperience,
                cleanMessage,
                {
                  hasPersonalBillingContext:
                    Boolean(
                      billingSession.context
                        .hasOfficialBillingContext
                    ),
                  lastBillingIntent:
                    billingSession.context
                      .lastBillingIntent ||
                    null
                }
              );

            updateContext(
              activeSessionId,
              {
                customerIdentifier:
                  requestAuth.session.user
                    .customerId,
                identityLocked: true,
                hasOfficialBillingContext:
                  true,
                lastBillingIntent:
                  personalReply.intent,
                lastConversationDomain:
                  'BILLING',
                demoScenario:
                  officialExperience.customer
                    .demoScenario
              }
            );

            registerInteractionContext(
              activeSessionId,
              {
                customerIdentifier:
                  requestAuth.session.user
                    .customerId,
                customerName:
                  requestAuth.session.user
                    .name
              }
            );

            addMessage(
              activeSessionId,
              'user',
              cleanMessage
            );
            addMessage(
              activeSessionId,
              'assistant',
              personalReply.reply
            );
            registerMessage(
              activeSessionId,
              'assistant'
            );

            return res.json({
              ...personalReply,
              foundData: true,
              sessionId:
                activeSessionId,
              authenticated: true,
              demoScenario:
                officialExperience.customer
                  .demoScenario
            });
          } catch (error) {
            if (isDemoMappingError(error)) {
              const reply =
                'La autenticación funciona, pero los casos demo oficiales todavía no están configurados en este equipo. Ejecuta npm run demo:configure:desafio1 en el backend y vuelve a intentarlo.';

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
              registerMessage(
                activeSessionId,
                'assistant'
              );

              return res.json({
                reply,
                foundData: false,
                sessionId:
                  activeSessionId,
                configurationRequired:
                  true,
                code:
                  error.code
              });
            }

            throw error;
          }
        }


        const generalEducationReply =
          buildGeneralBillingEducationReply(
            cleanMessage
          );

        if (generalEducationReply) {
          addMessage(
            activeSessionId,
            'user',
            cleanMessage
          );
          addMessage(
            activeSessionId,
            'assistant',
            generalEducationReply
          );
          registerMessage(
            activeSessionId,
            'assistant'
          );

          updateContext(
            activeSessionId,
            {
              lastConversationDomain:
                'GENERAL'
            }
          );

          return res.json({
            reply:
              generalEducationReply,
            foundData: false,
            sessionId:
              activeSessionId,
            source:
              'DESAFIO1_EDUCATION_DETERMINISTIC'
          });
        }


        // =====================================================
        // CONSULTA GENERAL AL RAG
        // =====================================================

        const result =
          await procesarConsultaFactura(
            cleanMessage,
            activeSessionId,
            {
              allowExplicitIdentifier:
                false,
              disablePersonalContext:
                true,
              identityLocked:
                Boolean(requestAuth)
            }
          );

        updateContext(
          activeSessionId,
          {
            lastConversationDomain:
              'GENERAL'
          }
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
          .status(500)
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


  // En producción la identidad vendría de Mi Movistar.
  // En la demo solo una cookie autenticada puede asociar
  // el perfil demo autenticado a una conversación. Ya no se acepta
  // customerId libre enviado por un cliente sin autenticar.
  app.post(
    '/api/session/:sessionId/customer',
    (req, res) => {
      const auth =
        getRequestAuth(req);

      if (!auth) {
        return res
          .status(401)
          .json({
            error:
              'Debes iniciar sesión para asociar información personal al chat'
          });
      }

      const requestedCustomerId =
        req.body &&
        req.body.customerId;

      const customerId =
        auth.session.user
          .customerId;

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

      const knownDemoProfile =
        getDemoProfiles()
          .some(
            (profile) =>
              profile.customerId ===
              customerId
          );

      const knownExplorerProfile =
        auth.session.user.mode ===
          'EXPLORER' &&
        Boolean(
          auth.session.user
            .explorerDemoId
        );

      if (
        !customerId ||
        (
          !knownDemoProfile &&
          !knownExplorerProfile
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'Cliente inválido'
          });
      }

      let targetSessionId =
        req.params.sessionId;

      const currentSession =
        getOrCreateSession(
          targetSessionId
        );

      const previousCustomerId =
        currentSession.context
          .customerIdentifier ||
        null;

      // Si el navegador cambia de perfil demo pero conserva el
      // chatSessionId, no reutilizamos el transcript del cliente
      // anterior. Entregamos un sessionId nuevo y el frontend lo
      // adopta antes de enviar la siguiente consulta.
      if (
        previousCustomerId &&
        previousCustomerId !==
          customerId
      ) {
        targetSessionId =
          `s_${randomUUID()}`;
      }

      updateContext(
        targetSessionId,
        {
          customerIdentifier:
            customerId,
          identityLocked: true,
          hasOfficialBillingContext:
            false,
          lastBillingIntent: null,
          demoScenario: null
        }
      );

      return res.json({
        ok: true,
        sessionId:
          targetSessionId,
        customerId,
        identitySessionRotated:
          targetSessionId !==
          req.params.sessionId
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
    .then(() => {
      app.listen(
        PORT,
        () => {
          console.log(
            `🚀 Servidor ejecutándose en http://localhost:${PORT}`
          );
        }
      );
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