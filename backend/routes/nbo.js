// routes/nbo.js
const express = require('express');
const router = express.Router();
const { recomendarOferta } = require('../services/nboService');

// POST /api/nbo/recomendar
router.post('/recomendar', (req, res) => {
  const perfilCliente = req.body;

  if (!perfilCliente || !perfilCliente.cliente_id) {
    return res.status(400).json({ error: 'Se requiere la información del cliente (cliente_id).' });
  }

  const recomendacion = recomendarOferta(perfilCliente);
  res.json({
    cliente_id: perfilCliente.cliente_id,
    recomendacion
  });
});

module.exports = router;