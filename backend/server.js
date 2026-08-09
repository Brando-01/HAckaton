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
  addMessage
} = require('./services/sessionService');

const {
  esSolicitudAsesor,
  determinarMotivoDerivacion,
  crearCaso,
  listarCasos,
  obtenerCaso,
  actualizarEstadoCaso
} = require('./services/handoffService');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const frontendPath = path.join(
    __dirname,
    '..',
    'frontend'
  );

  app.use(express.static(frontendPath));

  app.get('/', (req, res) => {
    res.sendFile(
      path.join(frontendPath, 'index.html')
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

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.delete(
    '/api/session/:sessionId',
    (req, res) => {
      const { sessionId } = req.params;

      resetSession(sessionId);

      return res.json({
        ok: true,
        message: 'Sesión eliminada correctamente'
      });
    }
  );

  // Endpoint de Chat
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body || {};

  if (
    !message ||
    typeof message !== 'string' ||
    !message.trim()
  ) {
    return res.status(400).json({
      error: 'El mensaje no puede estar vacío'
    });
  }

  const activeSessionId =
    sessionId || `s_${randomUUID()}`;

  try {
    console.log(
      '[API] /api/chat message=',
      message,
      'sessionId=',
      activeSessionId
    );

    const cleanMessage =
      message.trim();

    if (esSolicitudAsesor(cleanMessage)) {
      const session =
        getOrCreateSession(
          activeSessionId
        );

      const ultimaConsultaPrevia =
        [...session.history]
          .reverse()
          .find(
            (mensaje) =>
              mensaje.role === 'user'
          );

      const conversation =
        session.history.map(
          ({ role, content }) => ({
            role,
            content
          })
        );

      conversation.push({
        role: 'user',
        content: cleanMessage
      });

      const caso = crearCaso({
        sessionId:
          activeSessionId,

        customerIdentifier:
          session.context
            .customerIdentifier,

        originalQuery:
          ultimaConsultaPrevia
            ? ultimaConsultaPrevia.content
            : cleanMessage,

        conversation,

        reason:
          determinarMotivoDerivacion(
            cleanMessage
          )
      });

      const reply =
        `Listo. Generé el caso ${caso.caseId}. ` +
        'Un asesor podrá revisar el contexto de esta conversación para que no tengas que explicar todo nuevamente.';

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

      return res.json({
        reply,
        foundData: Boolean(
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

    const result =
      await procesarConsultaFactura(
        cleanMessage,
        activeSessionId
      );

    if (typeof result === 'string') {
      return res.json({
        reply: result,
        foundData: false,
        sessionId: activeSessionId
      });
    }

    return res.json({
      ...result,
      sessionId: activeSessionId
    });
  } catch (error) {
    console.error(
      'Error en servidor:',
      error
    );

    return res.status(500).json({
      reply:
        'Lo siento, tuve un problema al procesar tu consulta. Intenta de nuevo.',
      sessionId: activeSessionId
    });
  }
});

  app.get(
    '/api/advisor/cases',
    (req, res) => {
      return res.json({
        cases: listarCasos()
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
        return res.status(404).json({
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
      const { status } =
        req.body || {};

      if (
        ![
          'PENDING',
          'ATTENDED'
        ].includes(status)
      ) {
        return res.status(400).json({
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
        return res.status(404).json({
          error:
            'Caso no encontrado'
        });
      }

      return res.json(caso);
    }
  );

  return app;
}

const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  dbReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(
          `🚀 Servidor ejecutándose en http://localhost:${PORT}`
        );
      });
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