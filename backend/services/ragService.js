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

const {
  getOrCreateSession,
  addMessage,
  getHistory,
  updateContext
} = require('./sessionService');


const groq = new Groq({
  apiKey:
    process.env.GROQ_API_KEY
});


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
        ofertas.push(
          [
            `- ID: ${row.oferta_id}`,
            `Plan: ${row.nombre_oferta}`,
            `Tipo: ${row.tipo_oferta}`,
            `Precio: S/ ${row.precio_mensual}`,
            `GB: ${row.gb_incluidos || 'N/A'}`,
            `Movistar Total: ${row.es_movistar_total}`
          ].join(' | ')
        );
      }
    )

    .on(
      'end',
      () => {
        catalogoOfertasTexto =
          ofertas.join('\n');

        console.log(
          `✅ Catálogo cargado con éxito (${ofertas.length} ofertas disponibles).`
        );
      }
    );
}


cargarCatalogoOfertas();


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

              return resolve(
                null
              );
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

            return resolve(
              null
            );
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


  // Compatibilidad temporal
  // con los DNI de demostración.
  const matchDNI =
    mensajeTexto.match(
      /\b\d{8}\b/
    );


  if (matchDNI) {
    return matchDNI[0];
  }


  return null;
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
  try {
    const session =
      getOrCreateSession(
        sessionId
      );


    const activeSessionId =
      session.sessionId;


    // -------------------------------------------------------
    // 1. Detectar identificador explícito.
    // -------------------------------------------------------

    const identificadorEncontrado =
      extraerIdentificadorCliente(
        mensajeTexto
      );


    if (
      identificadorEncontrado
    ) {
      updateContext(
        activeSessionId,
        {
          customerIdentifier:
            identificadorEncontrado
        }
      );
    }


    // -------------------------------------------------------
    // 2. Cliente activo de la conversación.
    // -------------------------------------------------------

    const idBuscar =
      identificadorEncontrado ||
      session.context
        .customerIdentifier;


    // -------------------------------------------------------
    // 3. PRIORIDAD:
    //    Mi Movistar / Persona 4.
    // -------------------------------------------------------

    const contextoApp =
      construirContextoApp(
        idBuscar
      );


    let contextoCliente = '';


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
        contextoCliente = `
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


--- CATÁLOGO DE OFERTAS OFICIAL ---

${catalogoOfertasTexto || 'Catálogo no disponible.'}


--- CONTEXTO DEL CLIENTE ---

${contextoCliente}
`.trim();


    // -------------------------------------------------------
    // 6. Historial de Persona 1.
    // -------------------------------------------------------

    const historialConversacion =
      getHistory(
        activeSessionId
      );


    // -------------------------------------------------------
    // 7. Consulta al modelo.
    // -------------------------------------------------------

    const completion =
      await groq.chat.completions.create({
        messages: [
          {
            role:
              'system',

            content:
              promptSistema
          },

          ...historialConversacion,

          {
            role:
              'user',

            content:
              mensajeTexto
          }
        ],

        model:
          'llama-3.3-70b-versatile',

        temperature:
          0.1,

        max_tokens:
          500
      });


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


    const respuestaSegura =
      'Hubo un inconveniente al procesar tu consulta. Por favor, intenta más tarde.';


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
  procesarConsultaFactura
};