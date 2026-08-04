const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Sesiones en memoria (dev). Cambiar por Redis/DB en producción.
const sessions = new Map();

function construirRespuestaFallback(mensajeUsuario, contextoCliente, dni) {
  const texto = mensajeUsuario.toLowerCase();

  if (texto.includes('recibo') || texto.includes('subió')) {
    if (dni && contextoCliente.includes('DATOS OFICIALES')) {
      return 'Tu recibo subió porque se terminó la promoción inicial y el plan volvió a su precio normal. Además, si pagaste unos días después de la fecha, puede haber un pequeño recargo por demora. Si quieres, te explico esto de forma aún más sencilla.';
    }

    return 'El aumento del recibo suele deberse a que terminó la promoción inicial o a un pequeño recargo por pago tardío. Te puedo explicar el detalle si me compartes tu DNI de 8 dígitos.';
  }

  if (texto.includes('dni') || /\b\d{8}\b/.test(mensajeUsuario)) {
    return 'Perfecto. Puedes enviarme tu DNI de 8 dígitos y te ayudo a revisar el detalle de tu recibo de forma clara y sencilla.';
  }

  return 'Hola, puedo ayudarte a revisar tu recibo, explicar por qué subió y orientarte sobre tu plan. Si quieres, dime tu DNI de 8 dígitos o escribe “mi recibo subió”.';
}

async function procesarConsultaFactura(mensajeUsuario, sessionId = 'default') {
  const rutaDataset = path.join(__dirname, '../data/recibos_demo.json');
  const rawData = fs.readFileSync(rutaDataset, 'utf-8');
  const dataset = JSON.parse(rawData);

  // Recuperar o inicializar sesión
  const sessKey = sessionId || 'default';
  let session = sessions.get(sessKey) || { history: [] };

  // Añadir el mensaje del usuario al historial
  session.history.push({ role: 'user', text: mensajeUsuario, ts: Date.now() });

  // Mantener sólo últimos 12 mensajes para control de tokens
  session.history = session.history.slice(-12);

  // Buscar DNI en el mensaje actual o en el historial reciente
  let dniMatch = mensajeUsuario.match(/\b\d{8}\b/);
  if (!dniMatch) {
    for (let i = session.history.length - 1; i >= 0 && !dniMatch; i--) {
      const h = session.history[i];
      const m = h.text.match(/\b\d{8}\b/);
      if (m) dniMatch = m;
    }
  }
  const dni = dniMatch ? dniMatch[0] : null;

  let contextoCliente = "";

  let cliente = null;
  let clienteEncontrado = false;

  if (dni) {
    cliente = dataset[dni];
    if (cliente) {
      clienteEncontrado = true;
      contextoCliente = `\nDATOS OFICIALES DEL CLIENTE:\n- Nombre: ${cliente.nombre}\n- DNI: ${cliente.dni}\n- Plan: ${cliente.plan}\n- Recibo Actual (${cliente.recibo_actual.periodo}): S/ ${cliente.recibo_actual.monto}\n- Recibo Mes Pasado: S/ ${cliente.recibos_anteriores[0].monto}\n- Aumento: ${cliente.variacion.diferencia}\n- Causa Real: ${cliente.variacion.motivo}\n`;
    } else {
      // Si se provee un DNI pero no está en el dataset, no inventamos datos.
      const reply = `No hemos encontrado registros para el DNI ${dni}. No puedo inventar información. Por favor verifica el DNI o consulta con soporte.`;
      session.history.push({ role: 'assistant', text: reply, ts: Date.now() });
      sessions.set(sessKey, session);
      return { reply, foundData: false };
    }
  } else {
    contextoCliente = `\nEl usuario está haciendo una consulta sin DNI. Pide el DNI si necesita un detalle personal.\nSi quiere una explicación general sobre por qué un recibo sube, explica de forma simple sin usar datos personales.`;
  }

  const systemPrompt = `\nEres un asistente virtual empático, cálido y transparente de telecomunicaciones.\n\nREGLAS DE ORO:\n1. Si te piden explicar para un adulto mayor o explicar "más fácil", usa palabras muy sencillas, ejemplos cotidianos y evita tecnicismos.\n2. En lugar de decir "cargo por mora o reconexión", explica: "un pequeño recargo por pagar unos días después de la fecha".\n3. En lugar de "vencimiento del descuento de bienvenida", explica: "se terminó la promoción inicial de descuento y el plan volvió a su precio normal".\n4. Sé breve, transparente y directo (máximo 2 a 3 párrafos cortos).\n\n${contextoCliente}\n`;

  if (!groq) {
    const fallbackResponse = construirRespuestaFallback(mensajeUsuario, contextoCliente, dni, clienteEncontrado);
    session.history.push({ role: 'assistant', text: fallbackResponse, ts: Date.now() });
    session.history = session.history.slice(-12);
    sessions.set(sessKey, session);
    return { reply: fallbackResponse, foundData: clienteEncontrado };
  }

  // Construir mensajes para el modelo usando el historial
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  session.history.forEach(h => {
    messages.push({ role: h.role, content: h.text });
  });

  try {
    // Llamada al modelo con el historial
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages
    });

    const assistantResponse = completion.choices[0].message.content;

    // Guardar respuesta en la sesión
    session.history.push({ role: 'assistant', text: assistantResponse, ts: Date.now() });
    session.history = session.history.slice(-12);
    sessions.set(sessKey, session);

    return { reply: assistantResponse, foundData: clienteEncontrado };
  } catch (error) {
    console.warn('Fallo Groq, usando respuesta local:', error.message);
    const fallbackResponse = construirRespuestaFallback(mensajeUsuario, contextoCliente, dni, clienteEncontrado);
    session.history.push({ role: 'assistant', text: fallbackResponse, ts: Date.now() });
    session.history = session.history.slice(-12);
    sessions.set(sessKey, session);
    return { reply: fallbackResponse, foundData: clienteEncontrado };
  }

}

module.exports = { procesarConsultaFactura };