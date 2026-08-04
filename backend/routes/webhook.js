const express = require('express');
const router = express.Router();
const axios = require('axios');
const { procesarConsultaFactura } = require('../services/ragService');

// 1. GET: Verificación de Webhook para Meta
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Compara el token con el que configuraste en tu .env
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook de Meta verificado con éxito!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 2. POST: Recepción de mensajes enviados por los usuarios
router.post('/webhook', async (req, res) => {
  const body = req.body;

  // Responder inmediatamente a Meta con 200 OK (Obligatorio para que no reintente)
  res.status(200).send('EVENT_RECEIVED');

  try {
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      // Verificar si es un mensaje de texto entrante
      if (message && message.type === 'text') {
        const mensajeTexto = message.text.body;
        const numeroRemitente = message.from; // Número de WhatsApp del cliente

        console.log(`📩 Mensaje de Meta (${numeroRemitente}): ${mensajeTexto}`);

        // Procesar la duda con RAG + OpenAI
        const respuestaIA = await procesarConsultaFactura(mensajeTexto, numeroRemitente);

        // Enviar respuesta al usuario vía Graph API de Meta
        await enviarMensajeMeta(numeroRemitente, respuestaIA);
      }
    }
  } catch (error) {
    console.error('❌ Error procesando mensaje de Meta:', error.response?.data || error.message);
  }
});

// Función auxiliar para responder usando la API de Meta
async function enviarMensajeMeta(to, text) {
  const url = `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { preview_url: false, body: text }
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

module.exports = router;