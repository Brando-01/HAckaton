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

const {
  esSolicitudAsesor,
  determinarMotivoDerivacion,
  crearCaso,
  listarCasos,
  obtenerCaso,
  actualizarEstadoCaso
} = require('./services/handoffService');

const {
  registerMessage,
  registerHandoff,
  endInteraction,
  registerSatisfaction,
  getInteraction,
  getInteractions,
  getDashboardSummary
} = require('./services/metricsService');


function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const frontendPath = path.join(
    __dirname,
    '..',
    'frontend'
  );

  app.use(
    express.static(frontendPath)
  );


  // =========================================================
  // VISTAS
  // =========================================================

  app.get('/', (req, res) => {
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

  app.get('/app', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'app.html'
      )
    );
  });

  app.get('/dashboard', (req, res) => {
    res.sendFile(
      path.join(
        frontendPath,
        'dashboard.html'
      )
    );
  });


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

          // Tomamos la última consulta previa
          // del cliente para mostrarla al asesor.
          const ultimaConsultaPrevia =
            [...session.history]
              .reverse()
              .find(
                (mensaje) =>
                  mensaje.role ===
                  'user'
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

          const caso =
            crearCaso({
              sessionId:
                activeSessionId,

              customerIdentifier:
                session.context
                  .customerIdentifier,

              originalQuery:
                ultimaConsultaPrevia
                  ? ultimaConsultaPrevia
                      .content
                  : cleanMessage,

              conversation,

              reason:
                determinarMotivoDerivacion(
                  cleanMessage
                )
            });


          // Persona 3:
          // registramos que la interacción
          // terminó siendo derivada.
          registerHandoff(
            activeSessionId,
            caso.caseId
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


  // En producción esto vendría de la
  // autenticación real del usuario.
  // Para el hackathon simulamos ese contexto.
  app.post(
    '/api/session/:sessionId/customer',
    (req, res) => {
      const {
        customerId
      } = req.body || {};

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