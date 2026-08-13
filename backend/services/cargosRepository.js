/**
 * Acceso indexado a Cargos_FacturadosV2.csv.
 *
 * El archivo pesa ~139 MB y antes se releía entero en cada mensaje de chat.
 * Acá se lee **una sola vez** por proceso, en streaming, y se deja un índice en
 * memoria por CUSTOMER_KEY / FINANCIAL_ACCOUNT_KEY / SUBSCRIBER_KEY. El pase
 * completo tarda ~2 s y se hace de forma perezosa: el primer cliente que
 * consulte paga el costo, los demás resuelven en microsegundos.
 *
 * Solo se guardan las columnas que consume `motorDiff`, no la fila entera.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { construirBloqueDeHechos } = require('./motorDiff');

const ARCHIVO_CARGOS = 'Cargos_FacturadosV2.csv';
const ARCHIVO_PLANTA = 'PLANTA CLIENTES.csv';
const DELIMITADOR = ';';

/** Códigos de `lob_type` traducidos a algo que el cliente entienda. */
const SERVICIOS = {
  TV: 'TV',
  BB: 'Internet fijo',
  WRLS: 'Móvil',
  FIJA: 'Telefonía fija'
};

/** Columnas que necesita el motor. El resto se descarta al indexar. */
const COLUMNAS = [
  'CUSTOMER_KEY',
  'FINANCIAL_ACCOUNT_KEY',
  'BILLING_ARRANGEMENT_KEY',
  'SUBSCRIBER_KEY',
  'LEGAL_INVOICE_NUMBER',
  'ciclo',
  'CHARGE_CODE_ID',
  'CHARGE_CODE_DESC',
  'CHARGE_CODE_CLASSIFICATION',
  'GRUPO',
  'SUB_GRUPO',
  'FECHA-VENCIMIENTO',
  'DEUDA',
  'CHARGE_TOTAL_AMOUNT',
  'CHARGE_NET_AMOUNT'
];

/** Un índice por directorio de datos, para que los tests puedan usar el suyo. */
const indices = new Map();

function rutaDeCargos(dataDir) {
  return path.join(dataDir, ARCHIVO_CARGOS);
}

function normalizarClave(valor) {
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

function agregarAlIndice(indice, clave, fila) {
  const limpia = normalizarClave(clave);
  if (!limpia) {
    return;
  }
  if (!indice.has(limpia)) {
    indice.set(limpia, []);
  }
  indice.get(limpia).push(fila);
}

/**
 * Lee el CSV completo y construye el índice.
 *
 * El archivo no trae comillas en los campos, así que un `split` por `;` alcanza
 * y evita el costo de un parser con estado sobre 297 mil líneas.
 */
function construirIndice(dataDir) {
  const ruta = rutaDeCargos(dataDir);

  if (!fs.existsSync(ruta)) {
    return Promise.resolve({
      porCliente: new Map(),
      porCuenta: new Map(),
      porSuscriptor: new Map(),
      filas: 0,
      disponible: false,
      milisegundos: 0
    });
  }

  const inicio = Date.now();

  return new Promise((resolve, reject) => {
    const porCliente = new Map();
    const porCuenta = new Map();
    const porSuscriptor = new Map();
    let posiciones = null;
    let filas = 0;

    const lector = readline.createInterface({
      input: fs.createReadStream(ruta, 'utf8'),
      crlfDelay: Infinity
    });

    lector.on('line', (linea) => {
      if (posiciones === null) {
        const cabeceras = linea.replace(/^﻿/, '').split(DELIMITADOR).map((c) => c.trim());
        posiciones = {};
        COLUMNAS.forEach((columna) => {
          const indice = cabeceras.indexOf(columna);
          if (indice !== -1) {
            posiciones[columna] = indice;
          }
        });
        return;
      }

      if (linea.trim() === '') {
        return;
      }

      const celdas = linea.split(DELIMITADOR);
      const fila = {};
      for (const columna of COLUMNAS) {
        const posicion = posiciones[columna];
        fila[columna] = posicion === undefined ? '' : normalizarClave(celdas[posicion]);
      }

      filas += 1;
      agregarAlIndice(porCliente, fila.CUSTOMER_KEY, fila);
      agregarAlIndice(porCuenta, fila.FINANCIAL_ACCOUNT_KEY, fila);
      agregarAlIndice(porSuscriptor, fila.SUBSCRIBER_KEY, fila);
    });

    lector.on('error', reject);

    lector.on('close', () => {
      resolve({
        porCliente,
        porCuenta,
        porSuscriptor,
        filas,
        disponible: true,
        milisegundos: Date.now() - inicio
      });
    });
  });
}

/**
 * Devuelve el índice del directorio, construyéndolo la primera vez.
 * Las llamadas concurrentes comparten la misma promesa: nunca se lee dos veces.
 */
function obtenerIndice(dataDir) {
  if (!indices.has(dataDir)) {
    indices.set(dataDir, construirIndice(dataDir).catch((error) => {
      // Un fallo de lectura no debe dejar la promesa rota cacheada para siempre.
      indices.delete(dataDir);
      throw error;
    }));
  }
  return indices.get(dataDir);
}

/** Fuerza la reconstrucción del índice (tests y recargas en caliente). */
function limpiarIndice(dataDir) {
  plantaCache = null;

  if (dataDir === undefined) {
    indices.clear();
    return;
  }
  indices.delete(dataDir);
}

/** Calienta el índice al arrancar el servidor, sin bloquear el arranque. */
async function precargarIndice(dataDir) {
  const indice = await obtenerIndice(dataDir);
  return {
    disponible: indice.disponible,
    filas: indice.filas,
    clientes: indice.porCliente.size,
    milisegundos: indice.milisegundos
  };
}

/**
 * Busca los cargos de un identificador, probando cliente, cuenta financiera y
 * suscriptor en ese orden. Devuelve `[]` si no existe en ninguno.
 */
async function obtenerCargosDeCliente(dataDir, identificador) {
  const clave = normalizarClave(identificador);
  if (!clave) {
    return [];
  }

  const indice = await obtenerIndice(dataDir);
  return indice.porCliente.get(clave)
    || indice.porCuenta.get(clave)
    || indice.porSuscriptor.get(clave)
    || [];
}

/** `true` si el identificador existe realmente en la base de cargos. */
async function existeCliente(dataDir, identificador) {
  const cargos = await obtenerCargosDeCliente(dataDir, identificador);
  return cargos.length > 0;
}

/**
 * Punto de entrada del Desafío 1: identificador → bloque de hechos listo para
 * que el LLM lo narre.
 */
async function obtenerHechosDeCliente(dataDir, identificador, opciones = {}) {
  const cargos = await obtenerCargosDeCliente(dataDir, identificador);
  const bloque = construirBloqueDeHechos(cargos, { ...opciones, cliente: identificador });

  // Contexto del servicio contratado: no cambia ningún monto, pero permite
  // responder "qué tengo contratado" y "desde cuándo" con datos reales.
  if (bloque.encontrado) {
    bloque.servicio = await obtenerFichaDeServicio(dataDir, identificador);
  }

  return bloque;
}

/**
 * Ficha de servicio del cliente, desde PLANTA CLIENTES.
 *
 * Aporta el contexto que la explicación del recibo por sí sola no da: qué
 * servicios tiene contratados y desde cuándo. Se lee una sola vez, igual que
 * los cargos.
 *
 * Ojo: el dataset está anonimizado. Solo hay `telefono_hash`, así que de acá
 * no sale ningún nombre ni teléfono, únicamente datos del servicio.
 */
let plantaCache = null;

function construirPlanta(dataDir) {
  const ruta = path.join(dataDir, ARCHIVO_PLANTA);

  if (!fs.existsSync(ruta)) {
    return Promise.resolve(new Map());
  }

  return new Promise((resolve, reject) => {
    const porCliente = new Map();
    let posiciones = null;

    const lector = readline.createInterface({
      input: fs.createReadStream(ruta, 'utf8'),
      crlfDelay: Infinity
    });

    lector.on('line', (linea) => {
      if (posiciones === null) {
        const cabeceras = linea.replace(/^﻿/, '').split(DELIMITADOR).map((c) => c.trim());
        posiciones = {
          cliente: cabeceras.indexOf('COD_CLIENTE'),
          servicio: cabeceras.indexOf('lob_type'),
          negocio: cabeceras.indexOf('negocio'),
          alta: cabeceras.indexOf('fecha_activacion_original')
        };
        return;
      }

      if (!linea.trim()) return;

      const celdas = linea.split(DELIMITADOR);
      const cliente = normalizarClave(celdas[posiciones.cliente]);
      if (!cliente) return;

      if (!porCliente.has(cliente)) {
        porCliente.set(cliente, { servicios: new Set(), negocio: '', alta: '' });
      }

      const ficha = porCliente.get(cliente);
      const servicio = normalizarClave(celdas[posiciones.servicio]);
      if (servicio) {
        ficha.servicios.add(SERVICIOS[servicio] || servicio);
      }
      if (!ficha.negocio) ficha.negocio = normalizarClave(celdas[posiciones.negocio]);
      if (!ficha.alta) ficha.alta = normalizarClave(celdas[posiciones.alta]);
    });

    lector.on('error', reject);
    lector.on('close', () => resolve(porCliente));
  });
}

function obtenerPlanta(dataDir) {
  if (!plantaCache) {
    plantaCache = construirPlanta(dataDir).catch((error) => {
      plantaCache = null;
      throw error;
    });
  }
  return plantaCache;
}

/** Antigüedad en meses a partir de `fecha_activacion_original` (D/M/YYYY). */
function antiguedadEnMeses(fechaAlta) {
  const partes = String(fechaAlta || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!partes) {
    return null;
  }
  const alta = new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]));
  const meses = Math.floor((Date.now() - alta.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  return meses > 0 ? meses : null;
}

async function obtenerFichaDeServicio(dataDir, identificador) {
  const clave = normalizarClave(identificador);
  if (!clave) {
    return null;
  }

  try {
    const planta = await obtenerPlanta(dataDir);
    const ficha = planta.get(clave);
    if (!ficha) {
      return null;
    }

    return {
      servicios: [...ficha.servicios],
      negocio: ficha.negocio || null,
      fechaAlta: ficha.alta || null,
      antiguedadMeses: antiguedadEnMeses(ficha.alta)
    };
  } catch (error) {
    console.error('No se pudo leer la planta de clientes:', error);
    return null;
  }
}

/** Identificadores con al menos `minimo` ciclos: útil para elegir demos. */
async function listarClientesConHistorial(dataDir, minimo = 6, limite = 20) {
  const indice = await obtenerIndice(dataDir);
  const encontrados = [];

  for (const [cliente, filas] of indice.porCliente) {
    const ciclos = new Set(filas.map((fila) => fila.ciclo).filter(Boolean));
    if (ciclos.size >= minimo) {
      encontrados.push({ cliente, ciclos: ciclos.size });
      if (encontrados.length >= limite) {
        break;
      }
    }
  }

  return encontrados;
}

module.exports = {
  obtenerCargosDeCliente,
  obtenerHechosDeCliente,
  existeCliente,
  precargarIndice,
  limpiarIndice,
  listarClientesConHistorial,
  obtenerFichaDeServicio,
  ARCHIVO_CARGOS,
  ARCHIVO_PLANTA
};
