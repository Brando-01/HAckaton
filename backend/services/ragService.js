// services/ragService.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { Groq } = require('groq-sdk');
const {
  getOrCreateSession,
  addMessage,
  getHistory,
  updateContext
} = require('./sessionService');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Función auxiliar para resolver archivos CSV en varias ubicaciones posibles (raíz, /data, etc.)
function obtenerRutaArchivo(nombreArchivo) {
  const opcionesRuta = [
    path.resolve(__dirname, '../data', nombreArchivo),
    path.resolve(__dirname, 'data', nombreArchivo),
    path.resolve(__dirname, '..', nombreArchivo),
    path.resolve(__dirname, nombreArchivo)
  ];

  for (const ruta of opcionesRuta) {
    if (fs.existsSync(ruta)) return ruta;
  }
  return opcionesRuta[0];
}

// Función auxiliar para ubicar la base de datos app.db dentro de /data/ o la raíz
function obtenerRutaBD() {
  const opcionesBD = [
    path.resolve(__dirname, '../data/app.db'),
    path.resolve(__dirname, 'data/app.db'),
    path.resolve(__dirname, '../app.db'),
    path.resolve(__dirname, 'app.db')
  ];

  for (const ruta of opcionesBD) {
    if (fs.existsSync(ruta)) return ruta;
  }
  return opcionesBD[0];
}

const dbPath = obtenerRutaBD();
console.log(`🔗 Conectando RAG a base de datos en: ${dbPath}`);

// Cargar catálogo de ofertas en memoria al iniciar
let catalogoOfertasTexto = '';

function cargarCatalogoOfertas() {
  const rutaCatalogo = obtenerRutaArchivo('catalogo_ofertas_entrega.csv');

  if (!fs.existsSync(rutaCatalogo)) {
    console.error(`❌ No se encontró el archivo del catálogo en: ${rutaCatalogo}`);
    return;
  }

  const ofertas = [];
  fs.createReadStream(rutaCatalogo)
    .pipe(csv())
    .on('data', (row) => {
      ofertas.push(`- ID: ${row.oferta_id} | Plan: ${row.nombre_oferta} | Tipo: ${row.tipo_oferta} | Precio: S/ ${row.precio_mensual} | GB: ${row.gb_incluidos || 'N/A'} | Movistar Total: ${row.es_movistar_total}`);
    })
    .on('end', () => {
      catalogoOfertasTexto = ofertas.join('\n');
      console.log(`✅ Catálogo cargado con éxito (${ofertas.length} ofertas disponibles).`);
    });
}

cargarCatalogoOfertas();

function obtenerConexionDB() {
  return new sqlite3.Database(dbPath);
}

function obtenerInformacionCliente(identificador) {
  return new Promise((resolve) => {
    if (!identificador) return resolve(null);
    const db = obtenerConexionDB();

    // 1. DNI numérico (Tabla de clientes/recibos de facturación)
    if (/^\d+$/.test(identificador)) {
      db.get('SELECT * FROM clientes WHERE dni = ?', [identificador], (err, cliente) => {
        if (err || !cliente) {
          db.close();
          return resolve(null);
        }
        db.all('SELECT periodo, monto FROM recibos_anteriores WHERE dni = ?', [identificador], (err, historial) => {
          db.close();
          cliente.recibos_anteriores = historial || [];
          resolve({ tipo: 'facturacion', datos: cliente });
        });
      });
      return;
    }

    // 2. ID Cliente NBO (dataset_clientes e historial_campanias)
    const idNormalizado = identificador.toUpperCase();
    db.get('SELECT * FROM dataset_clientes WHERE cliente_id = ?', [idNormalizado], (err, clienteNBO) => {
      if (err || !clienteNBO) {
        db.close();
        return resolve(null);
      }
      db.all('SELECT fecha, canal, nombre_oferta, resultado, motivo_rechazo FROM historial_campanias WHERE cliente_id = ? LIMIT 5', [idNormalizado], (err, historialCamp) => {
        db.close();
        clienteNBO.historial_campanias = historialCamp || [];
        resolve({ tipo: 'nbo', datos: clienteNBO });
      });
    });
  });
}

function extraerIdentificadorCliente(mensajeTexto) {
  if (!mensajeTexto) return null;

  // IDs como CLI000001 o CLI_000001
  const matchCLI = mensajeTexto.match(/\bCLI_?\d+\b/i);

  if (matchCLI) {
    return matchCLI[0]
      .replace('_', '')
      .toUpperCase();
  }

  // Compatibilidad temporal con DNI demo actual
  const matchDNI = mensajeTexto.match(/\b\d{8}\b/);

  if (matchDNI) {
    return matchDNI[0];
  }

  return null;
}

async function procesarConsultaFactura(mensajeTexto, sessionId) {
  try {
    const session = getOrCreateSession(sessionId);
    const activeSessionId = session.sessionId;

    // Revisamos si el mensaje actual especifica un cliente.
    const identificadorEncontrado =
      extraerIdentificadorCliente(mensajeTexto);

    // Si encontramos uno, pasa a ser el cliente activo de la sesión.
    if (identificadorEncontrado) {
      updateContext(activeSessionId, {
        customerIdentifier: identificadorEncontrado
      });
    }

    // Si este mensaje no especifica cliente,
    // reutilizamos el que ya estaba activo.
    const idBuscar =
      identificadorEncontrado ||
      session.context.customerIdentifier;

    const infoCliente = idBuscar
      ? await obtenerInformacionCliente(idBuscar)
      : null;

    let contextoCliente = '';
    if (infoCliente) {
      if (infoCliente.tipo === 'facturacion') {
        const c = infoCliente.datos;
        contextoCliente = `
DATOS DEL CLIENTE (DNI: ${c.dni}):
- Nombre: ${c.nombre} | Plan: ${c.plan}
- Recibo actual: S/ ${c.recibo_actual_monto} (${c.recibo_actual_periodo})
- Variación: ${c.variacion_diferencia} | Motivo: ${c.variacion_motivo}
- Historial: ${JSON.stringify(c.recibos_anteriores)}`;
      } else if (infoCliente.tipo === 'nbo') {
        const c = infoCliente.datos;
        contextoCliente = `
PERFIL CLIENTE NBO (${c.cliente_id}):
- Tipo: ${c.tipo_cliente} | Antigüedad: ${c.antiguedad_meses} meses | Dpto: ${c.ubicacion_departamento}
- Elegible Movistar Total: ${c.elegible_mt} | Es Movistar Total: ${c.es_movistar_total}
- Consumo GB promedio: ${c.consumo_datos_gb_prom} GB | Reclamos: ${c.n_reclamos}
- Historial de ofertas presentadas: ${JSON.stringify(c.historial_campanias)}`;
      }
    } else {
      contextoCliente = `
      No hay información de un cliente activo disponible para esta consulta.

      Si la pregunta requiere información personal de facturación,
      no inventes montos, fechas, conceptos ni causas.
      Indica que no tienes información suficiente para responderla.
      `;
    }

    // En services/ragService.js (Actualiza la función procesarConsultaFactura)

const promptSistema = `
Eres el Asistente Inteligente Oficial de Movistar Perú para la
Hackathon AI Telecom Challenge 2026.

REGLAS DE RESPUESTA:

1. CERO ALUCINACIONES:
   Responde únicamente utilizando información disponible en el contexto
   proporcionado al sistema. Nunca inventes montos, fechas, cargos,
   promociones, planes, causas ni información del cliente.

2. CONSULTAS DE FACTURACIÓN:
   Si el usuario pregunta por su recibo, variaciones, montos o historial,
   utiliza exclusivamente los datos disponibles en el CONTEXTO DEL CLIENTE.

3. CONSULTAS COMERCIALES:
   Si el usuario pregunta específicamente por ofertas, planes o paquetes,
   utiliza exclusivamente el CATÁLOGO DE OFERTAS OFICIAL proporcionado.

4. FORMATO:
   - Usa párrafos cortos y lenguaje natural, cercano y respetuoso.
   - Muestra los montos en soles peruanos.
   - Prioriza explicaciones simples y directas.

5. CONTEXTO CONVERSACIONAL:
   - Utiliza los mensajes anteriores para interpretar preguntas de seguimiento.
   - Si el usuario pregunta "¿y el mes pasado?", "¿qué descuento?",
     "¿cuándo terminó?" o expresiones similares, interpreta la referencia
     usando la conversación anterior.
   - No obligues al usuario a repetir información que ya proporcionó
     durante la misma sesión.

6. FALTA DE ENTENDIMIENTO:
   - Si el usuario dice "no entendí", "explícamelo mejor",
     "explícamelo más fácil" o algo equivalente, reformula
     la explicación anterior de manera más sencilla.
   - No inventes datos que no estén disponibles.

--- CATÁLOGO DE OFERTAS OFICIAL ---
${catalogoOfertasTexto || 'Catálogo no disponible.'}

--- CONTEXTO DEL CLIENTE ---
${contextoCliente}
`;
    const historialConversacion = getHistory(activeSessionId);
    const completion = await groq.chat.completions.create({
      messages: [
                  {
                    role: 'system',
                    content: promptSistema
                  },

                  ...historialConversacion,

                  {
                    role: 'user',
                    content: mensajeTexto
                  }
                ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 500
    });

    const respuesta =
        completion.choices[0]?.message?.content ||
        'Lo siento, no pude procesar tu consulta en este momento.';

      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuesta);

      return respuesta;
  } catch (error) {
    console.error('Error en RAG Service:', error);
    return 'Hubo un inconveniente al procesar tu consulta. Por favor, intenta más tarde.';
  }
}

module.exports = {
  procesarConsultaFactura
};