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
const { buildCustomerDataContext, buildCustomerBillingSummary } = require('./dataContextService');
const { getBillingAnalysis } = require('./billingAnalysisService');

const {
  getOrCreateSession,
  addMessage,
  getHistory,
  updateContext
} = require('./sessionService');


let groq = null;
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

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

    return Promise.resolve();
  }

  const ofertas = [];
  return new Promise((resolve) => {
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
          resolve();
        }
      )
      .on('error', (error) => {
        console.error('❌ No se pudo cargar el catálogo:', error.message);
        resolve();
      });
  });
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

function construirRespuestaCatalogoMovil() {
  const planes = catalogoOfertas
    .filter((oferta) => oferta.tipo_oferta === 'plan_movil' && oferta.nombre_oferta && oferta.precio_mensual)
    .sort((a, b) => a.precio_mensual - b.precio_mensual);
  if (!planes.length) return 'No encontré planes móviles en el catálogo disponible.';
  const lineas = planes.map((plan) => {
    const datos = Number(plan.gb_incluidos) >= 9999 ? 'datos ilimitados' : `${plan.gb_incluidos} GB`;
    return `- ${plan.nombre_oferta}: ${datos} por S/ ${plan.precio_mensual.toFixed(1).replace(/\.0$/, '')} al mes.`;
  });
  return ['Estos son los planes móviles registrados en el catálogo:', ...lineas].join('\n');
}

function construirRespuestaCatalogoGeneral() {
  return 'Tengo planes móviles, planes para el hogar y paquetes Movistar Total. ¿Cuál de esas opciones quieres revisar?';
}

function construirRespuestaCatalogoTotal() {
  const planes = catalogoOfertas
    .filter((oferta) => oferta.tipo_oferta === 'movistar_total' && oferta.nombre_oferta && oferta.precio_mensual)
    .sort((a, b) => a.precio_mensual - b.precio_mensual);
  if (!planes.length) return 'No encontré paquetes Movistar Total en el catálogo disponible.';
  return [
    'Estos son los paquetes Movistar Total registrados en el catálogo:',
    ...planes.map((plan) => `- ${plan.nombre_oferta}: S/ ${plan.precio_mensual.toFixed(1).replace(/\.0$/, '')} al mes.`)
  ].join('\n');
}

function construirRespuestaCatalogoCompleto() {
  return [
    'Claro. Estas son todas las categorías disponibles:',
    '',
    construirRespuestaCatalogoMovil(),
    '',
    construirRespuestaCatalogoPlanes(),
    '',
    construirRespuestaCatalogoTotal()
  ].join('\n');
}

function construirRespuestaCatalogoExtremo(catalogContext, mode) {
  const byContext = {
    MOBILE: catalogoOfertas.filter((oferta) => oferta.tipo_oferta === 'plan_movil'),
    HOME: catalogoOfertas.filter((oferta) => oferta.tipo_oferta === 'plan_hogar'),
    TOTAL: catalogoOfertas.filter((oferta) => oferta.tipo_oferta === 'movistar_total')
  };
  const planes = (byContext[catalogContext] || catalogoOfertas)
    .filter((oferta) => oferta.nombre_oferta && Number(oferta.precio_mensual) > 0)
    .sort((a, b) => Number(a.precio_mensual) - Number(b.precio_mensual));
  if (!planes.length) return 'No encontré planes comparables en esa categoría.';
  const plan = mode === 'MAX' ? planes[planes.length - 1] : planes[0];
  const label = mode === 'MAX' ? 'más caro' : 'más económico';
  return `Dentro de esa categoría, el plan ${label} registrado es ${plan.nombre_oferta}, por S/ ${Number(plan.precio_mensual).toFixed(2)} al mes.`;
}

function responderPreguntaCatalogo(mensajeTexto, catalogContext = null) {
  if (!mensajeTexto) {
    return null;
  }

  const texto = mensajeTexto.toLowerCase();
  const normalized = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = normalized.replace(/\s+(?:pe|pues|porfa|nom[aá]s)$/i, '').trim();
  const asksAll = /^(?:todas|todos|todo|las\s+tres|muestrame\s+(?:todas|todos)|quiero\s+verlas\s+todas)$/.test(compact);
  if (/^(?:ahora\s+)?(?:solo\s+)?(?:los\s+)?moviles$/.test(compact)) return { reply: construirRespuestaCatalogoMovil(), intent: 'MOBILE' };
  if (/^(?:ahora\s+)?(?:solo\s+)?(?:los\s+)?(?:de\s+)?(?:fibra|hogar)$/.test(compact)) return { reply: construirRespuestaCatalogoPlanes(), intent: 'HOME' };
  if (catalogContext && /cual\s+(?:es\s+)?el\s+mas\s+(?:barato|economico)|el\s+mas\s+(?:barato|economico)/.test(compact)) {
    return { reply: construirRespuestaCatalogoExtremo(catalogContext, 'MIN'), intent: catalogContext };
  }
  if (catalogContext && /cual\s+(?:es\s+)?el\s+mas\s+caro|el\s+mas\s+caro/.test(compact)) {
    return { reply: construirRespuestaCatalogoExtremo(catalogContext, 'MAX'), intent: catalogContext };
  }
  if (asksAll && catalogContext === 'GENERAL') {
    return { reply: construirRespuestaCatalogoCompleto(), intent: 'ALL' };
  }
  if (asksAll && catalogContext === 'MOBILE') {
    return { reply: construirRespuestaCatalogoMovil(), intent: 'MOBILE' };
  }
  if (asksAll && catalogContext === 'HOME') {
    return { reply: construirRespuestaCatalogoPlanes(), intent: 'HOME' };
  }
  if (asksAll && catalogContext === 'TOTAL') {
    return { reply: construirRespuestaCatalogoTotal(), intent: 'TOTAL' };
  }
  if (asksAll) {
    return { reply: '¿Te refieres a todos los planes móviles, los planes para el hogar o los paquetes Movistar Total?', intent: 'GENERAL' };
  }
  const mentionsInvoice = /\bS\dAA-\d+\b/i.test(mensajeTexto);
  const asksGeneralDefinition = /qu[eé]\s+(?:es|significa)|c[oó]mo funciona/i.test(texto);
  const asksAboutOwnBill = /\b(?:mi|mis)\s+(?:recibo|factura|cuenta|bono)|me\s+cobran|en\s+mi\b/i.test(texto);
  if (!mentionsInvoice && !asksAboutOwnBill && asksGeneralDefinition && /\bprorrateo\b/i.test(texto)) {
    return { reply: 'El prorrateo es un cobro o descuento proporcional por usar un servicio solo durante parte del ciclo de facturación. Por ejemplo, si un plan se activa a mitad de mes, se cobra únicamente la parte correspondiente a esos días. Si quieres saber si ocurrió en tu recibo, pídeme que lo revise.', intent: null };
  }
  if (!mentionsInvoice && asksGeneralDefinition && /\breconexi[oó]n\b/i.test(texto)) {
    return { reply: 'La reconexión es el restablecimiento de un servicio que estuvo suspendido. Puede generar un cargo solo si existe un registro asociado a tu factura; para confirmarlo en tu caso debes iniciar sesión.', intent: null };
  }
  if (!mentionsInvoice && !asksAboutOwnBill && /qu[eé]\s+(?:es|significa).*\b(?:bonificaci[oó]n|bono)\b/i.test(texto)) {
    return { reply: 'Una bonificación es un beneficio que compensa total o parcialmente el precio de un servicio. En una factura puede aparecer junto con el cargo que compensa; para revisar tus bonos reales debes iniciar sesión.', intent: null };
  }
  if (/\bplanes?\s+m[oó]vil(?:es)?\b|\bplanes?\s+para\s+(?:mi\s+)?celular\b/i.test(texto)) {
    return { reply: construirRespuestaCatalogoMovil(), intent: 'MOBILE' };
  }
  const preguntaCatalogo = /(fibra óptica|fibra optica|plan(es)? de internet|plan(es)? de fibra|internet hogar|planes.*hogar|fibra.*hogar)/i.test(texto);
  if (preguntaCatalogo) return { reply: construirRespuestaCatalogoPlanes(), intent: 'HOME' };
  if (/\bmovistar\s+total\b/i.test(texto)) return { reply: construirRespuestaCatalogoTotal(), intent: 'TOTAL' };
  if (/^[¿?¡!]*\s*(?:qu[eé]\s+)?planes?\s+(?:tienes|ofreces|hay|disponibles)?\s*[¿?¡!]*$/i.test(texto.trim())) {
    return { reply: construirRespuestaCatalogoGeneral(), intent: 'GENERAL' };
  }
  return null;
}

function responderConversacionBasica(mensajeTexto) {
  const normalized = String(mensajeTexto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bhabal\b/g, 'habla')
    .replace(/\bq\s+fue\b/g, 'que fue')
    .replace(/[¿?¡!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  const asksBilling = /deuda|debo|pagar|saldo|pendiente|venc|recibo|factur|monto|aument|subi|cargo|bono|plan|reconexion|prorrat|\bvr\b/.test(normalized);
  const colloquial = /\b(?:oe|causa|mano|mnao|mno|bro|pe|rey|soli)\b/.test(normalized);
  const greeting = /^(?:hola(?:\s+(?:pe|pues|causa|mano|mnao|mno|bro|rey|que|tal|como|estas))*|holi|buenas(?:\s+(?:dias|tardes|noches))?|que\s+tal|como\s+estas|oe(?:\s+(?:mano|mnao|mno|causa|bro))?\s+que\s+tal(?:\s+como\s+estas)?)$/.test(normalized);

  const colloquialGreeting = /^(?:hola\b.*(?:que\s+fue|todo\s+bien|como\s+va)|habla(?:me)?(?:\s+mi)?\s+(?:soli|causa|mano|mno|bro|rey)(?:\s+que\s+fue)?|(?:oe\s+)?(?:mano|mno|causa|bro)?\s*que\s+fue|que\s+fue(?:\s+(?:causa|mano|mno|bro|rey))?|todo\s+bien(?:\s+(?:causa|mano|mno|bro|rey))?)$/.test(normalized);
  if ((greeting || colloquialGreeting) && !asksBilling) {
    if (colloquial) return '¡Habla, causa! Todo bien por aquí. ¿Qué quieres revisar de tu servicio Movistar?';
    if (/^buenas\s+(?:dias|tardes|noches)$/.test(normalized)) return `¡${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}! ¿En qué puedo ayudarte con tu servicio Movistar?`;
    return '¡Hola! ¿Cómo estás? Cuéntame qué necesitas y te ayudo con tu servicio Movistar.';
  }
  if (/^(?:ya\s+)?(?:gracias|muchas\s+gracias|te\s+pasaste|gracias\s+(?:causa|mano|mno|bro|rey|soli)|gracias\s+mi\s+(?:causa|mano|bro|rey|soli))$/.test(normalized)) {
    return colloquial ? '¡De nada, causa! Aquí estoy si quieres revisar algo más.' : '¡Con gusto! Aquí estoy si necesitas algo más.';
  }
  if (/(?:chevere|chevre|bacan|genial|perfecto|listo|okey|okay|ya\s+entendi|quedo\s+clar|clarisimo|entendido)/.test(normalized) && !asksBilling) {
    return colloquial ? '¡Chévere, causa! Si quieres revisar algo más, dime nomás.' : '¡Perfecto! Si necesitas revisar algo más, aquí estoy.';
  }
  if (/^(?:chau|chao|adios|hasta\s+luego|nos\s+vemos)(?:\s+(?:pe|pues|causa|mano|mno|bro|rey|soli))?$/.test(normalized)) {
    return colloquial ? '¡Nos vemos, causa! Que te vaya muy bien.' : '¡Hasta luego! Que tengas un buen día.';
  }
  if (/^(?:quien\s+eres|que\s+eres|como\s+te\s+llamas)$/.test(normalized)) {
    return 'Soy Lucía, tu asistente virtual de Movistar. Puedo ayudarte a entender tus recibos y servicios sin inventar información.';
  }
  if (/^(?:que\s+puedes\s+hacer|en\s+que\s+me\s+puedes\s+ayudar|ayuda)$/.test(normalized)) {
    return 'Puedo explicarte tu recibo, comparar meses, revisar cargos, bonos, reconexiones y vencimientos. Para información personal usaré únicamente los datos asociados a tu sesión.';
  }
  if (/\bproyecto\b/.test(normalized) && /subi|aument|caro/.test(normalized) && !/recibo|factura|monto|cargo/.test(normalized)) {
    return '¿Te refieres a que subió tu recibo? Si realmente hablas de un proyecto, cuéntame un poco más porque mi especialidad es ayudarte con servicios y facturación Movistar.';
  }
  if (/partido|cienciano|futbol|resultado deportivo/.test(normalized)) {
    return 'No tengo resultados deportivos en tiempo real. Mi especialidad es ayudarte con tu recibo y tus servicios Movistar.';
  }
  return null;
}


const catalogoCargaPromise = cargarCatalogoOfertas();


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


  // A billing invoice also contains a long number (e.g. S8AA-0007113580).
  // It is not a customer identifier and must never be interpreted as one.
  const textoSinFactura = String(mensajeTexto).replace(/\bS\dAA-\d+\b/gi, '');

  // CLI000001 o CLI_000001
  const matchCLI =
    textoSinFactura.match(
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
    textoSinFactura.match(
      /\b\d{5,}\b/
    );


  if (matchNumericId) {
    return matchNumericId[0];
  }


  return null;
}


function construirRespuestaFallback(
  mensajeTexto,
  customerId,
  resumenFacturacion,
  contextoClientePorId = ''
) {
  const texto = (mensajeTexto || '').toLowerCase();
  const resumen = (resumenFacturacion || '').trim();
  const respuestaBasica = responderConversacionBasica(mensajeTexto);
  if (respuestaBasica) return respuestaBasica;
  const esTemaFacturacion = /deuda|debo|pagar|saldo|pendiente|venc|recibo|factur|monto|aument|subi|cargo|descuento|bonific|bono|prorrat|reconex|historial|compar|anterior|plan/i.test(texto);

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

  if (resumen && esTemaFacturacion) {
    const estado = resumen.split('\n').find((line) => line.includes('Estado registrado:') || line.includes('Estado de deuda:')) || '';
    const factura = resumen.split('\n').find((line) => line.includes('Factura:')) || '';
    const monto = resumen.split('\n').find((line) => line.includes('Total neto calculado de cargos:') || line.includes('Total de cargos de esta factura:') || line.includes('Monto neto estimado:')) || '';
    const vencimiento = resumen.split('\n').find((line) => line.includes('Fecha de vencimiento:')) || '';
    const cargos = resumen
      .split('\n')
      .filter((line) => line.trim().startsWith('•') || line.trim().startsWith('  •'))
      .slice(0, 3)
      .map((line) => line.replace(/^\s*•\s*/, '').trim())
      .filter(Boolean);

    const partes = [];
    partes.push('Según tus datos de facturación:');

    if (factura)     partes.push(`- ${factura.replace('- ', '')}`);
    if (estado)      partes.push(`- ${estado.replace('- ', '')}`);
    if (monto)       partes.push(`- ${monto.replace('- ', '')}`);
    if (vencimiento) partes.push(`- ${vencimiento.replace('- ', '')}`);
    if (cargos.length > 0) partes.push(`- Cargos de la factura: ${cargos.join(' | ')}`);
    if (/deuda|debo|pagar|saldo/i.test(texto)) {
      partes.push('- El estado indica "CON DEUDA", pero los archivos no incluyen un saldo pendiente exacto. El total neto calculado no debe interpretarse automáticamente como la deuda a pagar.');
    }
    if (/aument|subi|por qu[eé]|explica|monto/i.test(texto)) {
      partes.push('- Este resumen solo describe la factura más reciente; para explicar un cambio se debe comparar con una factura anterior del mismo servicio.');
    }
    if (customerId)  partes.push(`- Cliente: ${customerId}`);

    return partes.join('\n');
  }

  if (/fibra|plan|planes|oferta|ofertas|internet/i.test(texto)) {
    return `Nuestros planes de Fibra Óptica (Internet Hogar) en Movistar Perú incluyen:\n` +
           `• Plan Internet Hogar 100Mb (Fibra): S/ 89.90 / mes\n` +
           `• Plan Internet Hogar 200Mb (Fibra): S/ 109.90 / mes\n` +
           `• Dúo Internet + TV Hogar (Fibra): S/ 129.90 / mes\n` +
           `• Dúo Internet + Fijo Hogar (Fibra): S/ 119.90 / mes\n` +
           `• Trío Internet + TV + Fijo (Fibra): S/ 159.90 / mes\n` +
           `• Movistar Total Básico (Móvil 30GB + Fibra): S/ 149.90 / mes\n\n` +
           `¿Te gustaría contratar o migrar a alguno de estos planes?`;
  }

  if (/hola|buen|saludos/i.test(texto)) {
    return '¡Hola! Te leo. Cuéntame con tus propias palabras qué necesitas revisar de tu servicio Movistar.';
  }

  if (/\b(?:oe|causa|mano|mnao|mno|bro|pe|rey)\b/i.test(texto)) {
    return 'Te sigo, causa, pero no entendí bien esa parte. ¿Te refieres a tu recibo, tu plan o algún problema con el servicio?';
  }
  return 'No entendí bien esa parte. ¿Te refieres a tu recibo, tu plan o algún problema con el servicio? Puedes decírmelo con tus propias palabras.';
}

function extraerHechosProtegidos(texto) {
  const source = String(texto || '');
  return {
    amounts: source.match(/S\/\s*-?\d+(?:\.\d+)?/gi) || [],
    invoices: source.match(/\bS\dAA-\d+\b/gi) || [],
    dates: source.match(/\b(?:\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}[\/-]\d{2}[\/-]\d{2}|\d{8})\b/g) || [],
    debtStatuses: source.match(/\b(?:CON|SIN)\s+DEUDA\b/gi) || []
  };
}

function respuestaMantieneHechos(respuesta, borrador) {
  const allowed = extraerHechosProtegidos(borrador);
  const produced = extraerHechosProtegidos(respuesta);
  const normalize = (value) => value.replace(/\s+/g, '').toUpperCase();
  const allowedAmounts = new Set(allowed.amounts.map(normalize));
  const allowedInvoices = new Set(allowed.invoices.map(normalize));
  const allowedDates = new Set(allowed.dates.map((value) => value.replace(/[^\d]/g, '')));
  const allowedStatuses = new Set(allowed.debtStatuses.map(normalize));

  if (produced.amounts.some((value) => !allowedAmounts.has(normalize(value)))) return false;
  if (produced.invoices.some((value) => !allowedInvoices.has(normalize(value)))) return false;
  if (produced.dates.some((value) => !allowedDates.has(value.replace(/[^\d]/g, '')))) return false;
  if (produced.debtStatuses.some((value) => !allowedStatuses.has(normalize(value)))) return false;
  // Humanizar nunca puede convertir un vencimiento conocido en "no sé" ni
  // omitir la fecha cuando el borrador responde específicamente cuándo pagar.
  if (allowed.dates.length
      && /fecha\s+(?:l[ií]mite|de\s+vencimiento)|vence|venci[oó]|hasta\s+el|para\s+pagar/i.test(borrador)
      && !produced.dates.length) return false;
  if (/no puedo afirmar|no puedo confirmar/i.test(borrador) && !/(no (?:puedo|podemos|es posible)|no se puede|no confirma)/i.test(respuesta)) return false;
  if (/por seguridad/i.test(borrador) && !/(solo.*(?:tu|propia).*cuenta|solo.*sesion|por seguridad)/i.test(respuesta)) return false;
  if (/no voy[^.]*inventar/i.test(borrador) && !/no[^.\n]*(?:inventar|suponer)|sin evidencia/i.test(respuesta)) return false;
  if (/pagos recientes|pago reciente/i.test(borrador) && !/(no (?:incluyen|tengo acceso|puedo confirmar|puedo verificar|puedo concluir)|pago reciente[^.\n]*no|falta[^.\n]*(?:confirmacion|aplicacion))/i.test(respuesta)) return false;
  if (/\brecibo\b/i.test(borrador) && !/\b(?:recibo|factura)\b/i.test(respuesta)) return false;
  if (/te recomiendo|contacta|comunicate|llama|verifica.*(?:plataforma|app|web)|servicio al cliente/i.test(respuesta)
      && !/te recomiendo|contacta|comunicate|llama|plataforma|servicio al cliente/i.test(borrador)) return false;
  return true;
}

async function humanizarRespuestaVerificada(mensajeUsuario, borrador) {
  const apiKey = process.env.GROQ_API_KEY || '';
  const forceFallback = String(process.env.GROQ_FALLBACK_MODE || '').toLowerCase() === 'true';
  if (!apiKey || apiKey.includes('test_placeholder') || forceFallback) return borrador;

  try {
    const client = getGroqClient();
    if (!client) return borrador;
    const completion = await client.chat.completions.create({
      model: (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim(),
      temperature: 0.2,
      max_tokens: Number(process.env.GROQ_MAX_TOKENS || '500'),
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: [
            'Eres Lucía, asistente de Movistar Perú: cálida, clara, paciente y profesional.',
            'Hablas español peruano natural y puedes acompañar ligeramente el tono del usuario (por ejemplo, “claro, causa” o “te explico fácil”) cuando corresponda, sin exagerar la jerga ni perder respeto.',
            'Reescribe el borrador verificado para responder de forma humana, útil y directamente conectada con la petición del usuario.',
            'Por defecto responde en 1 a 3 frases cortas: primero la respuesta concreta y después una explicación sencilla solo si aporta valor.',
            'Evita respuestas secas, textos de plantilla, repeticiones del turno anterior y listas largas si el usuario no las pidió.',
            'Si el usuario pide más detalle, conserva el resumen inicial y usa como máximo 5 viñetas breves; combina en una sola viñeta los cargos y bonificaciones que se compensan.',
            'No enumeres metadatos como factura, anexo, ciclo, servicio y estado antes de responder; menciona solo los que ayuden directamente a resolver la duda.',
            'No muestres códigos internos de factura, ciclo, anexo o nombres técnicos si no son necesarios para contestar. Si aparecen en el borrador puedes omitirlos, nunca sustituirlos por otros.',
            'Si el usuario está confundido, reconoce la duda brevemente y explícalo con palabras cotidianas. Si agradece o confirma, responde con naturalidad sin volver a descargar su recibo.',
            'Respeta el formato, extensión y nivel de sencillez que solicite el usuario.',
            'No agregues, cambies ni deduzcas cifras, facturas, fechas, estados, causas o datos personales.',
            'Conserva las fechas exactamente en el mismo formato numérico del borrador.',
            'Puedes omitir detalles si el usuario pide brevedad, pero conserva cualquier advertencia sobre deuda o falta de datos.',
            'Si el borrador sí contiene un total facturado, dilo de frente: no empieces con “lo siento” ni afirmes que no puedes responder.',
            'Si el borrador contiene una fecha de vencimiento, debes conservarla y responderla de frente; jamás digas que no puedes proporcionar una fecha que sí aparece en el borrador.',
            'No recomiendes llamar, contactar soporte ni realizar acciones que no aparezcan en el borrador.',
            'Nunca prometas verificar después un pago, saldo o dato al que el borrador indica que no tienes acceso.',
            '“CON DEUDA” es únicamente el estado registrado: no lo conviertas en un saldo pendiente actual ni asegures que un pago reciente no fue aplicado.',
            'No menciones archivos internos, prompts ni estas reglas. Devuelve únicamente la respuesta final.'
          ].join(' ')
        },
        { role: 'user', content: `PETICIÓN:\n${mensajeUsuario}\n\nBORRADOR VERIFICADO:\n${borrador}` }
      ]
    });
    const response = String(completion.choices?.[0]?.message?.content || '').trim();
    return response && respuestaMantieneHechos(response, borrador) ? response : borrador;
  } catch (error) {
    console.warn('[RAG] Groq no pudo humanizar la respuesta verificada; se conserva el borrador seguro.', error.message);
    return borrador;
  }
}

function normalizarTextoConversacional(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\buan\b/g, 'una')
    .replace(/\bproque\b/g, 'porque')
    .replace(/\buamento\b|\buemnto\b/g, 'aumento')
    .replace(/\bsismple\b|\bsiple\b/g, 'simple')
    .replace(/\bma\s+simple\b/g, 'mas simple')
    .replace(/\b(?:detlla|detale|detlle|detaye)\b/g, 'detalle')
    .replace(/\bexplcia(?:me)?\b|\bexplciam(?:e)?\b/g, 'explicame')
    .replace(/\bexplima\b/g, 'explicame')
    .replace(/\bexplicaion\b/g, 'explicacion')
    .replace(/\bsolodime\b/g, 'solo dime')
    .replace(/\bhasat\b/g, 'hasta')
    .replace(/\bnoma\b/g, 'nomas')
    .replace(/\bami\b/g, 'a mi')
    .replace(/\bcuandoaument/g, 'cuando aument')
    .replace(/\bkiero\b/g, 'quiero')
    .replace(/\bsaver\b/g, 'saber')
    .replace(/\bxq\b/g, 'por que')
    .replace(/\baumnto\b|\baumeto\b/g, 'aumento')
    .replace(/\bresivo\b|\bresibo\b/g, 'recibo')
    .replace(/\bms\s+fasil\b|\bmas\s+fasil\b/g, 'mas facil')
    .replace(/\baora\b/g, 'ahora')
    .replace(/\bbn\b/g, 'bien')
    .replace(/\bcuant\b/g, 'cuanto')
    .replace(/\bants\b/g, 'antes')
    .replace(/\basta\b/g, 'hasta')
    .replace(/\bkuando\b/g, 'cuando')
    .replace(/\btngo\b/g, 'tengo')
    .replace(/\bdeud\b/g, 'deuda')
    .replace(/\bnel\b/g, 'no')
    .replace(/\btas\b/g, 'estas')
    .replace(/\brason\b/g, 'razon');
}

function detectarIntencionFacturacion(texto) {
  const normalized = normalizarTextoConversacional(texto);
  if (/no\s+entend|mas\s+facil|mas\s+simple|facil.*entender|explicalo\s+facil/.test(normalized)) return 'FOLLOWUP_SIMPLE';
  if (/invent.*(?:causa|motivo|monto|deuda)|causa\s+probable.*(?:aunque|sin).*(?:dato|evidencia)/.test(normalized)) return 'UNSUPPORTED_ESTIMATE';
  if (/separa.*(?:hecho|confirmado).*(?:inferencia|suposicion)|hecho.*(?:vs|e).*inferencia/.test(normalized)) return 'FACT_VS_INFERENCE';
  if (/(?:solo\s+(?:dime|quiero|dame|muestra(?:me)?)\s+(?:la\s+)?fecha(?:\s+(?:limite|maxima|de\s+vencimiento|para\s+pagar))?|solo\s+(?:la\s+)?fecha|(?:y\s+)?(?:la\s+)?fecha\s+(?:limite|maxima)(?:\s+(?:para|de)\s+pagar)?(?:\s+nomas)?)(?:\s+(?:mi\s+)?(?:recibo|factura|deuda))?$/.test(normalized)
      || /solo\s+(?:dime|quiero|dame).*fecha.*(?:hasta\s+cuando|para\s+pagar|nomas|nada\s+mas|eso.*(?:interesa|quiero))|solo.*fecha\s+maxima.*pagar/.test(normalized)) return 'DUE_DATE_ONLY';
  if (/solo.*(?:total|monto).*(?:fecha|venc)|(?:total|monto).*y.*(?:fecha|venc).*(?:solo|nada mas)/.test(normalized)) return 'PAYMENT_ONE_LINE';
  if (/(?:ultimo|actual).*(?:recibo|factura).*(?:total|monto).*(?:venc|fecha).*(?:por\s*que|porque|cambi)|(?:explica|resumen).*(?:recibo|factura).*(?:total|monto).*(?:venc|fecha)/.test(normalized)) return 'RECEIPT_OVERVIEW';
  if (!/historial|ultimos?|cinco|5\s+(?:recib|factur|mes|ciclo)|compar/.test(normalized)
      && /desde\s+cuando.*(?:aument|subi|increment|cambi)|cuando.*(?:empezo|comenzo).*(?:aument|subi|increment)/.test(normalized)) return 'INCREASE_START';
  if (/(?:en\s+)?una\s+(?:sola\s+)?(?:oracion|frase)/.test(normalized) && /recib|factur|aument|subi|porque/.test(normalized)) return 'ONE_LINE_SUMMARY';
  const monthNames = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const monthPattern = Object.keys(monthNames).join('|');
  const monthComparison = normalized.match(new RegExp(`compar[^\\n]*\\b(${monthPattern})\\b[^\\n]*\\b(${monthPattern})\\b`));
  if (monthComparison) return `HISTORY_MONTHS:${monthNames[monthComparison[1]]}:${monthNames[monthComparison[2]]}:${/porcentaje|porcentual|%/.test(normalized) ? 'PERCENT' : 'AMOUNT'}`;
  const countWords = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const historyCountMatch = normalized.match(/ultimos?\s+(\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:recib|factur)/);
  if (historyCountMatch) {
    if (/compar|cuando|aument|cambio|auditor|revisa/.test(normalized)) return 'HISTORY_REVIEW';
    const count = Math.min(10, Number(historyCountMatch[1]) || countWords[historyCountMatch[1]] || 5);
    return `HISTORY_COUNT:${count}:${/antigu|viejo/.test(normalized) && /reciente|nuevo/.test(normalized) ? 'OLDEST' : 'NEWEST'}`;
  }
  if (/(?:recibo|factura).*(?:mas\s+bajo|menor).*(?:mas\s+alto|mayor)|(?:mas\s+bajo|menor).*(?:mas\s+alto|mayor).*(?:recibo|factura)/.test(normalized)) return 'HISTORY_EXTREMES';
  const monthDetail = normalized.match(new RegExp(`(?:en|durante)\\s+(${monthPattern})[^\\n]*(?:que\\s+(?:ocurrio|paso)|por\\s+que)`));
  if (monthDetail) return `HISTORY_MONTH_DETAIL:${monthNames[monthDetail[1]]}`;
  if (/cual\s+es\s+mi\s+(?:id|codigo)|que\s+(?:id|codigo)\s+tengo/.test(normalized)) return 'IDENTIFIER_CLARIFY';
  if (/(?:mi\s+)?(?:id|codigo)\s+de\s+cliente/.test(normalized)) return 'CUSTOMER_ID';
  if (/(?:mi\s+)?numero\s+(?:de\s+)?(?:telefono|celular|servicio)|cual\s+es\s+mi\s+(?:telefono|celular)/.test(normalized)) return 'SERVICE_NUMBER';
  if (/hasta\s+cuando.*(?:pagar|pago)|hasta\s+que\s+fecha.*(?:pagar|pago)|que\s+fecha.*(?:pagar|pago)|cuando\s+(?:vence|vencia)|fecha\s+(?:de\s+)?vencimiento|que\s+dia.*(?:pagar|vence)/.test(normalized)) return 'DUE_DATE';
  if (/ya\s+pague|(?:si\s+)?pague.*(?:ayer|hoy|anoche|deuda|recibo)|por\s+que.*(?:con\s+deuda|deuda).*(?:pague|pago)/.test(normalized)) return 'PAYMENT_ALREADY';
  if (/(?:recibo|factura).*(?:ya\s+vencio|esta\s+vencid)|(?:ya\s+vencio|esta\s+vencid).*(?:recibo|factura)/.test(normalized)) return 'DUE_STATUS';
  if (/cuanto\s+seria.*(?:si\s+)?(?:quit|retir|elimin).*(?:plan|cargo)|(?:quit|retir|elimin).*(?:plan|cargo).*cuanto/.test(normalized)) return 'SIMULATE_REMOVE_PLAN';
  if (/vecin|otra\s+persona|otro\s+cliente/.test(normalized) && /paga|recibo|factura|deuda/.test(normalized)) return 'EXTERNAL_COMPARISON';
  if (/(?:ignora|sin)\s+(?:los\s+)?(?:csv|datos|archivos)|inventa.*(?:monto|deuda|causa)|haz\s+una\s+estimacion/.test(normalized)) return 'UNSUPPORTED_ESTIMATE';
  if (/(?:total|monto).*(?:venc|fecha).*(?:oracion|frase)|(?:venc|fecha).*(?:total|monto).*(?:oracion|frase)/.test(normalized)) return 'PAYMENT_ONE_LINE';
  const monthsMatch = normalized.match(/hace\s+(\d+|uno|una|dos|tres|cuatro|cinco)\s+mes/);
  const monthWords = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
  const monthsAgo = monthsMatch && (Number(monthsMatch[1]) || monthWords[monthsMatch[1]]);
  if (/(?:ultimos?\s+(?:5|cinco)\s+(?:recib|factur)).*(?:antigu|viejo).*(?:reciente|nuevo)/.test(normalized)) return 'HISTORY_OLDEST_FIRST';
  if (/primer\s+cambio.*primer\s+aumento|primer\s+aumento.*primer\s+cambio/.test(normalized)) return 'HISTORY_REVIEW';
  if (/(?:ultimos?\s+(?:\d+|cinco)\s+(?:mes|recib|factur|ciclo)|cinco\s+ciclos|5\s+meses).*(?:compar|cambio|separa|primera vez|cuando|aument|auditor)/.test(normalized)) return 'HISTORY_REVIEW';
  if (/auditor|suma.*(?:cuadra|total)|valida.*cargos/.test(normalized)) return 'AUDIT';
  if (/\bvr\b/.test(normalized) && /que\s+(?:es|significa)|significado|sale|aparece|explica|quisiera\s+saber|no\s+entiendo/.test(normalized)) return 'EXPLAIN_VR';
  if (/abuel|ancian|acnian|acioan|adulto mayor|80\s*anos|persona mayor|como si (?:fuera|tuviera|tubiera)|si (?:fuera|tuviera|tubiera).*(?:80|mayor)/.test(normalized)) return 'SIMPLE_SUMMARY';
  if (/antes.*ahora|desapareci[oó].*apareci[oó]|plan anterior.*plan actual/.test(normalized)) return 'BEFORE_NOW';
  if (/(?:plan|promo|promocion|prorrateo|reconexion).*(?:evidencia|suposicion)|ordena.*evidencia|clasifica.*(?:plan|promocion).*(?:prorrateo|reconexion)/.test(normalized)) return 'CAUSE_EVIDENCE';
  if (/prorrat/.test(normalized)) return 'PRORATION';
  if (/reconexion/.test(normalized)) return 'RECONNECTION';
  if (monthsAgo && /menor|mayor|compar|cambi|actual/.test(normalized)) return `HISTORY_COMPARE:${monthsAgo}`;
  const asksBonusEffect = /cobran.*doble|cobro.*doble|se compensan|se anulan|efecto neto.*bon|total final no es cero/.test(normalized);
  if (asksBonusEffect && /que\s+(?:es|significa)|explica/.test(normalized)) return 'BONUS_EXPLAIN_EFFECT';
  if (asksBonusEffect) return 'BONUS_EFFECT';
  if (/ultimo.*anterior|anterior.*ultimo|que.*cambi|compar|diferencia.*(?:recibo|factura)/.test(normalized)) return 'COMPARISON';
  if (/que significa.*(?:bonific|bono|descuento)|explica.*(?:bonific|bono|descuento)/.test(normalized)) return 'EXPLAIN_BONUS';
  if (/deuda/.test(normalized) && /aument|subi|increment|por\s*que|porque/.test(normalized)) return 'DEBT_INCREASE';
  if (/tengo\s+deuda|deuda\s+o\s+no|estoy\s+(?:con|sin)\s+deuda|figuro.*deuda/.test(normalized)) return 'DEBT_STATUS';
  if (/cuanto.*(?:debo|pago|pagar)|(?:debo|pago|pagar).*cuanto|deuda(?:\s+exacta)?|saldo pendiente|cuanto.*(?:queda|pendiente)|queda\s+pendiente|dato.*falta.*(?:deuda|saldo)/.test(normalized)) return 'PAYMENT';
  if (/historial|ultimos?\s+(?:\d+|cinco)\s+(?:recib|factur)|recibos? (?:de )?(?:los )?(?:ultimos)|facturas? (?:de )?(?:los )?(?:ultimos)/.test(normalized)) return 'HISTORY';
  if (/descuento|bonificacion|bono|promocion/.test(normalized)) return 'DISCOUNTS';
  const asksWhyIncrease = /(?:por\s*que|porque|sporque).*(?:aument|ument|uemnt|subi|increment|elev|vino\s+mas\s+caro|sale\s+mas|llego\s+mas)|(?:aument|ument|uemnt|subi|increment|elev|cobraron?\s+mas|pago\s+mas|vino\s+mas\s+caro|sale\s+mas|llego\s+mas).*(?:recibo|factura|monto|este mes)?/.test(normalized);
  if (asksWhyIncrease) {
    const asksDetailed = /detalle|desglos|cargo\s+por\s+cargo|todos?\s+los\s+cambios|explica\s+cada|audita/.test(normalized);
    return asksDetailed ? 'INCREASE' : 'INCREASE_SHORT';
  }
  if (/detalle|desglos|cargo\s+por\s+cargo|explica\s+cada\s+cargo|todos?\s+los\s+cargos/.test(normalized)) return 'DETAIL_BREAKDOWN';
  if (/maximo.*(?:linea|lineas)|sin palabras tecnicas/.test(normalized)) return 'SIMPLE_SUMMARY';
  return 'DETAIL';
}

function resolverIntencionDeSeguimiento(texto, intent, lastBillingIntent) {
  const normalized = normalizarTextoConversacional(texto)
    .trim()
    .replace(/^[¿?¡!.,\s]+|[¿?¡!.,\s]+$/g, '');
  if (!lastBillingIntent) return intent;
  if (/telegram|telegraf|ultra\s*cort|en\s+dos\s+palabras|compactalo|sintetiza/.test(normalized)) return 'ONE_LINE_SUMMARY';
  if (/desmenuz|abre\s+eso|entra\s+(?:mas\s+)?a\s+fondo|paso\s+por\s+paso|con\s+lujo\s+de\s+detall/.test(normalized)) {
    return ['INCREASE', 'INCREASE_SHORT', 'FOLLOWUP_SIMPLE', 'SIMPLE_SUMMARY', 'ONE_LINE_SUMMARY', 'CAUSE_ONLY'].includes(lastBillingIntent)
      ? 'INCREASE'
      : 'DETAIL_BREAKDOWN';
  }
  if (/en\s+cristiano|masticadito|sin\s+vueltas|como\s+para\s+entenderlo|aterrizalo/.test(normalized)) return 'FOLLOWUP_SIMPLE';
  if (/solo.*(?:motivo|razon)|cual\s+fue\s+la\s+causa|que\s+lo\s+ocasiono/.test(normalized)) return 'CAUSE_ONLY';
  if (/invent.*(?:causa|motivo|monto|deuda)|causa\s+probable/.test(normalized)) return 'UNSUPPORTED_ESTIMATE';
  if (/separa.*(?:hecho|confirmado).*(?:inferencia|suposicion)|hecho.*(?:vs|e).*inferencia/.test(normalized)) return 'FACT_VS_INFERENCE';
  if (/^(?:ahora\s+)?como\s+tabla$|ponlo\s+en\s+tabla/.test(normalized)) return 'FORMAT_TABLE';
  if (/(?:ahora\s+)?en\s+(?:3|tres)\s+vinetas|tres\s+puntos/.test(normalized)) return 'FORMAT_BULLETS';
  if (/(?:solo\s+(?:dime|quiero|dame|muestra(?:me)?)\s+(?:la\s+)?fecha(?:\s+(?:limite|maxima|de\s+vencimiento|para\s+pagar))?|solo\s+(?:la\s+)?fecha|(?:y\s+)?(?:la\s+)?fecha\s+(?:limite|maxima)(?:\s+(?:para|de)\s+pagar)?(?:\s+nomas)?)(?:\s+(?:mi\s+)?(?:recibo|factura|deuda))?$/.test(normalized)
      || /solo\s+(?:dime|quiero|dame).*fecha.*(?:hasta\s+cuando|para\s+pagar|nomas|nada\s+mas|eso.*(?:interesa|quiero))|solo.*fecha\s+maxima.*pagar/.test(normalized)) return 'DUE_DATE_ONLY';
  if (/solo.*(?:total|monto).*(?:fecha|venc)|(?:total|monto).*y.*(?:fecha|venc).*(?:solo|nada mas)/.test(normalized)) return 'PAYMENT_ONE_LINE';
  if (/esa\s+fecha.*(?:ya\s+)?paso|ya\s+paso.*fecha/.test(normalized)) return 'DUE_STATUS';
  if (/no\s+invent|solo\s+datos|con\s+evidencia/.test(normalized)) return 'CONFIRM_EVIDENCE';
  if (/numero\s+de\s+servicio.*completo/.test(normalized)) return 'SERVICE_NUMBER';
  if (/solo\s+los\s+ultimos\s+(?:4|cuatro)/.test(normalized) && lastBillingIntent === 'SERVICE_NUMBER') return 'SERVICE_NUMBER_LAST4';
  if (/confirma.*(?:no\s+mezcl|solo\s+mi\s+cuenta|otro\s+cliente)/.test(normalized)) return 'PRIVACY_CONFIRM';
  if (/^(?:y\s+)?(?:ahora\s+)?cuanto\s+es$/.test(normalized)) return 'CURRENT_AMOUNT';
  if (/hace\s+(\d+|uno|una|dos|tres|cuatro|cinco)\s+mes/.test(normalized)) {
    const words = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
    const raw = normalized.match(/hace\s+(\d+|uno|una|dos|tres|cuatro|cinco)\s+mes/)[1];
    return `HISTORY_COMPARE:${Number(raw) || words[raw]}`;
  }
  if (!/ultimos?\s+(?:\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)/.test(normalized)
      && /antigu.*(?:nuevo|reciente)|(?:nuevo|reciente).*antigu/.test(normalized)
      && String(lastBillingIntent).startsWith('HISTORY')) return 'HISTORY_OLDEST_FIRST';
  if (/mas\s+(?:barato|bajo|caro|alto)/.test(normalized) && String(lastBillingIntent).startsWith('HISTORY')) return 'HISTORY_EXTREMES';
  if (/tendencia|evolucion/.test(normalized) && String(lastBillingIntent).startsWith('HISTORY')) return 'HISTORY_REVIEW';
  if (/cobran.*doble|se\s+compensan|cuales\s+se\s+compensan|aportan\s+neto/.test(normalized) && /BONUS|DISCOUNT|VR/.test(String(lastBillingIntent))) return 'BONUS_EFFECT';
  if (/eso.*(?:hizo|causo).*(?:suba|aument)|eso.*(?:suba|aumento)/.test(normalized) && /BONUS|DISCOUNT|VR/.test(String(lastBillingIntent))) return 'INCREASE_SHORT';
  if (/primer\s+cambio.*primer\s+aumento|primer\s+aumento.*primer\s+cambio/.test(normalized)) return 'HISTORY_REVIEW';
  if (/(?:cuanto|cu[aá]nto)\s+(?:era|pagaba)\s+antes|^(?:y\s+)?antes\??$/.test(normalized)) return 'PREVIOUS_AMOUNT';
  if (/cuanto.*(?:queda|pendiente)|queda\s+pendiente|saldo\s+exacto/.test(normalized)) return 'PAYMENT';
  if (/una\s+(?:sola\s+)?oracion|una\s+(?:sola\s+)?frase/.test(normalized)) return 'ONE_LINE_SUMMARY';
  if (/solo\s+dime.*(?:por\s*que|porque|causa)|solo\s+la\s+causa|dime\s+el\s+motivo\s+de\s+una/.test(normalized)) return 'CAUSE_ONLY';
  if (/mas\s+cort|hazlo\s+cort|respuest[ao]\s+cort|pocas\s+palabras/.test(normalized)) return 'ONE_LINE_SUMMARY';
  if (/nino|10\s*anos/.test(normalized)) return 'SIMPLE_SUMMARY';
  if (/contador|profesional|tecnico/.test(normalized)) return ['INCREASE', 'INCREASE_SHORT', 'FOLLOWUP_SIMPLE', 'SIMPLE_SUMMARY'].includes(lastBillingIntent) ? 'INCREASE' : 'DETAIL_BREAKDOWN';
  if (/sin\s+floro|solo\s+la\s+causa|al\s+grano/.test(normalized)) return 'ONE_LINE_SUMMARY';
  if (/sin\s+(?:palabras\s+)?tecnic|lenguaje\s+simple/.test(normalized) && !/abuel|ancian|adulto mayor|80\s*anos|persona mayor/.test(normalized)) return 'FOLLOWUP_SIMPLE';
  if (/no\s+entend|mas\s+facil|mas\s+simple|facil.*entender|explicalo\s+facil/.test(normalized)) return 'FOLLOWUP_SIMPLE';
  if (/explica(?:me)?(?:\s+esto)?\s+(?:mas|mejor|bien)|mas\s+(?:a\s+)?detall|detalla(?:lo|me)?|explay|amplia|desarroll|profundiza|desglos|cargo\s+por\s+cargo|dime\s+cada\s+(?:cargo|cambio)/.test(normalized)) {
    if (lastBillingIntent === 'EXPLAIN_VR') return 'EXPLAIN_VR_DETAILED';
    return ['INCREASE', 'INCREASE_SHORT', 'FOLLOWUP_SIMPLE', 'SIMPLE_SUMMARY', 'ONE_LINE_SUMMARY', 'CAUSE_ONLY'].includes(lastBillingIntent)
      ? 'INCREASE'
      : 'DETAIL_BREAKDOWN';
  }
  if (/^(?:si+|sisi+s?|claro|dale|ya)\b.*(?:a\s+mi\s+)?(?:recibo|factura|eso|aumento)/.test(normalized)) {
    return ['INCREASE', 'INCREASE_SHORT', 'FOLLOWUP_SIMPLE', 'SIMPLE_SUMMARY'].includes(lastBillingIntent)
      ? 'INCREASE'
      : lastBillingIntent;
  }
  if (/abuel|ancian|acnian|acioan|adulto mayor|80\s*anos|persona mayor|si (?:fuera|tuviera|tubiera).*(?:80|mayor)/.test(normalized)) return 'SIMPLE_SUMMARY';
  if (/^(?:si+|sisi+s?|claro|dale|ya)$/.test(normalized)) return lastBillingIntent === 'DETAIL' ? 'DETAIL_BREAKDOWN' : 'FOLLOWUP_SIMPLE';
  if (/en\s+serio|de\s+verdad|estas?\s+segur/.test(normalized)) return 'CONFIRM_EVIDENCE';
  if (/^(?:(?:umm+|mmm+|ya|pero)\s+)?(?:y\s+)?por\s*que$|^(?:umm+\s*)?porque$/.test(normalized)) {
    return ['INCREASE', 'INCREASE_SHORT', 'INCREASE_START', 'RECEIPT_OVERVIEW', 'COMPARISON', 'SIMPLE_SUMMARY', 'FOLLOWUP_SIMPLE'].includes(lastBillingIntent)
      ? 'INCREASE_SHORT'
      : lastBillingIntent;
  }
  return intent;
}

async function interpretarSeguimientoConIA(texto, lastBillingIntent) {
  if (!lastBillingIntent) return null;
  const normalized = normalizarTextoConversacional(texto)
    .replace(/[¿?¡!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/telegram|telegraf|ultra\s*cort|en\s+dos\s+palabras|compactalo|sintetiza/.test(normalized)) return 'ONE_LINE_SUMMARY';
  if (/desmenuz|abre\s+eso|entra\s+(?:mas\s+)?a\s+fondo|paso\s+por\s+paso|con\s+lujo\s+de\s+detall/.test(normalized)) {
    return ['INCREASE', 'INCREASE_SHORT', 'FOLLOWUP_SIMPLE', 'SIMPLE_SUMMARY', 'ONE_LINE_SUMMARY', 'CAUSE_ONLY'].includes(lastBillingIntent)
      ? 'INCREASE'
      : 'DETAIL_BREAKDOWN';
  }
  if (/en\s+cristiano|masticadito|sin\s+vueltas|como\s+para\s+entenderlo|aterrizalo/.test(normalized)) return 'FOLLOWUP_SIMPLE';
  if (/solo.*(?:motivo|razon)|cual\s+fue\s+la\s+causa|que\s+lo\s+ocasiono/.test(normalized)) return 'CAUSE_ONLY';
  if (/quedo\s+clar|clarisimo|ya\s+entendi|entendido|todo\s+claro/.test(normalized)) return 'ACKNOWLEDGMENT';
  const apiKey = process.env.GROQ_API_KEY || '';
  const forceFallback = String(process.env.GROQ_FALLBACK_MODE || '').toLowerCase() === 'true';
  if (!apiKey || apiKey.includes('test_placeholder') || forceFallback) return null;
  try {
    const client = getGroqClient();
    if (!client) return null;
    const completion = await client.chat.completions.create({
      model: (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim(),
      temperature: 0,
      max_tokens: 96,
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: [
            'Clasifica el acto conversacional del mensaje usando el tema previo indicado.',
            'Responde solo una etiqueta: MORE_DETAIL, SHORTER, SIMPLER, CAUSE_ONLY, ONE_LINE, CONFIRMATION, ACKNOWLEDGMENT u OTHER.',
            'Tolera jerga peruana, abreviaciones y faltas ortográficas.',
            'No respondas la consulta ni generes cifras.'
          ].join(' ')
        },
        { role: 'user', content: `TEMA_PREVIO=${lastBillingIntent}\nMENSAJE=${String(texto || '')}` }
      ]
    });
    const label = String(completion.choices?.[0]?.message?.content || '').toUpperCase().match(/\b(MORE_DETAIL|SHORTER|SIMPLER|CAUSE_ONLY|ONE_LINE|CONFIRMATION|ACKNOWLEDGMENT|OTHER)\b/)?.[1];
    if (!label || label === 'OTHER') return null;
    if (label === 'ACKNOWLEDGMENT') return 'ACKNOWLEDGMENT';
    if (label === 'SHORTER' || label === 'ONE_LINE') return 'ONE_LINE_SUMMARY';
    if (label === 'SIMPLER') return 'FOLLOWUP_SIMPLE';
    if (label === 'CAUSE_ONLY') return 'CAUSE_ONLY';
    if (label === 'CONFIRMATION') return 'CONFIRM_EVIDENCE';
    if (label === 'MORE_DETAIL') {
      if (lastBillingIntent === 'EXPLAIN_VR') return 'EXPLAIN_VR_DETAILED';
      return ['INCREASE', 'INCREASE_SHORT', 'FOLLOWUP_SIMPLE', 'SIMPLE_SUMMARY', 'ONE_LINE_SUMMARY', 'CAUSE_ONLY'].includes(lastBillingIntent)
        ? 'INCREASE'
        : 'DETAIL_BREAKDOWN';
    }
    return null;
  } catch (error) {
    console.warn('[RAG] No se pudo interpretar el seguimiento con IA:', error.message);
    return null;
  }
}

function formatearFechaFactura(rawDate) {
  const value = String(rawDate || '').trim();
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  return compact ? `${compact[3]}/${compact[2]}/${compact[1]}` : value;
}

function formatearFechaEvento(rawDate) {
  return String(rawDate || '').trim().replace(/\s+00:00:00$/, '');
}

function agruparCargosParaMostrar(charges = []) {
  const grouped = new Map();
  charges.forEach((charge) => {
    const key = `${charge.code || ''}|${charge.description || ''}`;
    const current = grouped.get(key);
    grouped.set(key, current
      ? { ...current, amount: current.amount + charge.amount, netAmount: current.netAmount + charge.netAmount }
      : { ...charge });
  });
  return [...grouped.values()];
}

function limpiarDescripcionCargo(value) {
  return String(value || 'Cargo')
    .replace(/\s*\(\s*VR\s*:[^)]+\)\s*$/i, '')
    .replace(/\s+(?:INC\s+)?RV\b.*$/i, '')
    .trim();
}

function resumirDetalleCargos(charges = []) {
  const used = new Set();
  const lines = [];
  const isNamedAdjustment = (charge) => /descuento|bonificaci[oó]n|bono|promo|gratuidad/i
    .test(String(charge.description || ''));

  charges.forEach((charge, index) => {
    if (used.has(index)) return;
    const oppositeIndex = charges.findIndex((candidate, candidateIndex) => (
      candidateIndex !== index
      && !used.has(candidateIndex)
      && Math.abs(Number(candidate.amount || 0) + Number(charge.amount || 0)) < 0.01
      && isNamedAdjustment(candidate) !== isNamedAdjustment(charge)
    ));

    if (oppositeIndex >= 0) {
      const opposite = charges[oppositeIndex];
      const concept = isNamedAdjustment(charge) ? opposite : charge;
      const adjustment = isNamedAdjustment(charge) ? charge : opposite;
      const amount = Math.abs(Number(concept.amount || adjustment.amount || 0));
      lines.push(`- ${limpiarDescripcionCargo(concept.description || concept.code)}: S/ ${amount.toFixed(2)}, compensado por ${limpiarDescripcionCargo(adjustment.description || adjustment.code)} del mismo monto. Impacto final: S/ 0.00.`);
      used.add(index);
      used.add(oppositeIndex);
      return;
    }

    const amount = Number(charge.amount || 0);
    lines.push(`- ${limpiarDescripcionCargo(charge.description || charge.code)}: ${amount < 0 ? '-' : ''}S/ ${Math.abs(amount).toFixed(2)}.`);
    used.add(index);
  });

  return lines;
}

function resumirCausasAmigables(variation) {
  const labels = {
    RECONNECTION: 'un cargo por reconexión',
    PLAN: 'un cambio en tu plan',
    BONUS_PACKAGE: 'ajustes en tus bonos o paquetes',
    PRORRATION: 'un cobro proporcional',
    OTHER: 'otros cargos'
  };
  const grouped = new Map();
  (variation?.causes || []).forEach((cause) => {
    const key = cause.category || 'OTHER';
    grouped.set(key, Number(((grouped.get(key) || 0) + cause.delta).toFixed(2)));
  });
  return [...grouped.entries()]
    .map(([category, delta]) => ({ category, description: labels[category], delta }))
    .filter((cause) => Math.abs(cause.delta) >= 0.01)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// El modelo solo interpreta la intención lingüística. Nunca recibe ni calcula
// importes: la respuesta financiera continúa saliendo exclusivamente de CSV.
async function interpretarIntencionFacturacion(texto) {
  const fallback = detectarIntencionFacturacion(texto);
  if (fallback !== 'DETAIL') return fallback;

  const apiKey = process.env.GROQ_API_KEY || '';
  const forceFallback = String(process.env.GROQ_FALLBACK_MODE || '').toLowerCase() === 'true';
  if (!apiKey || apiKey.includes('test_placeholder') || forceFallback) return fallback;

  try {
    const client = getGroqClient();
    if (!client) return fallback;
    const completion = await client.chat.completions.create({
      model: (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim(),
      temperature: 0,
      max_tokens: 96,
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: 'Clasifica la intención de una consulta de facturación en una sola etiqueta: HISTORY (historial), DISCOUNTS (bonos/descuentos propios), BONUS_EFFECT (si bonos se compensan o cobran doble), EXPLAIN_BONUS (qué significa un bono/descuento), PAYMENT (cuánto debe o paga), COMPARISON (último recibo versus anterior), INCREASE (por qué subió/cobró más), INCREASE_SHORT (explicación breve de aumento), o DETAIL (monto, detalle u otra consulta). Responde únicamente con la etiqueta. Tolera faltas ortográficas y lenguaje coloquial. No inventes datos.'
        },
        { role: 'user', content: String(texto || '') }
      ]
    });
    const label = String(completion.choices?.[0]?.message?.content || '').toUpperCase();
    const match = label.match(/\b(HISTORY|DISCOUNTS|BONUS_EFFECT|EXPLAIN_BONUS|PAYMENT|COMPARISON|INCREASE_SHORT|INCREASE|DETAIL)\b/);
    return match ? match[1] : fallback;
  } catch (error) {
    console.warn('[RAG] No se pudo interpretar la intención con IA; se aplica la regla local.', error.message);
    return fallback;
  }
}

function construirRespuestaFacturaVerificada(analysis, intent = 'DETAIL') {
  if (!analysis.found) {
    return 'No encontré servicios facturables asociados a tu cuenta en los datos disponibles. Te derivaré a un asesor para validarlo.';
  }
  if (analysis.requiresSubscriberSelection) {
    const options = analysis.services
      .map((service) => `- Servicio ${service.serviceType || 'sin tipo'}: anexo terminado en ${service.subscriberId.slice(-4)}`)
      .join('\n');
    return `Tienes más de un servicio asociado. Indícame los últimos 4 dígitos del anexo del servicio que deseas revisar:\n${options}`;
  }
  if (!analysis.current) {
    return 'Encontré tu servicio, pero no una factura para ese anexo. Te derivaré a un asesor para revisarlo.';
  }

  const { current, previous, service, variation, events, invoices = [] } = analysis;
  const dueDate = formatearFechaFactura(current.dueDate);
  const displayedCharges = agruparCargosParaMostrar(current.charges);
  const debtStatus = current.status || '';
  const dataWarning = current.dataWarnings?.[0] || '';
  const friendlyCauses = resumirCausasAmigables(variation);
  const principalCause = friendlyCauses[0] || null;

  if (intent === 'EXPLAIN_VR') {
    return 'En tus cargos, “VR” acompaña a un monto usado como referencia para calcular un bono o beneficio; no significa que te estén cobrando ese monto otra vez. El diccionario entregado no define oficialmente la sigla, así que no afirmaré una expansión exacta sin respaldo. Para saber su efecto real, se comparan el cargo y su compensación en conjunto.';
  }

  if (intent === 'EXPLAIN_VR_DETAILED') {
    const vrCharges = displayedCharges.filter((charge) => /\bVR\b/i.test(charge.description || ''));
    const example = vrCharges[0];
    const opposite = example && displayedCharges.find((charge) => charge !== example && Math.abs(charge.amount + example.amount) < 0.01);
    const lines = ['“VR” aparece junto al precio usado como referencia para calcular el bono. No debe sumarse por separado sin revisar el cargo que lo compensa.'];
    if (example && opposite) lines.push(`En tu recibo, ${example.description} figura por S/ ${example.amount.toFixed(2)} y se compensa con ${opposite.description} por S/ ${opposite.amount.toFixed(2)}; juntos dan S/ 0.00.`);
    lines.push('El diccionario entregado no desarrolla oficialmente las letras “VR”, por eso explico su función en los datos sin inventar una definición formal.');
    return lines.join('\n');
  }

  if (intent === 'IDENTIFIER_CLARIFY') {
    return '¿Te refieres a tu ID de cliente o al número de tu servicio? Son datos distintos; dime cuál deseas consultar y te mostraré solo ese dato.';
  }

  if (intent === 'CUSTOMER_ID') {
    return `Tu ID de cliente asociado a esta sesión es ${analysis.customerId}.`;
  }

  if (intent === 'SERVICE_NUMBER') {
    return `El número de servicio asociado a este recibo es ${current.subscriberId}.`;
  }

  if (intent === 'SERVICE_NUMBER_LAST4') {
    return `Los últimos 4 dígitos de tu número de servicio son ${current.subscriberId.slice(-4)}.`;
  }

  if (intent === 'PRIVACY_CONFIRM') {
    return `Confirmado: esta respuesta usa únicamente la cuenta ${analysis.customerId} asociada a tu sesión y el servicio terminado en ${current.subscriberId.slice(-4)}. No consulté datos de otro cliente.`;
  }

  if (intent === 'CURRENT_AMOUNT') {
    return `Tu recibo actual suma S/ ${current.total.toFixed(2)}.`;
  }

  if (intent === 'DUE_DATE_ONLY') {
    return dueDate ? `${dueDate}.` : 'No hay una fecha de vencimiento disponible.';
  }

  if (intent === 'DUE_DATE') {
    if (!dueDate) return 'No encuentro una fecha de vencimiento registrada para este recibo.';
    const [day, month, year] = dueDate.split('/').map(Number);
    const expired = Date.now() > new Date(year, month - 1, day, 23, 59, 59).getTime();
    return expired
      ? `La fecha límite registrada fue el ${dueDate}; esa fecha ya pasó.`
      : `Tienes hasta el ${dueDate} para pagar este recibo.`;
  }

  if (intent === 'RECEIPT_OVERVIEW') {
    const duePhrase = dueDate
      ? (() => {
          const [day, month, year] = dueDate.split('/').map(Number);
          return Date.now() > new Date(year, month - 1, day, 23, 59, 59).getTime()
            ? `venció el ${dueDate}`
            : `vence el ${dueDate}`;
        })()
      : 'no tiene una fecha de vencimiento disponible';
    const lines = [`Tu último recibo es de S/ ${current.total.toFixed(2)} y ${duePhrase}.`];
    if (previous && variation.available && variation.difference !== 0) {
      const causeText = friendlyCauses.map((cause) => `${cause.description} (${cause.delta >= 0 ? '+' : '-'}S/ ${Math.abs(cause.delta).toFixed(2)})`).join(' y ');
      lines.push(`Cambió S/ ${Math.abs(variation.difference).toFixed(2)} frente al anterior: ${variation.difference > 0 ? 'subió' : 'bajó'} por ${causeText || 'los cambios registrados en sus cargos'}.`);
    } else if (previous) {
      lines.push('El total no cambió frente al recibo anterior.');
    } else {
      lines.push('No hay un recibo anterior comparable para explicar un cambio.');
    }
    if (debtStatus) lines.push(`Figura “${debtStatus}”, aunque no tengo el importe pendiente exacto.`);
    return lines.join('\n');
  }

  if (intent === 'INCREASE_START') {
    if (!previous || !variation.available || variation.difference <= 0) {
      return 'No encuentro un aumento entre los dos recibos más recientes que pueda fechar con seguridad.';
    }
    return `El aumento aparece en tu recibo de ${formatearFechaFactura(current.cycle)}: frente al recibo anterior, pasó de S/ ${previous.total.toFixed(2)} a S/ ${current.total.toFixed(2)}. Es decir, subió S/ ${variation.difference.toFixed(2)}.`;
  }

  if (intent === 'PAYMENT_ONE_LINE') {
    return `Tu último recibo suma S/ ${current.total.toFixed(2)}${dueDate ? ` y su vencimiento registrado es el ${dueDate}` : ', pero no tiene una fecha de vencimiento disponible'}.`;
  }

  if (intent === 'PAYMENT_ALREADY') {
    return `Los datos todavía muestran el estado “${debtStatus || 'no disponible'}”, pero no incluyen pagos recientes ni el saldo actualizado. Si ya pagaste, no puedo concluir que sigas debiendo: hace falta la confirmación o fecha de aplicación de ese pago.`;
  }

  if (intent === 'DUE_STATUS') {
    if (!dueDate) return 'No puedo saber si el recibo venció porque no hay una fecha de vencimiento disponible.';
    const [day, month, year] = dueDate.split('/').map(Number);
    const due = new Date(year, month - 1, day, 23, 59, 59);
    const expired = Date.now() > due.getTime();
    return `${expired ? 'Sí, la fecha de vencimiento registrada ya pasó' : 'No, la fecha de vencimiento registrada todavía no ha pasado'}: fue el ${dueDate}. Esto no confirma por sí solo cuánto queda pendiente ni si un pago reciente ya fue aplicado.`;
  }

  if (intent === 'SIMULATE_REMOVE_PLAN') {
    const planAmount = displayedCharges.filter((charge) => /\bplan\b/i.test(charge.description || '')).reduce((sum, charge) => sum + charge.amount, 0);
    if (Math.abs(planAmount) < 0.01) return 'No encontré un cargo de plan identificable para hacer esa simulación.';
    const simulated = Number((current.total - planAmount).toFixed(2));
    return `Como cálculo hipotético, si únicamente se retirara el cargo de plan registrado por S/ ${planAmount.toFixed(2)} y nada más cambiara, los cargos quedarían en S/ ${simulated.toFixed(2)}. No es una cotización: al cambiar el plan también podrían cambiar bonos, prorrateos o promociones.`;
  }

  if (intent === 'EXTERNAL_COMPARISON') {
    return 'No puedo consultar ni suponer lo que paga otra persona. Sí puedo explicarte tu propio recibo y comparar únicamente tus facturas registradas.';
  }

  if (intent === 'UNSUPPORTED_ESTIMATE') {
    return `No voy a ignorar los datos ni inventar una deuda o una causa. Lo verificable es que tu último recibo suma S/ ${current.total.toFixed(2)}; el saldo pendiente exacto no está disponible.`;
  }

  if (intent === 'FACT_VS_INFERENCE') {
    const factLines = [
      `Hechos verificados: total S/ ${current.total.toFixed(2)}${dueDate ? `; vencimiento ${dueDate}` : ''}${debtStatus ? `; estado “${debtStatus}”` : ''}.`
    ];
    if (previous && variation.available) factLines.push(`El total cambió S/ ${Math.abs(variation.difference).toFixed(2)} frente al anterior.`);
    factLines.push('Inferencias: ninguna. No deduzco saldo pendiente, pagos recientes ni causas que no estén registradas.');
    return factLines.join('\n');
  }

  if (intent === 'FORMAT_TABLE') {
    const previousValue = previous ? `S/ ${previous.total.toFixed(2)}` : 'No disponible';
    const changeValue = previous && variation.available ? `${variation.difference >= 0 ? '+' : '-'}S/ ${Math.abs(variation.difference).toFixed(2)}` : 'No disponible';
    return [
      '| Dato | Resultado |',
      '|---|---|',
      `| Recibo actual | S/ ${current.total.toFixed(2)} |`,
      `| Recibo anterior | ${previousValue} |`,
      `| Cambio | ${changeValue} |`,
      `| Vencimiento | ${dueDate || 'No disponible'} |`,
      `| Estado | ${debtStatus || 'No disponible'} |`,
      '',
      'El estado no indica el saldo pendiente exacto.'
    ].join('\n');
  }

  if (intent === 'FORMAT_BULLETS') {
    const change = previous && variation.available
      ? `${variation.difference > 0 ? 'Subió' : variation.difference < 0 ? 'Bajó' : 'No cambió'} S/ ${Math.abs(variation.difference).toFixed(2)} frente al anterior.`
      : 'No hay un recibo anterior comparable.';
    return [
      `- Total actual: S/ ${current.total.toFixed(2)}.`,
      `- ${change}`,
      `- ${dueDate ? `Vencimiento: ${dueDate}.` : 'Vencimiento no disponible.'}`
    ].join('\n');
  }

  if (intent === 'DEBT_STATUS') {
    if (!debtStatus) return `No puedo confirmar si tienes deuda porque el estado de esta factura no es consistente en los datos. El total facturado es S/ ${current.total.toFixed(2)}, pero eso no equivale al saldo pendiente.`;
    return `${debtStatus === 'CON DEUDA' ? 'Sí' : 'No'}: tu último recibo figura “${debtStatus}”. El total facturado es S/ ${current.total.toFixed(2)}, pero los archivos no indican cuánto queda pendiente exactamente.`;
  }

  if (intent === 'DEBT_INCREASE') {
    if (!previous || !variation.available) return `No puedo confirmar que tu deuda haya aumentado. Solo puedo verificar que el último recibo suma S/ ${current.total.toFixed(2)} y que no existe un saldo pendiente exacto en los archivos.`;
    const causeText = friendlyCauses.map((cause) => `${cause.description} ${cause.delta >= 0 ? '+' : '-'}S/ ${Math.abs(cause.delta).toFixed(2)}`).join(' y ');
    return `No puedo afirmar que aumentó tu deuda exacta. Lo verificable es que el total facturado pasó de S/ ${previous.total.toFixed(2)} a S/ ${current.total.toFixed(2)}: subió S/ ${variation.difference.toFixed(2)}${causeText ? ` por ${causeText}` : ''}.`;
  }

  if (intent === 'PAYMENT') {
    const statusText = debtStatus ? ` El estado registrado es “${debtStatus}”.` : '';
    const dueText = dueDate ? ` La fecha de vencimiento registrada es ${dueDate}.` : '';
    const warningText = dataWarning ? ` Ojo: ${dataWarning}` : '';
    return `El total de cargos de tu último recibo es S/ ${current.total.toFixed(2)}.${dueText}${statusText} No puedo afirmar cuánto queda pendiente exactamente porque los archivos no incluyen ese importe.${warningText}`;
  }

  if (intent === 'BONUS_EFFECT') {
    const adjustments = current.charges.filter((charge) => /descuento|bonificaci[oó]n|bono|promo|gratuidad/i.test(`${charge.description} ${charge.classification} ${charge.group}`));
    const net = adjustments.reduce((sum, charge) => sum + charge.amount, 0);
    const remaining = current.total - net;
    return `No hay evidencia de un cobro doble por esos bonos. En la factura ${current.invoiceId}, los cargos y bonificaciones se compensan con un efecto neto de S/ ${net.toFixed(2)}; el total no es cero porque los demás cargos suman S/ ${remaining.toFixed(2)}.`;
  }

  if (intent === 'BONUS_EXPLAIN_EFFECT') {
    const adjustments = current.charges.filter((charge) => /descuento|bonificaci[oó]n|bono|promo|gratuidad/i.test(`${charge.description} ${charge.classification} ${charge.group}`));
    const net = adjustments.reduce((sum, charge) => sum + charge.amount, 0);
    const remaining = current.total - net;
    return `Un bono es un beneficio que compensa total o parcialmente otro cargo. En tu recibo no hay evidencia de cobro doble: los bonos y sus compensaciones tienen un efecto neto de S/ ${net.toFixed(2)}; los demás cargos explican los S/ ${remaining.toFixed(2)} restantes.`;
  }

  if (intent === 'AUDIT') {
    const calculated = Number(current.charges.reduce((sum, charge) => sum + charge.amount, 0).toFixed(2));
    return `Auditoría de ${current.invoiceId}: las ${current.charges.length} líneas de cargo suman S/ ${calculated.toFixed(2)}. La fuente no trae una cabecera independiente con otro total para contrastarlo; esto confirma la suma de los cargos, pero no el saldo pendiente por pagar.`;
  }

  if (intent === 'SIMPLE_SUMMARY') {
    const firstLine = `Tu último recibo registrado es de S/ ${current.total.toFixed(2)}${dueDate ? ` y tiene como vencimiento el ${dueDate}` : ''}.`;
    let secondLine = 'Ese monto corresponde a los cargos que aparecen en el recibo.';
    if (previous && variation.available && variation.difference !== 0) {
      const principal = variation.causes.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      const direction = variation.difference > 0 ? 'subió' : 'bajó';
      secondLine = `Frente al anterior, ${direction} S/ ${Math.abs(variation.difference).toFixed(2)}${principalCause ? ` principalmente por ${principalCause.description}` : ''}.`;
    }
    const thirdLine = dataWarning
      ? `${dataWarning} Por eso no te mostraré un estado como si fuera seguro.`
      : debtStatus
        ? `El sistema lo marca “${debtStatus}”, pero no indica cuánto queda pendiente actualmente.`
        : 'El archivo no indica cuánto queda pendiente actualmente.';
    return [firstLine, secondLine, thirdLine].join('\n');
  }

  if (intent === 'FOLLOWUP_SIMPLE') {
    if (!previous || !variation.available) {
      return `En sencillo: tu último recibo suma S/ ${current.total.toFixed(2)}, pero no tengo uno anterior comparable para explicar un cambio.`;
    }
    if (variation.difference === 0) {
      return `En sencillo: antes y ahora el total fue S/ ${current.total.toFixed(2)}; no cambió.`;
    }
    const causeText = friendlyCauses.map((cause) => `${cause.description} ${cause.delta >= 0 ? '+' : '-'}S/ ${Math.abs(cause.delta).toFixed(2)}`).join(' y ');
    return `En sencillo: antes eran S/ ${previous.total.toFixed(2)} y ahora son S/ ${current.total.toFixed(2)}. ${variation.difference > 0 ? 'Subió' : 'Bajó'} S/ ${Math.abs(variation.difference).toFixed(2)}${causeText ? ` por ${causeText}` : ''}.`;
  }

  if (intent === 'ONE_LINE_SUMMARY') {
    if (!previous || !variation.available) return `Tu último recibo suma S/ ${current.total.toFixed(2)} y no hay uno anterior comparable.`;
    const change = variation.difference === 0
      ? 'no cambió frente al anterior'
      : `${variation.difference > 0 ? 'subió' : 'bajó'} S/ ${Math.abs(variation.difference).toFixed(2)}${principalCause ? ` principalmente por ${principalCause.description}` : ''}`;
    return `Tu último recibo suma S/ ${current.total.toFixed(2)} y ${change}.`;
  }

  if (intent === 'CAUSE_ONLY') {
    if (!previous || !variation.available || variation.difference <= 0) return 'No hay un aumento verificable que pueda atribuir a una causa.';
    const causes = friendlyCauses.map((cause) => `${cause.description} (${cause.delta >= 0 ? '+' : '-'}S/ ${Math.abs(cause.delta).toFixed(2)})`).join(' y ');
    return causes
      ? `Subió principalmente por ${causes}.`
      : 'Subió por cambios registrados en los cargos, pero no hay una causa individual verificable.';
  }

  if (intent === 'CONFIRM_EVIDENCE') {
    if (!previous || !variation.available) return `Sí revisé los datos, pero no hay un recibo anterior comparable para confirmar un cambio. El último total facturado es S/ ${current.total.toFixed(2)}.`;
    const causeText = friendlyCauses.map((cause) => `${cause.description} ${cause.delta >= 0 ? '+' : '-'}S/ ${Math.abs(cause.delta).toFixed(2)}`).join(' y ');
    return `Sí, causa: está respaldado por tus dos últimos recibos. El total pasó de S/ ${previous.total.toFixed(2)} a S/ ${current.total.toFixed(2)}${causeText ? `; la diferencia se explica por ${causeText}` : ''}.`;
  }

  if (intent === 'PREVIOUS_AMOUNT') {
    if (!previous) return 'No encontré un recibo anterior comparable para este servicio.';
    return `El recibo anterior fue de S/ ${previous.total.toFixed(2)}; el actual es de S/ ${current.total.toFixed(2)}.`;
  }

  if (intent === 'PRORATION') {
    if (!events.prorrations.length) {
      return 'Revisé tu último recibo y no encontré un prorrateo asociado a esa factura. Un prorrateo es un cobro proporcional por haber usado el servicio solo durante parte del mes. Si lo viste en otro recibo, dime su número y lo reviso contigo.';
    }
    const event = events.prorrations[0];
    return `Sí está respaldado: esta factura registra un prorrateo de S/ ${Number(event.suma_prorrateo || 0).toFixed(2)}, correspondiente al período del ${formatearFechaEvento(event.fecha_inicio_minima) || 'inicio no disponible'} al ${formatearFechaEvento(event.fecha_fin_maxima) || 'fin no disponible'}. Es un cobro proporcional por los días usados, no una cifra supuesta por la IA.`;
  }

  if (intent === 'RECONNECTION') {
    if (!events.reconnections.length) {
      return 'Revisé tu último recibo y no encontré un cargo de reconexión asociado a esa factura. No voy a atribuirle ese motivo sin evidencia.';
    }
    const event = events.reconnections[0];
    return `Sí hay un registro de reconexión asociado a tu recibo: el cargo es de S/ ${Number(event.Monto || 0).toFixed(2)} y la fecha registrada es ${formatearFechaEvento(event.FechaReconexion) || 'no disponible'}. Esa información proviene del evento vinculado a la misma factura.`;
  }

  if (intent === 'BEFORE_NOW') {
    if (!previous || !variation.available) return 'No encontré un recibo anterior comparable para mostrarte el antes y el ahora.';
    const direction = variation.difference > 0 ? 'subió' : variation.difference < 0 ? 'bajó' : 'no cambió';
    const causeText = friendlyCauses.map((cause) => cause.description).join(' y ');
    return `Antes tu recibo era de S/ ${previous.total.toFixed(2)} y ahora es de S/ ${current.total.toFixed(2)}: ${direction}${variation.difference ? ` S/ ${Math.abs(variation.difference).toFixed(2)}` : ''}.${causeText && variation.difference !== 0 ? ` El cambio se explica principalmente por ${causeText}.` : ''}`;
  }

  if (intent === 'CAUSE_EVIDENCE') {
    if (!previous || !variation.available) return 'No encontré una factura anterior comparable para explicar el cambio con evidencia.';
    const planChanges = variation.causes.filter((cause) => /plan/i.test(cause.description));
    const bonusChanges = variation.causes.filter((cause) => /bono|bonificaci[oó]n|promo|descuento/i.test(cause.description));
    const appeared = variation.causes.filter((cause) => /Cargo nuevo/.test(cause.evidence));
    const disappeared = variation.causes.filter((cause) => /ya no aparece/.test(cause.evidence));
    const lines = [`Antes (${previous.invoiceId}): S/ ${previous.total.toFixed(2)} → ahora (${current.invoiceId}): S/ ${current.total.toFixed(2)}.`];
    if (disappeared.length) lines.push(`Desapareció: ${disappeared.map((cause) => cause.description).join(', ')}.`);
    if (appeared.length) lines.push(`Apareció: ${appeared.map((cause) => cause.description).join(', ')}.`);
    if (planChanges.length) lines.push(`Plan/cargo principal registrado: ${planChanges.map((cause) => `${cause.description} (${cause.delta >= 0 ? '+' : ''}S/ ${cause.delta.toFixed(2)})`).join('; ')}.`);
    if (bonusChanges.length) lines.push(`Bonos/promociones con cambio: ${bonusChanges.map((cause) => cause.description).join(', ')}.`);
    lines.push(events.prorrations.length ? 'Existe evidencia de prorrateo en esta factura.' : 'No encontré evidencia de prorrateo en esta factura.');
    lines.push(events.reconnections.length ? 'Existe evidencia de reconexión en esta factura.' : 'No encontré evidencia de reconexión en esta factura.');
    return lines.join('\n');
  }

  if (intent === 'HISTORY_REVIEW') {
    const history = invoices.slice(0, 5);
    const lines = [`Revisión de ${history.length} ${history.length === 1 ? 'recibo disponible' : 'recibos disponibles'}${history.length < 5 ? ' (no hay cinco para comparar)' : ''}:`];
    history.forEach((invoice) => lines.push(`- ${invoice.cycle}: S/ ${invoice.total.toFixed(2)} (${invoice.invoiceId}).`));
    const chronological = history.slice().reverse();
    const transitions = chronological.slice(1).map((invoice, index) => ({
      invoice,
      difference: Number((invoice.total - chronological[index].total).toFixed(2))
    }));
    const firstChange = transitions.find((transition) => Math.abs(transition.difference) >= 0.01);
    const firstIncrease = transitions.find((transition) => transition.difference > 0);
    if (firstChange) {
      lines.push(`El primer cambio fue en el ciclo ${firstChange.invoice.cycle}: ${firstChange.difference > 0 ? 'subió' : 'bajó'} S/ ${Math.abs(firstChange.difference).toFixed(2)}.`);
    }
    if (firstIncrease) {
      lines.push(`El primer aumento dentro de estos recibos fue en el ciclo ${firstIncrease.invoice.cycle}: +S/ ${firstIncrease.difference.toFixed(2)}.`);
    } else {
      lines.push('No hubo un aumento dentro de los recibos disponibles.');
    }
    lines.push('Plan, bonos, paquetes y cargos extraordinarios solo se clasifican cuando aparecen como tales en el detalle; no se infiere una causa sin evidencia.');
    return lines.join('\n');
  }

  if (intent === 'HISTORY_OLDEST_FIRST') {
    const history = invoices.slice(0, 5).reverse();
    const lines = [`Tus ${history.length} recibos disponibles, del más antiguo al más reciente:`];
    history.forEach((invoice) => lines.push(`- ${invoice.cycle}: S/ ${invoice.total.toFixed(2)} (${invoice.invoiceId}).`));
    return lines.join('\n');
  }

  if (intent.startsWith('HISTORY_COUNT:')) {
    const [, countRaw, order] = intent.split(':');
    const requestedCount = Number(countRaw) || 5;
    const selected = invoices.slice(0, requestedCount);
    const history = order === 'OLDEST' ? selected.reverse() : selected;
    const lines = [`Encontré ${history.length} de ${requestedCount} recibos solicitados${history.length < requestedCount ? '; no hay más disponibles' : ''}:`];
    history.forEach((invoice) => lines.push(`- ${invoice.cycle || 'fecha no disponible'}: S/ ${invoice.total.toFixed(2)}.`));
    return lines.join('\n');
  }

  if (intent === 'HISTORY_EXTREMES') {
    if (!invoices.length) return 'No hay recibos disponibles para identificar el menor y el mayor.';
    const lowest = invoices.reduce((best, invoice) => invoice.total < best.total ? invoice : best);
    const highest = invoices.reduce((best, invoice) => invoice.total > best.total ? invoice : best);
    return `El recibo más bajo fue el de ${formatearFechaFactura(lowest.cycle)}, con S/ ${lowest.total.toFixed(2)}; el más alto fue el de ${formatearFechaFactura(highest.cycle)}, con S/ ${highest.total.toFixed(2)}.`;
  }

  if (intent.startsWith('HISTORY_MONTH_DETAIL:')) {
    const monthNumber = Number(intent.split(':')[1]);
    const monthLabels = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const index = invoices.findIndex((invoice) => Number(String(invoice.cycle || '').slice(4, 6)) === monthNumber);
    if (index < 0) return `No encontré un recibo de ${monthLabels[monthNumber - 1]} en el historial disponible.`;
    const invoice = invoices[index];
    const older = invoices[index + 1];
    if (!older) return `En ${monthLabels[monthNumber - 1]} el total registrado fue S/ ${invoice.total.toFixed(2)}, pero no hay un mes anterior disponible para explicar el cambio.`;
    const difference = Number((invoice.total - older.total).toFixed(2));
    return `En ${monthLabels[monthNumber - 1]} el total fue S/ ${invoice.total.toFixed(2)}. Frente al recibo anterior, ${difference > 0 ? 'subió' : difference < 0 ? 'bajó' : 'no cambió'} S/ ${Math.abs(difference).toFixed(2)}; con estos datos puedo confirmar el cambio, pero no atribuir otra causa sin revisar los cargos de ambos meses.`;
  }

  if (intent.startsWith('HISTORY_COMPARE:')) {
    const monthsAgo = Number(intent.split(':')[1]);
    const historical = invoices[monthsAgo];
    if (!historical) return `No encontré una factura de hace ${monthsAgo} meses para comparar en este anexo.`;
    const difference = Number((current.total - historical.total).toFixed(2));
    const direction = difference > 0 ? 'mayor' : difference < 0 ? 'menor' : 'igual';
    const lines = [`Hace ${monthsAgo} meses (${historical.invoiceId}, ciclo ${historical.cycle}) tu total fue S/ ${historical.total.toFixed(2)}. El actual es S/ ${current.total.toFixed(2)}: es ${direction} por S/ ${Math.abs(difference).toFixed(2)}.`];
    const latestChange = invoices.findIndex((invoice, index) => index > 0 && Math.abs(invoice.total - invoices[index - 1].total) >= 0.01);
    if (latestChange > 0) lines.push(`El cambio más reciente empezó en el ciclo ${invoices[latestChange - 1].cycle}, con la factura ${invoices[latestChange - 1].invoiceId}.`);
    return lines.join('\n');
  }

  if (intent.startsWith('HISTORY_MONTHS:')) {
    const [, firstRaw, secondRaw, mode] = intent.split(':');
    const firstMonth = Number(firstRaw);
    const secondMonth = Number(secondRaw);
    const firstInvoice = invoices.find((invoice) => Number(String(invoice.cycle || '').slice(4, 6)) === firstMonth);
    const secondInvoice = invoices.find((invoice) => Number(String(invoice.cycle || '').slice(4, 6)) === secondMonth);
    if (!firstInvoice || !secondInvoice) return 'No encontré ambos meses en el historial disponible de este servicio, así que no puedo compararlos con seguridad.';
    const difference = Number((firstInvoice.total - secondInvoice.total).toFixed(2));
    const monthLabels = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const relation = difference === 0 ? 'fueron iguales' : `${monthLabels[firstMonth - 1]} fue S/ ${Math.abs(difference).toFixed(2)} ${difference > 0 ? 'más alto' : 'más bajo'}`;
    const lines = [`En ${monthLabels[firstMonth - 1]} el recibo fue S/ ${firstInvoice.total.toFixed(2)} y en ${monthLabels[secondMonth - 1]} fue S/ ${secondInvoice.total.toFixed(2)}; ${relation}.`];
    if (mode === 'PERCENT') {
      const percent = firstInvoice.total === 0 ? null : Number((((secondInvoice.total - firstInvoice.total) / firstInvoice.total) * 100).toFixed(2));
      lines.push(percent === null ? 'No se puede calcular un porcentaje tomando como base S/ 0.00.' : `De ${monthLabels[firstMonth - 1]} a ${monthLabels[secondMonth - 1]}, el cambio fue de ${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%.`);
    }
    return lines.join('\n');
  }

  if (intent === 'COMPARISON') {
    if (!previous || !variation.available) {
      return `No encontré una factura anterior comparable para el anexo terminado en ${current.subscriberId.slice(-4)}.`;
    }
    const lines = variation.difference === 0
      ? [`Tus dos últimos recibos fueron de S/ ${current.total.toFixed(2)}; el total no cambió.`]
      : [`Tu recibo pasó de S/ ${previous.total.toFixed(2)} a S/ ${current.total.toFixed(2)}: ${variation.difference > 0 ? 'subió' : 'bajó'} S/ ${Math.abs(variation.difference).toFixed(2)}.`];
    const appeared = variation.causes.filter((cause) => /Cargo nuevo/.test(cause.evidence));
    const disappeared = variation.causes.filter((cause) => /ya no aparece/.test(cause.evidence));
    const main = variation.causes.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (appeared.length) lines.push(`Este mes apareció: ${appeared.map((cause) => cause.description).join(', ')}.`);
    if (disappeared.length) lines.push(`Ya no aparece: ${disappeared.map((cause) => cause.description).join(', ')}.`);
    if (main) lines.push(`El cambio con mayor impacto fue ${main.description} (${main.delta >= 0 ? '+' : ''}S/ ${main.delta.toFixed(2)}).`);
    return lines.join('\n');
  }

  if (intent === 'EXPLAIN_BONUS') {
    const adjustments = current.charges.filter((charge) => /descuento|bonificaci[oó]n|bono|promo|gratuidad/i.test(`${charge.description} ${charge.classification} ${charge.group}`));
    const net = adjustments.reduce((sum, charge) => sum + charge.amount, 0);
    const lines = ['Una bonificación es un beneficio que compensa total o parcialmente el precio de un servicio; normalmente aparece junto a su cargo asociado.'];
    if (adjustments.length) lines.push(`En tu factura ${current.invoiceId}, los bonos/descuentos registrados tienen un efecto neto de S/ ${net.toFixed(2)}.`);
    lines.push(`El total de cargos de tu factura es S/ ${current.total.toFixed(2)}. Esto no confirma una deuda pendiente porque ese campo no fue entregado.`);
    return lines.join('\n');
  }

  if (intent === 'HISTORY') {
    const history = invoices.slice(0, 5);
    if (!history.length) return 'No encontré facturas históricas para este anexo.';
    const lines = [`Historial verificado de tus ${history.length} facturas más recientes para el anexo terminado en ${current.subscriberId.slice(-4)}:`];
    history.forEach((invoice, index) => {
      lines.push(`- ${index + 1}. ${invoice.invoiceId} · ciclo ${invoice.cycle || 'no disponible'} · total de cargos S/ ${invoice.total.toFixed(2)}.`);
    });
    lines.push('Estos totales corresponden a los cargos facturados; los archivos no incluyen un saldo pendiente exacto. Dime el número de una factura si deseas revisar su detalle.');
    return lines.join('\n');
  }

  if (intent === 'DISCOUNTS') {
    const adjustments = current.charges.filter((charge) => /descuento|bonificaci[oó]n|bono|promo|gratuidad/i.test(`${charge.description} ${charge.classification} ${charge.group}`));
    if (!adjustments.length) {
      return `En la factura ${current.invoiceId} no encontré descuentos ni bonificaciones identificables en los cargos facturados.`;
    }
    const lines = [`Bonificaciones o descuentos verificados en la factura ${current.invoiceId}:`];
    adjustments.forEach((charge) => lines.push(`- ${charge.description || charge.code}: S/ ${charge.amount.toFixed(2)}.`));
    const net = adjustments.reduce((sum, charge) => sum + charge.amount, 0);
    lines.push(`Efecto neto de esos conceptos en esta factura: S/ ${net.toFixed(2)}.`);
    lines.push('El resultado se calcula solo con los cargos de esta factura; no se infiere una promoción que no esté registrada.');
    return lines.join('\n');
  }

  if (intent === 'INCREASE' || intent === 'INCREASE_SHORT') {
    if (!previous || !variation.available) {
      return `No puedo confirmar que tu recibo haya aumentado: para la factura ${current.invoiceId} no existe una factura anterior comparable del mismo anexo en los datos. El total de cargos de esta factura es S/ ${current.total.toFixed(2)}.`;
    }
    if (variation.difference <= 0) {
      const direction = variation.difference < 0 ? 'disminuyó' : 'no varió';
      return `No hubo aumento verificable. Frente a ${previous.invoiceId}, el total ${direction}: pasó de S/ ${previous.total.toFixed(2)} a S/ ${current.total.toFixed(2)}.`;
    }
    const lines = [`Tu recibo aumentó S/ ${variation.difference.toFixed(2)} frente al anterior: pasó de S/ ${previous.total.toFixed(2)} a S/ ${current.total.toFixed(2)}.`];
    if (intent === 'INCREASE_SHORT') {
      if (friendlyCauses.length) {
        const reasons = friendlyCauses.map((cause) => `${cause.description} (${cause.delta >= 0 ? '+' : '-'}S/ ${Math.abs(cause.delta).toFixed(2)})`).join(' y ');
        return `Subió porque se registraron ${reasons}. Juntos explican los S/ ${variation.difference.toFixed(2)} de diferencia.`;
      } else {
        lines.push('Los cambios de cargos registrados suman esa diferencia; no infiero un motivo distinto a los datos.');
      }
      return lines.join('\n');
    }
    if (variation.causes.length) {
      lines.push('Cambios que explican exactamente la diferencia:');
      variation.causes.forEach((cause) => lines.push(`- ${cause.description}: ${cause.delta >= 0 ? '+' : ''}S/ ${cause.delta.toFixed(2)}. ${cause.evidence}`));
    } else {
      lines.push('No encontré cargos con cambio individual, por lo que no atribuyo una causa específica.');
    }
    return lines.join('\n');
  }

  if (intent !== 'DETAIL_BREAKDOWN') {
    const lines = [`Tu último recibo tiene cargos por S/ ${current.total.toFixed(2)}${dueDate ? ` y vence el ${dueDate}` : ''}.`];
    if (previous && variation.available && Math.abs(variation.difference) >= 0.01) {
      lines.push(`Frente al anterior, ${variation.difference > 0 ? 'subió' : 'bajó'} S/ ${Math.abs(variation.difference).toFixed(2)}${principalCause ? ` principalmente por ${principalCause.description}` : ''}.`);
    }
    if (debtStatus) lines.push(`Figura “${debtStatus}”, pero los datos no indican el saldo pendiente exacto.`);
    else lines.push('Los datos no indican un saldo pendiente exacto.');
    lines.push('Si quieres, te explico cada cargo con más detalle.');
    return lines.join('\n');
  }

  const lines = [
    `Claro. Tu recibo suma S/ ${current.total.toFixed(2)}${dueDate ? ` y vence el ${dueDate}` : ''}.`
  ];

  if (previous && variation.available) {
    if (Math.abs(variation.difference) < 0.01) {
      lines.push(`No subió frente al recibo anterior: ambos fueron de S/ ${current.total.toFixed(2)}.`);
    } else {
      const direction = variation.difference > 0 ? 'subió' : 'bajó';
      lines.push(`Frente al anterior, ${direction} S/ ${Math.abs(variation.difference).toFixed(2)}${principalCause ? ` principalmente por ${principalCause.description}` : ''}.`);
    }
  }

  lines.push('Así se forma el total:');
  lines.push(...resumirDetalleCargos(displayedCharges));

  if (debtStatus) lines.push(`Importante: figura “${debtStatus}”, pero los datos no indican el saldo pendiente exacto.`);
  else lines.push('Los datos no indican el saldo pendiente exacto.');
  if (dataWarning) lines.push(`Ojo: ${dataWarning}`);

  if (events.reconnections.length) {
    const event = events.reconnections[0];
    lines.push(`Registro de reconexión de esta factura: ${event.Descripcion || 'Cargo por reconexión'} por S/ ${Number(event.Monto || 0).toFixed(2)} el ${event.FechaReconexion || 'período no disponible'}.`);
  }
  if (events.prorrations.length) {
    const event = events.prorrations[0];
    lines.push(`Registro de prorrateo de esta factura: S/ ${Number(event.suma_prorrateo || 0).toFixed(2)} para el período ${event.fecha_inicio_minima || 'no disponible'} al ${event.fecha_fin_maxima || 'no disponible'}.`);
  }
  return lines.join('\n');
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

  try {
    session =
      getOrCreateSession(
        sessionId
      );


    const activeSessionId =
      session.sessionId;

    const respuestaBasica = responderConversacionBasica(mensajeTexto);
    if (respuestaBasica) {
      // Los saludos, agradecimientos y despedidas ya están redactados para la
      // voz de Lucía. Reenviarlos al modelo puede invertir accidentalmente los
      // roles y hacer que la asistente hable como si fuera la clienta.
      const respuestaAmigable = respuestaBasica;
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaAmigable);
      return { reply: respuestaAmigable, foundData: false, sessionId: activeSessionId, conversational: true };
    }

    await catalogoCargaPromise;
    const respuestaCatalogo = responderPreguntaCatalogo(mensajeTexto, session.context.lastCatalogIntent);
    if (respuestaCatalogo) {
      const respuestaAmigable = await humanizarRespuestaVerificada(mensajeTexto, respuestaCatalogo.reply);
      updateContext(activeSessionId, { lastCatalogIntent: respuestaCatalogo.intent });
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaAmigable);
      return { reply: respuestaAmigable, foundData: false, sessionId: activeSessionId };
    }


    // -------------------------------------------------------
    // 1. Detectar identificador explícito.
    // -------------------------------------------------------

    const identificadorEncontrado =
      extraerIdentificadorCliente(
        mensajeTexto
      );

      // If the user explicitly provides an identifier (DNI/etc.) we
      // require that the session is already associated with an authenticated
      // customer. Do NOT allow anonymous users to claim arbitrary identifiers.
      if (identificadorEncontrado) {
        const session = getOrCreateSession(activeSessionId);
        const sessionCustomer = session.context && session.context.customerIdentifier;
        if (!sessionCustomer) {
          // Ask to authenticate first.
          return {
            reply: 'Para ver información personal de un cliente debes iniciar sesión primero. Usa el botón "Iniciar sesión" e ingresa tu número celular y contraseña.',
            foundData: false
          };
        }
        if (String(identificadorEncontrado).toUpperCase() !== String(sessionCustomer).toUpperCase()) {
          updateContext(activeSessionId, { blockedForeignLookup: true });
          return {
            reply: 'Por seguridad, solo puedo consultar la información asociada a tu sesión.',
            foundData: false,
            sessionId: activeSessionId
          };
        }
      }


    // -------------------------------------------------------
    // 2. Cliente activo de la conversación.
    // -------------------------------------------------------

    customerIdentifier =
      identificadorEncontrado ||
      session.context
        .customerIdentifier;

    const idBuscar = customerIdentifier;

    const privacyFollowupText = normalizarTextoConversacional(mensajeTexto);
    const asksOwnData = /\bmi\b|\bmis\b|mi\s+(?:id|codigo|numero|cuenta|recibo|factura|servicio)/.test(privacyFollowupText);
    if (
      session.context.blockedForeignLookup &&
      !asksOwnData &&
      /\b(?:su|esa|ese|otro|otra|telefono|celular|deuda|factura|recibo|permiso|autorizo)\b/.test(privacyFollowupText)
    ) {
      return {
        reply: 'Aunque me des permiso en el chat, por seguridad no puedo consultar datos de otra persona. Solo puedo usar la cuenta asociada a tu sesión.',
        foundData: false,
        sessionId: activeSessionId
      };
    }
    if (asksOwnData && session.context.blockedForeignLookup) {
      updateContext(activeSessionId, { blockedForeignLookup: false });
    }

    if (
      idBuscar &&
      /(?:factura|recibo|deuda|tel[eé]fono|anexos?).*(?:de\s+alguien|de\s+otro|de\s+otra\s+persona|cliente.*no\s+sea\s+yo)|(?:de\s+alguien|de\s+otro|de\s+otra\s+persona|cliente.*no\s+sea\s+yo).*(?:factura|recibo|deuda|tel[eé]fono|anexos?)/i.test(mensajeTexto)
    ) {
      return {
        reply: 'Por seguridad, solo puedo consultar la información asociada a tu sesión.',
        foundData: false,
        sessionId: activeSessionId
      };
    }

    const mensajeNormalizado = normalizarTextoConversacional(mensajeTexto);
    const esConsultaFacturacion = /deuda|debo|pagar|pague|saldo|pendiente|venc|recibo|factur|monto|aument|subi|bajo|increment|mas caro|cobro|cargo|descuento|bonific|bono|prorrat|reconex|historial|compar|cambi|anterior|plan|telefono|celular|estimacion|invent|evidencia|datos|csv|vecin|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|\bvr\b|cual\s+es\s+mi\s+(?:id|codigo)|(?:id|codigo)\s+de\s+cliente/.test(mensajeNormalizado);
    // Después de una consulta personal, cualquier turno no resuelto por la
    // conversación básica ni por el catálogo se interpreta dentro del tema
    // vigente. Así se conservan seguimientos naturales como “¿y el más
    // barato?”, “esa fecha ya pasó” o “ahora en tres viñetas”.
    const esSeguimientoFacturacion = Boolean(session.context.lastBillingIntent);
    let semanticFollowupIntent = null;
    if (idBuscar && session.context.lastBillingIntent && !esConsultaFacturacion) {
      semanticFollowupIntent = await interpretarSeguimientoConIA(mensajeTexto, session.context.lastBillingIntent);
      if (semanticFollowupIntent === 'ACKNOWLEDGMENT') {
        const reply = /\b(?:mano|mno|causa|pe|soli|rey)\b/.test(mensajeNormalizado)
          ? '¡Chévere, causa! Aquí estoy si quieres consultar algo más.'
          : '¡Perfecto! Aquí estoy si necesitas algo más.';
        addMessage(activeSessionId, 'user', mensajeTexto);
        addMessage(activeSessionId, 'assistant', reply);
        return { reply, foundData: false, sessionId: activeSessionId, conversational: true };
      }
    }
    let selectedSubscriberId = session.context.selectedSubscriberId || null;
    let selectingService = false;
    if (idBuscar) {
      const serviceLookup = getBillingAnalysis(idBuscar);
      const requestedAnexo = String(mensajeTexto).match(/anexo[^\d]*(\d{4,12})/i)?.[1];
      if (requestedAnexo) {
        const matchingService = serviceLookup.services.find((service) => service.subscriberId.endsWith(requestedAnexo));
        if (!matchingService) {
          return {
            reply: `No encontré un anexo terminado en ${requestedAnexo} asociado a tu cuenta. No consulté información de otro servicio.`,
            foundData: false,
            sessionId: activeSessionId
          };
        }
        selectedSubscriberId = matchingService.subscriberId;
        updateContext(activeSessionId, { selectedSubscriberId });
        selectingService = true;
      }
      if (serviceLookup.requiresSubscriberSelection) {
        const selectedSuffix = String(mensajeTexto).match(/\b\d{4,12}\b/)?.[0];
        const matchedService = selectedSuffix && serviceLookup.services.find((service) => service.subscriberId.endsWith(selectedSuffix));
        if (matchedService) {
          selectedSubscriberId = matchedService.subscriberId;
          updateContext(activeSessionId, { selectedSubscriberId });
          selectingService = true;
        }
      }
    }
    if (idBuscar && (esConsultaFacturacion || esSeguimientoFacturacion || semanticFollowupIntent || selectingService)) {
      const requestedInvoiceId = String(mensajeTexto).match(/\bS\dAA-\d+\b/i)?.[0] || null;
      const analysis = getBillingAnalysis(idBuscar, selectedSubscriberId, requestedInvoiceId);
      const detectedIntent = semanticFollowupIntent || await interpretarIntencionFacturacion(mensajeTexto);
      const intent = resolverIntencionDeSeguimiento(mensajeTexto, detectedIntent, session.context.lastBillingIntent);
      const borradorVerificado = construirRespuestaFacturaVerificada(analysis, intent);
      // Cuando el usuario pide solo la fecha, el formato es parte de la
      // intención. Se devuelve el dato verificado sin permitir que el modelo
      // agregue saldo, estado, ciclo u otra explicación no solicitada.
      const respuestaVerificada = intent === 'DUE_DATE_ONLY'
        ? borradorVerificado
        : await humanizarRespuestaVerificada(mensajeTexto, borradorVerificado);
      updateContext(activeSessionId, {
        lastBillingIntent: intent,
        lastBillingInvoiceId: analysis.current?.invoiceId || null,
        lastCatalogIntent: null
      });
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaVerificada);
      return { reply: respuestaVerificada, foundData: Boolean(analysis.found), sessionId: activeSessionId, verified: true };
    }


    // -------------------------------------------------------
    // 3. PRIORIDAD:
    //    Mi Movistar / Persona 4.
    // -------------------------------------------------------

    const contextoApp =
      construirContextoApp(
        idBuscar
      );


    let contextoCliente = '';

    contextoClientePorId = idBuscar
      ? await buildCustomerDataContext(path.resolve(__dirname, '../data'), idBuscar)
      : '';

    resumenFacturacion = idBuscar
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

    // Personal billing answers are deterministic. This prevents the language
    // model from inventing reasons for a variation or combining old invoices.
    if (idBuscar && resumenFacturacion && /deuda|debo|pagar|saldo|venc|recibo|factur|monto|aument|ese|entonces|por qu[eé]|explica|significa|confirm/i.test(mensajeTexto)) {
      const borradorVerificado = construirRespuestaFallback(
        mensajeTexto,
        customerIdentifier,
        resumenFacturacion,
        contextoClientePorId
      );
      const respuestaVerificada = await humanizarRespuestaVerificada(mensajeTexto, borradorVerificado);
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaVerificada);
      return { reply: respuestaVerificada, foundData: true, sessionId: activeSessionId, verified: true };
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


--- CATÁLOGO DE OFERTAS OFICIAL ---

${(catalogoOfertasTexto || 'Catálogo no disponible.').slice(0, 1500)}


--- CONTEXTO DE ARCHIVOS DE DATA ---

No se entrega contexto global. Solo se incluyen registros que correspondan al cliente autenticado.


--- DATOS CRUZADOS DEL CLIENTE ---

No se incluyen datos personales en esta ruta general. Las consultas de facturación se resuelven antes mediante el motor verificado.


--- RESUMEN ESTRUCTURADO DE FACTURACIÓN ---

No se incluye un resumen de facturación porque el usuario no realizó una consulta personal clasificada como tal.


--- CONTEXTO DEL CLIENTE ---

No se entrega contexto personal en conversaciones generales.
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
      const respuestaSegura = construirRespuestaFallback(
        mensajeTexto,
        customerIdentifier,
        resumenFacturacion,
        contextoClientePorId
      );

      // store fallback messages
      addMessage(activeSessionId, 'user', mensajeTexto);
      addMessage(activeSessionId, 'assistant', respuestaSegura);

      return { reply: respuestaSegura, foundData: Boolean(customerIdentifier) };
    }

    if (!client) {
      throw new Error('GROQ_API_KEY missing');
    }

    const modelName = (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim();
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
        max_tokens: maxTokens,
        reasoning_effort: 'low'
      });
    } catch (err) {
      // If rate-limited, immediately return a safe fallback reply
      console.error('RAG model error while creating completion:', err && err.message ? err.message : err);
      const respuestaSegura = construirRespuestaFallback(
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

      return { reply: respuestaSegura, foundData: Boolean(customerIdentifier) };
    }


    const respuesta =
      completion
        .choices[0]
        ?.message
        ?.content ||
      'Lo siento, no pude procesar tu consulta en este momento.';


    // -------------------------------------------------------
    // 8. Guardar conversación.
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


    return respuesta;

  } catch (error) {
    console.error(
      'Error en RAG Service:',
      error
    );


    const respuestaSegura = construirRespuestaFallback(
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


    // Intentamos conservar también el turno fallido
    // dentro del historial de la sesión.
    try {
      const session =
        getOrCreateSession(
          sessionId
        );


      addMessage(
        session.sessionId,
        'user',
        mensajeTexto
      );


      addMessage(
        session.sessionId,
        'assistant',
        respuestaSegura
      );

    } catch (
      sessionError
    ) {
      console.error(
        'Error guardando el turno fallido:',
        sessionError
      );
    }


    return respuestaSegura;
  }
}


module.exports = {
  procesarConsultaFactura,
  construirRespuestaFallback,
  respuestaMantieneHechos,
  humanizarRespuestaVerificada
};
