const sqlite3 =
  require('sqlite3').verbose();

const path =
  require('path');

const fs =
  require('fs');

const csv =
  require('csv-parser');

const {
  Groq
} = require('groq-sdk');

const {
  getCustomerExperience
} = require('./appExperienceService');

const { getFichaCliente } = require('./dbService');
const { buildDataContext, buildCustomerDataContext, buildCustomerBillingSummary } = require('./dataContextService');

const { obtenerHechosDeCliente } = require('./cargosRepository');

const {
  narrarBloqueDeHechos,
  construirBloqueParaPrompt,
  verificarMontos
} = require('./narradorRecibos');

const { clasificarIntencion, INTENCIONES } = require('./intencionService');
const { construirRespuesta } = require('./respuestaProgresiva');

const {
  getOrCreateSession,
  addMessage,
  getHistory,
  updateContext
} = require('./sessionService');


let groq = null;

function getGroqClient() {
  if (!groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return null;
    }
    groq = new Groq({ apiKey });
  }
  return groq;
}


// =========================================================
// RUTAS DE ARCHIVOS
// =========================================================

function obtenerRutaArchivo(
  nombreArchivo
) {
  const opcionesRuta = [
    path.resolve(
      __dirname,
      '../data',
      nombreArchivo
    ),

    path.resolve(
      __dirname,
      'data',
      nombreArchivo
    ),

    path.resolve(
      __dirname,
      '..',
      nombreArchivo
    ),

    path.resolve(
      __dirname,
      nombreArchivo
    )
  ];


  for (
    const ruta of opcionesRuta
  ) {
    if (
      fs.existsSync(ruta)
    ) {
      return ruta;
    }
  }


  return opcionesRuta[0];
}


function obtenerRutaBD() {
  const opcionesBD = [
    path.resolve(
      __dirname,
      '../data/app.db'
    ),

    path.resolve(
      __dirname,
      'data/app.db'
    ),

    path.resolve(
      __dirname,
      '../app.db'
    ),

    path.resolve(
      __dirname,
      'app.db'
    )
  ];


  for (
    const ruta of opcionesBD
  ) {
    if (
      fs.existsSync(ruta)
    ) {
      return ruta;
    }
  }


  return opcionesBD[0];
}


const dbPath =
  obtenerRutaBD();


console.log(
  `🔗 Conectando RAG a base de datos en: ${dbPath}`
);


// =========================================================
// CATÁLOGO DE OFERTAS
// =========================================================

let catalogoOfertasTexto = '';
let catalogoOfertas = [];
let dataContextTexto = '';
let customerDataContextTexto = '';

async function cargarContextoDatos() {
  const rutaDatos = path.resolve(__dirname, '../data');
  dataContextTexto = await buildDataContext(rutaDatos);
  if (dataContextTexto) {
    console.log('✅ Contexto de datos cargado desde la carpeta data.');
  }
}

function cargarCatalogoOfertas() {
  const rutaCatalogo =
    obtenerRutaArchivo(
      'catalogo_ofertas_entrega.csv'
    );


  if (
    !fs.existsSync(
      rutaCatalogo
    )
  ) {
    console.error(
      `❌ No se encontró el archivo del catálogo en: ${rutaCatalogo}`
    );

    return;
  }


  const ofertas = [];


  fs.createReadStream(
    rutaCatalogo
  )
    .pipe(csv())

    .on(
      'data',
      (row) => {
        const oferta = {
          oferta_id: row.oferta_id,
          nombre_oferta: row.nombre_oferta,
          tipo_oferta: row.tipo_oferta,
          precio_mensual: Number(row.precio_mensual || 0),
          gb_incluidos: row.gb_incluidos,
          es_movistar_total: row.es_movistar_total,
          descripcion_corta: row.descripcion_corta,
          descripcion_bundle: row.descripcion_bundle,
          cluster_hogar: row.cluster_hogar
        };

        ofertas.push(oferta);
        catalogoOfertas.push(oferta);
      }
    )

    .on(
      'end',
      () => {
        catalogoOfertasTexto =
          ofertas.map((oferta) => [
            `- ID: ${oferta.oferta_id}`,
            `Plan: ${oferta.nombre_oferta}`,
            `Tipo: ${oferta.tipo_oferta}`,
            `Precio: S/ ${oferta.precio_mensual}`,
            `GB: ${oferta.gb_incluidos || 'N/A'}`,
            `Movistar Total: ${oferta.es_movistar_total}`
          ].join(' | ')).join('\n');

        console.log(
          `✅ Catálogo cargado con éxito (${ofertas.length} ofertas disponibles).`
        );
      }
    );
}

function construirRespuestaCatalogoPlanes() {
  const planesHogar = catalogoOfertas.filter((oferta) => {
    if (oferta.tipo_oferta !== 'plan_hogar') {
      return false;
    }

    const nombre = (oferta.nombre_oferta || '').toLowerCase();
    return nombre.includes('internet hogar') || nombre.includes('tv hogar') || nombre.includes('fijo hogar');
  });

  const planesOrdenados = planesHogar
    .filter((oferta) => oferta.nombre_oferta && oferta.precio_mensual)
    .sort((a, b) => a.precio_mensual - b.precio_mensual)
    .slice(0, 5);

  if (planesOrdenados.length === 0) {
    return null;
  }

  const lineas = planesOrdenados.map((plan) => `- ${plan.nombre_oferta}: S/ ${plan.precio_mensual.toFixed(1).replace(/\.0$/, '')}.`);

  return [
    'En Movistar Perú, los planes de fibra óptica disponibles son:',
    ...lineas,
    '',
    'Estos planes corresponden a servicios de Internet Hogar y paquetes de fibra óptica con opciones de TV y telefonía fija según el plan.'
  ].join('\n');
}

function responderPreguntaCatalogo(mensajeTexto) {
  if (!mensajeTexto) {
    return null;
  }

  const texto = mensajeTexto.toLowerCase();
  const preguntaCatalogo = /(fibra óptica|fibra optica|plan(es)? de internet|plan(es)? de fibra|internet hogar|planes.*hogar|fibra.*hogar)/i.test(texto);

  if (!preguntaCatalogo) {
    return null;
  }

  return construirRespuestaCatalogoPlanes();
}


cargarCatalogoOfertas();
cargarContextoDatos();


// =========================================================
// BASE DE DATOS LEGACY
// =========================================================

function obtenerConexionDB() {
  return new sqlite3.Database(
    dbPath
  );
}


function obtenerInformacionCliente(
  identificador
) {
  return new Promise(
    (resolve) => {
      if (!identificador) {
        return resolve(null);
      }


      const db =
        obtenerConexionDB();


      // -----------------------------------------------------
      // DNI:
      // clientes + recibos_anteriores
      // -----------------------------------------------------

      if (
        /^\d+$/.test(
          identificador
        )
      ) {
        db.get(
          `
          SELECT *
          FROM clientes
          WHERE dni = ?
          `,

          [identificador],

          (
            error,
            cliente
          ) => {
            if (
              error ||
              !cliente
            ) {
                db.close();

                // Si no se encontró en la DB legacy, intentamos con el Diccionario de datos (SQLite separado)
                return getFichaCliente(identificador)
                  .then((ficha) => {
                    if (!ficha || !ficha.cliente) {
                      return resolve(null);
                    }

                    // Convertir formato de dbService a la estructura esperada
                    const clienteDic = ficha.cliente;

                    clienteDic.recibos_anteriores = ficha.recibos || [];

                    return resolve({ tipo: 'facturacion', datos: clienteDic });
                  })
                  .catch(() => resolve(null));
            }


            db.all(
              `
              SELECT
                periodo,
                monto
              FROM recibos_anteriores
              WHERE dni = ?
              `,

              [identificador],

              (
                historyError,
                historial
              ) => {
                db.close();


                cliente.recibos_anteriores =
                  historyError
                    ? []
                    : (
                        historial ||
                        []
                      );


                return resolve({
                  tipo:
                    'facturacion',

                  datos:
                    cliente
                });
              }
            );
          }
        );


        return;
      }


      // -----------------------------------------------------
      // ID de cliente legacy/NBO
      // -----------------------------------------------------

      const idNormalizado =
        String(
          identificador
        ).toUpperCase();


      db.get(
        `
        SELECT *
        FROM dataset_clientes
        WHERE cliente_id = ?
        `,

        [idNormalizado],

        (
          error,
          clienteNBO
        ) => {
          if (
            error ||
            !clienteNBO
          ) {
            db.close();

              // Intentamos con el Diccionario de datos externo (NBO/dataset)
              return getFichaCliente(idNormalizado)
                .then((fichaNBO) => {
                  if (!fichaNBO) {
                    return resolve(null);
                  }

                  // Si encontramos perfil NBO en dbService, mapearlo
                  if (fichaNBO.perfil || fichaNBO.campanias) {
                    const perfil = fichaNBO.perfil || null;
                    perfil.historial_campanias = fichaNBO.campanias || [];
                    return resolve({ tipo: 'nbo', datos: perfil });
                  }

                  return resolve(null);
                })
                .catch(() => resolve(null));
          }


          db.all(
            `
            SELECT
              fecha,
              canal,
              nombre_oferta,
              resultado,
              motivo_rechazo
            FROM historial_campanias
            WHERE cliente_id = ?
            LIMIT 5
            `,

            [idNormalizado],

            (
              historyError,
              historialCamp
            ) => {
              db.close();


              clienteNBO.historial_campanias =
                historyError
                  ? []
                  : (
                      historialCamp ||
                      []
                    );


              return resolve({
                tipo:
                  'nbo',

                datos:
                  clienteNBO
              });
            }
          );
        }
      );
    }
  );
}


// =========================================================
// IDENTIFICACIÓN DE CLIENTE
// =========================================================

function extraerIdentificadorCliente(
  mensajeTexto
) {
  if (!mensajeTexto) {
    return null;
  }


  // CLI000001 o CLI_000001
  const matchCLI =
    mensajeTexto.match(
      /\bCLI_?\d+\b/i
    );


  if (matchCLI) {
    return matchCLI[0]
      .replace(
        '_',
        ''
      )
      .toUpperCase();
  }


  // También aceptar IDs numéricos largos
  // que suelen corresponder a COD_CLIENTE.
  const matchNumericId =
    mensajeTexto.match(
      /\b\d{5,}\b/
    );


  if (matchNumericId) {
    return matchNumericId[0];
  }


  return null;
}


/**
 * Recorta un bloque de contexto por registros completos, nunca a medio texto.
 *
 * Con `slice(0, 1500)` el corte caía en cualquier carácter: podía dejar un
 * "S/ 129" que en realidad era "S/ 129.90", o una fila de catálogo partida a
 * la mitad. El modelo lee ese resto como un dato válido, y así una simple
 * truncación se convierte en una cifra inventada.
 *
 * @param {string} texto
 * @param {number} maxCaracteres
 * @returns {string} Líneas enteras que caben, más un aviso si se recortó.
 */
function recortarPorRegistros(texto, maxCaracteres) {
  const contenido = String(texto || '');

  if (contenido.length <= maxCaracteres) {
    return contenido;
  }

  const lineas = contenido.split('\n');
  const conservadas = [];
  let usados = 0;

  for (const linea of lineas) {
    // +1 por el salto de línea que se vuelve a unir.
    if (usados + linea.length + 1 > maxCaracteres) {
      break;
    }
    conservadas.push(linea);
    usados += linea.length + 1;
  }

  if (conservadas.length === 0) {
    // Ni una línea entera cabe: mejor no mandar nada que mandar un trozo.
    return '(contexto omitido: no cabe ningún registro completo)';
  }

  const omitidas = lineas.length - conservadas.length;
  conservadas.push(`(se omitieron ${omitidas} registros más por espacio)`);

  return conservadas.join('\n');
}

const MESES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12'
};

/** Cantidades escritas con letras, para "hace tres meses". */
const NUMEROS_EN_LETRA = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
  cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10
};

/**
 * Interpreta referencias relativas al recibo: "hace 3 meses", "el mes
 * pasado", "el anterior".
 *
 * Devuelve cuántos recibos hay que retroceder desde el actual, o `null` si
 * el mensaje no habla en relativo. Los ciclos son mensuales, así que
 * retroceder N posiciones en el historial equivale a N meses.
 */
function mesesHaciaAtras(texto) {
  const conDigito = texto.match(/hace\s+(\d+)\s+mes/);
  if (conDigito) {
    return Number(conDigito[1]);
  }

  const conLetra = texto.match(/hace\s+([a-zá-ú]+)\s+mes/);
  if (conLetra && NUMEROS_EN_LETRA[conLetra[1]]) {
    return NUMEROS_EN_LETRA[conLetra[1]];
  }

  if (/\b(mes|recibo|factura)\s+(pasado|anterior)\b/.test(texto)
    || /\bel\s+(pasado|anterior)\b/.test(texto)) {
    return 1;
  }

  if (/\bantepasado\b/.test(texto)) {
    return 2;
  }

  return null;
}

/**
 * Resuelve a qué ciclo se refiere el cliente.
 *
 * Entiende dos formas: nombrar el mes ("el recibo de marzo") o hablar en
 * relativo ("hace 3 meses", "el mes pasado"). En ambos casos el ciclo se
 * busca en el historial real del cliente, nunca se construye una fecha.
 *
 * Devuelve `null` si el mensaje no pide un recibo distinto al actual, y el
 * centinela `SIN_HISTORIAL` si pide uno que el cliente no llegó a tener: el
 * motor responderá CICLO_NO_ENCONTRADO en vez de contestar por otro mes.
 */
const CICLO_FUERA_DE_RANGO = 'SIN_HISTORIAL';

function resolverCicloPedido(mensajeTexto, bloque) {
  if (!bloque || !bloque.encontrado || !Array.isArray(bloque.historial)) {
    return null;
  }

  const texto = (mensajeTexto || '').toLowerCase();

  // 1. Referencia relativa: "hace 3 meses", "el mes pasado".
  const retroceso = mesesHaciaAtras(texto);
  if (retroceso !== null) {
    if (retroceso <= 0) {
      return null;
    }
    // historial[0] es el recibo actual, así que retroceder N es historial[N].
    const objetivo = bloque.historial[retroceso];
    if (!objetivo) {
      return CICLO_FUERA_DE_RANGO;
    }
    return objetivo.ciclo;
  }

  // 2. Mes nombrado: "el recibo de marzo".
  const mesNombrado = Object.keys(MESES).find((mes) => texto.includes(mes));
  if (!mesNombrado) {
    return null;
  }

  const numeroMes = MESES[mesNombrado];
  const coincidencia = bloque.historial.find(
    (ciclo) => String(ciclo.ciclo).slice(4, 6) === numeroMes
  );

  if (!coincidencia || coincidencia.ciclo === bloque.reciboActual.ciclo) {
    return null;
  }

  return coincidencia.ciclo;
}

function construirRespuestaFallback(
  mensajeTexto,
  customerId,
  resumenFacturacion,
  contextoClientePorId = ''
) {
  const texto = (mensajeTexto || '').toLowerCase();
  const resumen = (resumenFacturacion || '').trim();

  if (customerId) {
    const experience = getCustomerExperience(customerId);
    if (experience) {
      const { customer, currentBill, comparison } = experience;
      if (/deuda|debo|pagar|saldo|venc|recibo|factur/i.test(texto)) {
        let reply = `Hola ${customer.name || 'cliente'}. Aquí tienes el resumen de tu cuenta:\n`;
        reply += `• Plan: ${customer.plan}\n`;
        reply += `• Recibo actual (${currentBill.period}): S/ ${currentBill.total}\n`;
        reply += `• Estado: ${currentBill.status}\n`;
        if (currentBill.dueDate) reply += `• Vencimiento: ${currentBill.dueDate}\n`;
        if (currentBill.items && currentBill.items.length > 0) {
          reply += `• Detalle: ${currentBill.items.map(i => `${i.label} (S/ ${i.amount})`).join(', ')}\n`;
        }
        if (comparison && comparison.difference !== 0) {
          reply += `• Variación respecto al mes anterior: S/ ${comparison.difference} (${comparison.direction === 'UP' ? 'aumento' : 'disminución'}).\n`;
        }
        return reply.trim();
      }
    }
  }

  if (resumen) {
    const estado = resumen.split('\n').find((line) => line.includes('Estado de deuda:')) || '';
    const monto = resumen.split('\n').find((line) => line.includes('Monto neto estimado:')) || '';
    const vencimiento = resumen.split('\n').find((line) => line.includes('Fecha de vencimiento:')) || '';
    const cargos = resumen
      .split('\n')
      .filter((line) => line.trim().startsWith('•') || line.trim().startsWith('  •'))
      .slice(0, 3)
      .map((line) => line.replace(/^\s*•\s*/, '').trim())
      .filter(Boolean);

    const partes = [];
    partes.push('Según tus datos de facturación:');

    if (estado)      partes.push(`- ${estado.replace('- ', '')}`);
    if (monto)       partes.push(`- ${monto.replace('- ', '')}`);
    if (vencimiento) partes.push(`- ${vencimiento.replace('- ', '')}`);
    if (cargos.length > 0) partes.push(`- Cargos principales: ${cargos.join(' | ')}`);
    if (customerId)  partes.push(`- Cliente: ${customerId}`);

    return partes.join('\n');
  }

  if (/fibra|plan|planes|oferta|ofertas|internet/i.test(texto)) {
    // Los precios salen del catálogo real. Antes estaban escritos a mano acá
    // (S/ 89.90, S/ 109.90...) y no correspondían a ningún dataset: era
    // exactamente la alucinación financiera que el reto penaliza, y saltaba
    // justo cuando fallaba el modelo.
    const desdeCatalogo = construirRespuestaCatalogoPlanes();
    if (desdeCatalogo) {
      return `${desdeCatalogo}\n\n¿Te gustaría contratar o migrar a alguno de estos planes?`;
    }

    return 'Ahora mismo no puedo consultar el catálogo de planes. Prefiero no darte precios que no pueda confirmar: puedo derivarte con un asesor para que te dé las tarifas vigentes.';
  }

  if (/hola|buen|saludos/i.test(texto)) {
    return `¡Hola! Soy tu asistente virtual de Movistar Perú. ¿En qué puedo ayudarte hoy? Puedes preguntarme sobre tu recibo, estado de cuenta, planes de Fibra Óptica o soporte técnico.`;
  }

  return 'No pude completar la consulta con la IA en este momento, pero puedes consultarme sobre tu recibo o planes.';
}

/**
 * Decide qué contexto auxiliar entra al prompt.
 *
 * El prompt declaraba el bloque de hechos como "fuente de verdad de todo
 * monto" y unas líneas más abajo inyectaba, siempre, cuatro secciones que
 * traen cifras rivales: el volcado de archivos, los datos cruzados, el
 * resumen legacy y el contexto del cliente. Se le pedía al modelo ignorar
 * datos que uno mismo le ponía delante, y luego el verificador limpiaba el
 * resultado. Eso convierte una garantía arquitectónica en una esperanza
 * estadística.
 *
 * Si el motor resolvió el recibo, el bloque es la ÚNICA fuente numérica.
 * Las secciones auxiliares solo aparecen cuando no hay bloque.
 */
function construirContextoAuxiliar({
  motorResolvio,
  dataContextTexto,
  contextoClientePorId,
  resumenFacturacion,
  contextoCliente
}) {
  if (motorResolvio) {
    return [
      '--- CONTEXTO ADICIONAL ---',
      '',
      'Omitido a propósito. El bloque de hechos de arriba ya resolvió el recibo',
      'de este cliente y es la única fuente numérica válida para esta respuesta.'
    ].join('\n');
  }

  return [
    '--- CONTEXTO DE ARCHIVOS DE DATA ---',
    '',
    recortarPorRegistros(dataContextTexto || 'No hay archivos de datos disponibles para leer.', 1500),
    '',
    '',
    '--- DATOS CRUZADOS DEL CLIENTE ---',
    '',
    contextoClientePorId || 'No hay coincidencias específicas para este identificador.',
    '',
    '',
    '--- RESUMEN ESTRUCTURADO DE FACTURACIÓN ---',
    '',
    resumenFacturacion || 'No hay resumen estructurado disponible.',
    '',
    '',
    '--- CONTEXTO DEL CLIENTE ---',
    '',
    contextoCliente
  ].join('\n');
}

/**
 * Lista blanca de montos que la respuesta puede mencionar.
 *
 * Se arma con las tres únicas fuentes legítimas de cifras: el bloque de
 * hechos del motor, la experiencia mock de la demo scriptada y los precios
 * del catálogo. Cualquier otro número es una invención.
 */
function construirFuenteDeMontos(bloqueDeHechos, customerId) {
  const fuentes = {};

  if (bloqueDeHechos && bloqueDeHechos.encontrado) {
    fuentes.bloque = bloqueDeHechos;
  }

  if (customerId) {
    const experiencia = getCustomerExperience(customerId);
    if (experiencia) {
      fuentes.experiencia = experiencia;
    }
  }

  // Precios de planes: el cliente puede preguntar por ellos en la misma
  // conversación y son públicos.
  fuentes.catalogo = (catalogoOfertas || []).map((oferta) => oferta.precio_mensual);

  return fuentes;
}

/**
 * Verifica la respuesta contra las fuentes legítimas y la reemplaza si
 * menciona cifras que ninguna respalda.
 *
 * Antes esto solo corría cuando el motor encontraba datos. Para un cliente
 * sin recibos en la base, el modelo quedaba libre de inventar montos: es lo
 * que producía respuestas como "el recibo anterior fue de S/ 95" sobre una
 * cuenta de la que no sabemos nada.
 */
function blindarConFuentes(respuesta, bloqueDeHechos, customerId, contexto = {}) {
  // Antes acá había un `if (!customerId) return respuesta`, que dejaba SIN
  // verificar justo el escenario donde el modelo más inventa: sin datos que
  // narrar, rellena con precios plausibles. La verificación corre siempre; lo
  // que cambia sin cliente es la lista blanca, que se reduce al catálogo.
  const fuentes = construirFuenteDeMontos(bloqueDeHechos, customerId);
  const verificacion = verificarMontos(respuesta, fuentes);

  if (verificacion.valido) {
    return respuesta;
  }

  console.warn(
    '[ANTI-ALUCINACION] montos sin respaldo %j (cliente %s, sesión %s). Respuesta reemplazada.',
    verificacion.inventados, customerId, contexto.sessionId || 'sin sesión'
  );

  if (bloqueDeHechos && bloqueDeHechos.encontrado) {
    return narrarBloqueDeHechos(bloqueDeHechos);
  }

  if (!customerId) {
    return 'Prefiero no darte cifras que no pueda confirmar. Si quieres consultar tu recibo, inicia sesión y lo revisamos con tus datos reales.';
  }

  return [
    'No tengo a la mano el detalle de facturación de esta cuenta, y prefiero no darte cifras que no pueda confirmar.',
    '',
    'Puedo derivarte con un asesor para que lo revise contigo con los datos a la vista. ¿Te ayudo con eso?'
  ].join('\n');
}

/**
 * Respuesta a usar cuando el modelo no está disponible (sin API key, cuota
 * agotada, GROQ_FALLBACK_MODE o cualquier excepción).
 *
 * Si hay bloque de hechos, narra ese bloque: montos reales del cliente, cero
 * invención. Solo cae al fallback genérico cuando no hay cliente identificado,
 * que es el único caso en que no hay nada que explicar.
 */
function construirRespuestaSinModelo(
  bloqueDeHechos,
  mensajeTexto,
  customerId,
  resumenFacturacion,
  contextoClientePorId
) {
  // "No tengo ese periodo" también es un hecho del motor y hay que decirlo.
  // Antes este caso caía al resumen legacy, que suma todos los ciclos y las
  // líneas NO CONSIDERAR: devolvía un total sin sentido (S/ 1371.52) como si
  // fuera el recibo del cliente.
  if (bloqueDeHechos && (bloqueDeHechos.encontrado || bloqueDeHechos.motivo === 'CICLO_NO_ENCONTRADO')) {
    return narrarBloqueDeHechos(bloqueDeHechos);
  }

  return construirRespuestaFallback(
    mensajeTexto,
    customerId,
    resumenFacturacion,
    contextoClientePorId
  );
}

// =========================================================
// PERSONA 4
// CONTEXTO DE MI MOVISTAR
// =========================================================

function construirContextoApp(
  customerIdentifier
) {
  if (!customerIdentifier) {
    return null;
  }


  const experience =
    getCustomerExperience(
      customerIdentifier
    );


  if (!experience) {
    return null;
  }


  const {
    customer,
    currentBill,
    previousBill,
    comparison
  } = experience;


  const currentItems =
    (
      currentBill.items ||
      []
    )
      .map(
        (item) =>
          `- ${item.label}: S/ ${item.amount}`
      )
      .join('\n');


  const previousItems =
    (
      previousBill.items ||
      []
    )
      .map(
        (item) =>
          `- ${item.label}: S/ ${item.amount}`
      )
      .join('\n');


  const causes =
    (
      comparison.causes ||
      []
    )
      .map(
        (cause) => {
          const impact =
            Number(
              cause.impact
            );


          const formattedImpact =
            impact > 0
              ? `+S/ ${impact}`
              : `S/ ${impact}`;


          return (
            `- ${cause.title}: ` +
            `${cause.description} ` +
            `Impacto en el recibo: ${formattedImpact}.`
          );
        }
      )
      .join('\n');


  const difference =
    Number(
      comparison.difference
    );


  const differenceText =
    difference > 0
      ? `+S/ ${difference}`
      : `S/ ${difference}`;


  return `
CLIENTE AUTENTICADO EN MI MOVISTAR

IMPORTANTE:
El cliente ya inició sesión en Mi Movistar.
No solicites DNI ni vuelvas a pedirle que se identifique.

ID DE CLIENTE:
${customer.customerId}

NOMBRE:
${customer.name}

PLAN:
${customer.plan}


RECIBO ACTUAL

Periodo:
${currentBill.period}

Total:
S/ ${currentBill.total}

Estado:
${currentBill.status}

Fecha de vencimiento:
${currentBill.dueDate || 'No disponible'}

Conceptos:
${currentItems || 'No hay conceptos disponibles.'}


RECIBO ANTERIOR

Periodo:
${previousBill.period}

Total:
S/ ${previousBill.total}

Estado:
${previousBill.status || 'No disponible'}

Conceptos:
${previousItems || 'No hay conceptos disponibles.'}


COMPARACIÓN ENTRE RECIBOS

Diferencia:
${differenceText}

Variación porcentual:
${comparison.percentage}%

Dirección:
${comparison.direction}


CAUSAS CONFIRMADAS DE LA VARIACIÓN

${causes || 'No hay causas disponibles.'}

IMPORTANTE:
Las causas anteriores provienen de los datos del prototipo.
No agregues otras causas que no aparezcan aquí.
`.trim();
}


// =========================================================
// CONTEXTO LEGACY
// =========================================================

function construirContextoLegacy(
  infoCliente
) {
  if (!infoCliente) {
    return null;
  }


  if (
    infoCliente.tipo ===
    'facturacion'
  ) {
    const c =
      infoCliente.datos;


    return `
DATOS DEL CLIENTE

DNI:
${c.dni}

Nombre:
${c.nombre}

Plan:
${c.plan}

Recibo actual:
S/ ${c.recibo_actual_monto}

Periodo actual:
${c.recibo_actual_periodo}

Variación:
${c.variacion_diferencia}

Motivo registrado:
${c.variacion_motivo}

Recibos anteriores:
${JSON.stringify(
  c.recibos_anteriores ||
  []
)}
`.trim();
  }


  if (
    infoCliente.tipo ===
    'nbo'
  ) {
    const c =
      infoCliente.datos;


    return `
PERFIL CLIENTE NBO

ID:
${c.cliente_id}

Tipo:
${c.tipo_cliente}

Antigüedad:
${c.antiguedad_meses} meses

Departamento:
${c.ubicacion_departamento}

Elegible Movistar Total:
${c.elegible_mt}

Es Movistar Total:
${c.es_movistar_total}

Consumo promedio:
${c.consumo_datos_gb_prom} GB

Reclamos:
${c.n_reclamos}

Historial de ofertas:
${JSON.stringify(
  c.historial_campanias ||
  []
)}
`.trim();
  }


  return null;
}


// =========================================================
// RAG
// =========================================================

async function procesarConsultaFactura(
  mensajeTexto,
  sessionId
) {
  let session = null;
  let contextoClientePorId = '';
  let resumenFacturacion = '';
  let customerIdentifier = null;
  let bloqueDeHechos = null;
  let pidioOtroCiclo = false;

  try {
    session =
      getOrCreateSession(
        sessionId
      );


    const activeSessionId =
      session.sessionId;

    const respuestaCatalogo = responderPreguntaCatalogo(mensajeTexto);
    if (respuestaCatalogo) {
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaCatalogo);
      return { reply: respuestaCatalogo, foundData: false, sessionId: activeSessionId };
    }


    // -------------------------------------------------------
    // 1. Detectar identificador explícito.
    // -------------------------------------------------------

    const identificadorEncontrado =
      extraerIdentificadorCliente(
        mensajeTexto
      );

    const clienteDeLaSesion =
      (session.context && session.context.customerIdentifier) || null;

      // Un identificador escrito en el chat NUNCA otorga acceso.
      //
      // Antes bastaba con que la sesión tuviera algún cliente para que el
      // número tecleado pasara a mandar sobre él: un usuario autenticado
      // escribía "mi código es 115358834" y se le devolvían los recibos de
      // esa otra persona. La identidad autenticada es la única válida.
      if (identificadorEncontrado) {
        if (!clienteDeLaSesion) {
          return {
            reply: 'Para ver información personal de un cliente debes iniciar sesión primero. Usa el botón "Iniciar sesión" e ingresa tu número celular y contraseña.',
            foundData: false,
            sessionId: activeSessionId
          };
        }

        if (String(identificadorEncontrado) !== String(clienteDeLaSesion)) {
          const aviso = 'Solo puedo mostrarte información de la cuenta con la que iniciaste sesión. Si necesitas consultar otra cuenta, inicia sesión con ella o te derivo con un asesor.';

          addMessage(activeSessionId, 'user', mensajeTexto);
          addMessage(activeSessionId, 'assistant', aviso);

          return {
            reply: aviso,
            foundData: false,
            sessionId: activeSessionId
          };
        }
      }


    // -------------------------------------------------------
    // 2. Cliente activo de la conversación.
    //    Siempre el de la sesión autenticada.
    // -------------------------------------------------------

    customerIdentifier = clienteDeLaSesion;

    const idBuscar = customerIdentifier;


    // -------------------------------------------------------
    // 3. PRIORIDAD:
    //    Mi Movistar / Persona 4.
    // -------------------------------------------------------

    const contextoApp =
      construirContextoApp(
        idBuscar
      );


    // -------------------------------------------------------
    // 3.b Bloque de hechos del motor determinista.
    //     Es la fuente de verdad de todo monto que salga en la
    //     respuesta: el modelo lo narra, no lo recalcula.
    // -------------------------------------------------------

    if (idBuscar) {
      try {
        const rutaDatos = path.resolve(__dirname, '../data');
        bloqueDeHechos = await obtenerHechosDeCliente(rutaDatos, idBuscar);

        // Si el cliente nombró un mes ("¿por qué el recibo de marzo salió
        // tan alto?"), se recalcula sobre ese ciclo. El mes se resuelve
        // contra los ciclos que el cliente realmente tuvo, no se adivina.
        const cicloPedido = resolverCicloPedido(mensajeTexto, bloqueDeHechos);
        if (cicloPedido) {
          pidioOtroCiclo = true;
          bloqueDeHechos = await obtenerHechosDeCliente(rutaDatos, idBuscar, {
            cicloObjetivo: cicloPedido
          });
        }
      } catch (errorMotor) {
        console.error('No se pudo construir el bloque de hechos:', errorMotor);
        bloqueDeHechos = null;
      }
    }


    // -------------------------------------------------------
    // 3.c Intención y respuesta por capas.
    //
    //     Antes todo mensaje entraba al mismo pipeline y lo
    //     único que decidía la respuesta era SI HABÍA DATOS, no
    //     QUÉ PREGUNTÓ el cliente: un "hola" devolvía el recibo
    //     entero, la variación, la deuda y los seis ciclos.
    //
    //     Las intenciones que el motor resuelve solo no pasan
    //     por el LLM: son deterministas, no gastan cuota y no
    //     pueden alucinar porque sus montos salen del bloque.
    // -------------------------------------------------------

    const clasificacion = clasificarIntencion(mensajeTexto, {
      intencionAnterior: session.context && session.context.intencionAnterior
    });

    // Firma de "sobre qué se acaba de responder", para detectar cuando el
    // cliente insiste con lo mismo y confirmarlo en vez de repetir la frase.
    const cicloRespondido = bloqueDeHechos && bloqueDeHechos.encontrado
      ? bloqueDeHechos.reciboActual.ciclo
      : null;
    const firmaTurno = `${clasificacion.intencion}:${cicloRespondido}`;
    const esRepeticion = Boolean(
      session.context && session.context.firmaTurnoAnterior === firmaTurno
    );

    updateContext(activeSessionId, {
      intencionAnterior: clasificacion.intencion,
      firmaTurnoAnterior: firmaTurno
    });

    const respuestaPorCapas = construirRespuesta(clasificacion, bloqueDeHechos, {
      tieneCliente: Boolean(idBuscar),
      nombreCliente: null,
      // Para hablar del recibo por su mes ("el de junio") en vez de repetir
      // siempre la misma fórmula, y para no repetir el estado de pago en
      // cada turno de una misma conversación.
      cicloPedido: pidioOtroCiclo,
      esSeguimiento: Boolean(clasificacion.esSeguimiento),
      esRepeticion
    });

    if (respuestaPorCapas) {
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaPorCapas.texto);

      console.log('[INTENCION] %s (confianza %s) → respuesta determinista',
        clasificacion.intencion, clasificacion.confianza);

      return {
        reply: respuestaPorCapas.texto,
        foundData: Boolean(bloqueDeHechos && bloqueDeHechos.encontrado),
        sessionId: activeSessionId,
        intencion: clasificacion.intencion,
        sugerencias: respuestaPorCapas.sugerencias || [],
        tarjeta: respuestaPorCapas.tarjeta || null,
        sugerirHandoff: Boolean(respuestaPorCapas.sugerirHandoff),
        cerrarInteraccion: Boolean(respuestaPorCapas.cerrarInteraccion)
      };
    }


    let contextoCliente = '';

    // Estos dos recorren TODOS los archivos de data/ (~139 MB) de forma
    // síncrona y bloquean el event loop en cada mensaje. Cuando el motor ya
    // resolvió el recibo son redundantes: solo se usan como red de seguridad
    // para clientes que no están en Cargos_FacturadosV2.
    // Basta con que el motor conozca al cliente. Si lo conoce pero el ciclo
    // pedido no existe, el resumen legacy tampoco ayuda: suma todos los
    // ciclos y las líneas NO CONSIDERAR, y devuelve un total inventado.
    const motorResolvio = Boolean(
      bloqueDeHechos
      && (bloqueDeHechos.encontrado || bloqueDeHechos.motivo === 'CICLO_NO_ENCONTRADO')
    );

    contextoClientePorId = idBuscar && !motorResolvio
      ? await buildCustomerDataContext(path.resolve(__dirname, '../data'), idBuscar)
      : '';

    resumenFacturacion = idBuscar && !motorResolvio
      ? buildCustomerBillingSummary(path.resolve(__dirname, '../data'), idBuscar)
      : '';

    if (contextoApp) {
      // El usuario proviene de la app
      // autenticada. Estos datos tienen
      // prioridad sobre la BD legacy.
      contextoCliente =
        contextoApp;

    } else {
      // -----------------------------------------------------
      // 4. Compatibilidad con flujo anterior:
      //    DNI o dataset NBO.
      // -----------------------------------------------------

      const infoCliente =
        idBuscar
          ? await obtenerInformacionCliente(
              idBuscar
            )
          : null;


      const contextoLegacy =
        construirContextoLegacy(
          infoCliente
        );


      if (contextoLegacy) {
        contextoCliente =
          contextoLegacy;

      } else {
        contextoCliente = contextoClientePorId
          ? `DATOS CRUZADOS DEL CLIENTE EN ARCHIVOS DE DATA\n${contextoClientePorId}`
          : `
No hay información suficiente de un cliente activo para responder consultas personales de facturación.

REGLAS:
- No inventes montos.
- No inventes periodos.
- No inventes cargos.
- No inventes promociones.
- No inventes causas de variación.
- Si la pregunta necesita información personal que no está disponible, explica claramente que faltan datos.
        `.trim();
      }
    }


    // -------------------------------------------------------
    // 5. Prompt del sistema.
    // -------------------------------------------------------

    const promptSistema = `
Eres el Asistente Inteligente Oficial de Movistar Perú para la
Hackathon AI Telecom Challenge 2026.


OBJETIVO PRINCIPAL:

Ayudar al cliente a comprender su recibo, especialmente las variaciones
entre el recibo actual y los anteriores, utilizando únicamente los datos
proporcionados al sistema.


REGLAS DE RESPUESTA:


1. CERO ALUCINACIONES

Responde únicamente utilizando información disponible en el contexto
proporcionado.

Nunca inventes:
- montos;
- fechas;
- cargos;
- promociones;
- descuentos;
- planes;
- periodos;
- causas;
- datos personales;
- resultados de operaciones no respaldadas por el contexto.


2. CONSULTAS DE FACTURACIÓN

Si el usuario pregunta:
- cuánto debe pagar;
- cuánto pagó antes;
- por qué aumentó o disminuyó;
- qué cargo apareció;
- qué descuento terminó;
- cuál fue el recibo anterior;
- qué cambió;

utiliza exclusivamente el CONTEXTO DEL CLIENTE.


3. CLIENTE AUTENTICADO

Si el contexto indica:

"CLIENTE AUTENTICADO EN MI MOVISTAR"

entonces:
- el cliente ya fue identificado;
- NO solicites DNI;
- NO solicites nuevamente su identificación;
- puedes utilizar directamente su nombre y sus recibos disponibles.


4. EXPLICACIÓN DE VARIACIONES

Si existen datos del recibo actual y anterior:
- menciona ambos montos cuando sea útil;
- indica la diferencia;
- explica las causas disponibles;
- relaciona cada causa con su impacto monetario cuando esté disponible.

No atribuyas la variación a una causa que no aparezca en el contexto.


5. CONSULTAS COMERCIALES

Si el usuario pregunta específicamente por:
- ofertas;
- planes;
- paquetes;

utiliza exclusivamente el CATÁLOGO DE OFERTAS OFICIAL proporcionado.


6. CONTEXTO CONVERSACIONAL

Utiliza los mensajes anteriores de la conversación para interpretar
preguntas de seguimiento.

Ejemplos:

"¿Y el mes pasado?"
"¿Qué descuento?"
"¿Cuánto era antes?"
"¿Cuándo terminó?"
"¿Por qué?"
"Explícamelo mejor"

No obligues al usuario a repetir información que ya proporcionó durante
la misma sesión.


7. FALTA DE ENTENDIMIENTO

Si el usuario dice:
- "no entendí";
- "explícamelo mejor";
- "explícamelo más fácil";
- o algo equivalente;

reformula la explicación anterior usando palabras más sencillas.

No agregues información nueva que no esté disponible.


8. FORMATO

- Usa español natural.
- Utiliza párrafos cortos.
- Sé claro, cercano y respetuoso.
- Muestra los montos en soles peruanos.
- Evita tecnicismos innecesarios.
- Prioriza explicar primero la razón principal de la consulta.
- No hagas respuestas excesivamente largas.

9. FIBRA ÓPTICA Y PLANES HOGAR:
- Todos los planes de "Internet Hogar" (OF005 100Mb, OF006 200Mb, OF008 Dúo, OF009, OF010 Trío, Movistar Total, etc.) corresponden al servicio de Fibra Óptica de Movistar Perú. Cuando el usuario pregunte por "fibra óptica" o "planes de internet", presenta estos planes claramente indicando sus características y precios en soles.


=========================================================
BLOQUE DE HECHOS — FUENTE DE VERDAD DE TODO MONTO
=========================================================

Este bloque lo calculó el sistema de forma determinista a partir de los
recibos reales del cliente. Tiene prioridad sobre cualquier otra sección.

- NO recalcules, NO sumes, NO restes, NO estimes.
- Si un monto no aparece acá, no existe: no lo escribas.
- Si el bloque dice que no hubo variación, no expliques causas.

${bloqueDeHechos ? construirBloqueParaPrompt(bloqueDeHechos) : 'No hay cliente identificado en esta conversación, así que no hay recibos que explicar.'}


--- CATÁLOGO DE OFERTAS OFICIAL ---

${recortarPorRegistros(catalogoOfertasTexto || 'Catálogo no disponible.', 1500)}


${construirContextoAuxiliar({
  motorResolvio,
  dataContextTexto,
  contextoClientePorId,
  resumenFacturacion,
  contextoCliente
})}
`.trim();


    // -------------------------------------------------------
    // 6. Historial de Persona 1.
    // -------------------------------------------------------

    const historialConversacion =
      getHistory(
        activeSessionId
      ).slice(-6);


    // -------------------------------------------------------
    // 7. Consulta al modelo.
    // -------------------------------------------------------

    const client = getGroqClient();

    // Allow forcing fallback mode via env to avoid hitting rate limits
    const forceFallback = String(process.env.GROQ_FALLBACK_MODE || '').toLowerCase();
    if (forceFallback === '1' || forceFallback === 'true') {
      console.warn('GROQ_FALLBACK_MODE enabled — skipping external model and using local fallback.');
      const respuestaSegura = construirRespuestaSinModelo(
        bloqueDeHechos,
        mensajeTexto,
        customerIdentifier,
        resumenFacturacion,
        contextoClientePorId
      );

      // store fallback messages
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaSegura);

      return {
        reply: respuestaSegura,
        foundData: Boolean(customerIdentifier),
        sessionId: activeSessionId
      };
    }

    if (!client) {
      throw new Error('GROQ_API_KEY missing');
    }

    // Allow configuring model, temperature and max_tokens via env to save quota
    const modelName = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const temperature = Number(process.env.GROQ_TEMPERATURE || '0.1');
    const maxTokens = Number(process.env.GROQ_MAX_TOKENS || '500');

    let completion;
    try {
      completion = await client.chat.completions.create({
        messages: [
          { role: 'system', content: promptSistema },
          ...historialConversacion,
          { role: 'user', content: mensajeTexto }
        ],
        model: modelName,
        temperature,
        max_tokens: maxTokens
      });
    } catch (err) {
      // If rate-limited, immediately return a safe fallback reply
      console.error('RAG model error while creating completion:', err && err.message ? err.message : err);
      const respuestaSegura = construirRespuestaSinModelo(
        bloqueDeHechos,
        mensajeTexto,
        customerIdentifier,
        resumenFacturacion,
        contextoClientePorId
      );

      try {
        addMessage(activeSessionId, 'user', mensajeTexto);
        addMessage(activeSessionId, 'assistant', respuestaSegura);
      } catch (sessionError) {
        console.error('Error guardando fallback tras error de modelo:', sessionError);
      }

      return {
        reply: respuestaSegura,
        foundData: Boolean(customerIdentifier),
        sessionId: activeSessionId
      };
    }


    const respuestaModelo =
      completion
        .choices[0]
        ?.message
        ?.content ||
      'Lo siento, no pude procesar tu consulta en este momento.';


    // -------------------------------------------------------
    // 8. Blindaje anti-alucinación.
    //    Todo monto de la respuesta tiene que existir en el
    //    bloque de hechos; si no, se descarta lo que dijo el
    //    modelo y se usa la narración determinista.
    // -------------------------------------------------------

    const respuesta = blindarConFuentes(
      respuestaModelo,
      bloqueDeHechos,
      customerIdentifier,
      { sessionId: activeSessionId }
    );


    // -------------------------------------------------------
    // 9. Guardar conversación.
    // -------------------------------------------------------

    addMessage(
      activeSessionId,
      'user',
      mensajeTexto
    );


    addMessage(
      activeSessionId,
      'assistant',
      respuesta
    );


    // Mismo contrato que los caminos de fallback: antes el camino feliz
    // devolvía un string suelto y se perdían foundData y sessionId.
    return {
      reply: respuesta,
      foundData: Boolean(bloqueDeHechos && bloqueDeHechos.encontrado),
      sessionId: activeSessionId
    };

  } catch (error) {
    console.error(
      'Error en RAG Service:',
      error
    );


    const respuestaSegura = construirRespuestaSinModelo(
      bloqueDeHechos,
      mensajeTexto,
      customerIdentifier,
      resumenFacturacion,
      contextoClientePorId
    );

    try {
      addMessage(
        session?.sessionId || sessionId,
        'user',
        mensajeTexto
      );

      addMessage(
        session?.sessionId || sessionId,
        'assistant',
        respuestaSegura
      );
    } catch (sessionError) {
      console.error('Error guardando fallback:', sessionError);
    }

    return {
      reply: respuestaSegura,
      foundData: Boolean(customerIdentifier),
      sessionId: session?.sessionId || sessionId
    };
  }
}


module.exports = {
  procesarConsultaFactura,
  construirRespuestaFallback,
  resolverCicloPedido,
  recortarPorRegistros,
  CICLO_FUERA_DE_RANGO
};