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
  resetSession
} = require('./services/sessionService');

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
    const { message, sessionId } = req.body;

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

      const result =
        await procesarConsultaFactura(
          message.trim(),
          activeSessionId
        );

      // Compatibilidad con respuesta string
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