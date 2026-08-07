// services/ragService.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { Groq } = require('groq-sdk');

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

async function procesarConsultaFactura(mensajeTexto, identificador) {
  try {
    let idBuscar = identificador;
    const matchCLI = mensajeTexto.match(/CLI_\d+/i);
    const matchDNI = mensajeTexto.match(/\b\d{8}\b/);

    if (matchCLI) idBuscar = matchCLI[0].toUpperCase();
    else if (matchDNI) idBuscar = matchDNI[0];

    const infoCliente = await obtenerInformacionCliente(idBuscar);

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
      contextoCliente = 'No se especificó un ID de cliente concreto o es una consulta sobre el catálogo comercial general.';
    }

    // En services/ragService.js (Actualiza la función procesarConsultaFactura)

const promptSistema = `Eres el Asistente Inteligente Oficial de Movistar Perú para la Hackathon AI Telecom Challenge 2026.

REGLAS DE RESPUESTA Y FORMATO ESTRICTAS:
1. SOLO DATOS OFICIALES (CERO ALUCINACIONES): Responde ÚNICAMENTE con las ofertas, planes y paquetes contenidos en el CATÁLOGO OFICIAL provisto. NUNCA menciones planes prepago, promociones externas ni servicios que "no estén en el catálogo". Si no está en la lista, indica de forma directa que no contamos con esa oferta actualmente.
2. PRECIOS Y MONEDA: Muestra siempre los precios en Soles peruanos (ej. S/ 39.90). Nunca en dólares.
3. EVALUACIÓN MATEMÁTICA: Si el cliente da un presupuesto (ej. S/ 40), los planes con precio menor o igual (ej. S/ 39.90) SÍ le alcanzan. Confírmaselo amablemente en la primera oración.
4. FORMATO ORDENADO Y VISUALMENTE ATRACTIVO:
   - Usa párrafos cortos y lenguaje natural, cercano y respetuoso.
   - Organiza los planes con listas claras usando viñetas con guiones (-) o números.
   - Destaca los nombres y precios en **negrita**.
   - Usa líneas separadoras (---) para dividir secciones si la respuesta es amplia.

--- CATÁLOGO DE OFERTAS OFICIAL ---
${catalogoOfertasTexto || 'Catálogo no disponible.'}

--- CONTEXTO DEL CLIENTE ---
${contextoCliente}
`;
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: promptSistema },
        { role: 'user', content: mensajeTexto }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 500
    });

    return completion.choices[0]?.message?.content || 'Lo siento, no pude procesar tu consulta en este momento.';
  } catch (error) {
    console.error('Error en RAG Service:', error);
    return 'Hubo un inconveniente al procesar tu consulta. Por favor, intenta más tarde.';
  }
}

module.exports = {
  procesarConsultaFactura
};