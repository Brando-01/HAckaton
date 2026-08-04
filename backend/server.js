const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { procesarConsultaFactura } = require('./services/ragService');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const frontendPath = path.join(__dirname, '..', 'frontend');
  app.use(express.static(frontendPath));

  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'Movistar.html'));
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  // Endpoint de Chat
  app.post('/api/chat', async (req, res) => {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }

    try {
      console.log('[API] /api/chat message=', message, 'sessionId=', sessionId);
      const result = await procesarConsultaFactura(message, sessionId || 'web');
      // result can be either a string (legacy) or an object { reply, foundData }
      if (typeof result === 'string') {
        res.json({ reply: result, foundData: false });
      } else {
        res.json(result);
      }
    } catch (error) {
      console.error('Error en servidor:', error);
      res.status(500).json({ reply: 'Lo siento, tuve un problema al procesar tu consulta. Intenta de nuevo.' });
    }
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  });
}

module.exports = { app, createApp };