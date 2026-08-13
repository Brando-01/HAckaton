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
const DELIMITADOR = ';';

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
  return construirBloqueDeHechos(cargos, { ...opciones, cliente: identificador });
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
  ARCHIVO_CARGOS
};
