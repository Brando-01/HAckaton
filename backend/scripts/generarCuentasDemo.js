/**
 * Genera las cuentas de acceso de la demo a partir de la data real.
 *
 *     node scripts/generarCuentasDemo.js
 *
 * Escribe `data/cuentas-demo.json`, que es lo que siembra `authService`.
 *
 * Por qué hace falta generarlas: el dataset está anonimizado. `PLANTA
 * CLIENTES` solo trae `telefono_hash` (SHA-256, irreversible) y los BRAINY_*
 * traen `Telefono` y `numerodocumento` como "xxxx". No hay ningún celular ni
 * documento con el que iniciar sesión, así que se fabrica una credencial de
 * acceso y se la ata a un CUSTOMER_KEY que sí existe en la facturación.
 *
 * El celular es de acceso, no del cliente. El nombre mostrado es una
 * etiqueta, no una identidad: inventar nombres de persona sobre datos
 * anonimizados sería simular información que no tenemos.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA = path.resolve(__dirname, '..', 'data');
const SALIDA = path.join(DATA, 'cuentas-demo.json');
const PASSWORD = 'Demo1234!';

/**
 * Clientes elegidos porque cada uno demuestra un caso distinto del reto.
 * Todos verificados con 6 ciclos facturados.
 */
const ELEGIDOS = [
  { customerId: '125420001', caso: 'Reconexión', resumen: 'Serie plana de S/ 79.90 y un cargo de reconexión de S/ 4.58 en el último ciclo.' },
  { customerId: '123165012', caso: 'Fin de descuento + cambio de plan', resumen: 'Sube S/ 14.94: se acaba una campaña de S/ 34.95 y a la vez baja el plan S/ 20.01.' },
  { customerId: '48799623', caso: 'Pico por servicios de terceros', resumen: 'S/ 429.89 en marzo por llamadas de AMERICATEL; útil para preguntar por un recibo anterior.' },
  { customerId: '58364152', caso: 'Alta con prorrateo', resumen: 'Primer ciclo de S/ 149.90 y luego estable en S/ 89.91. Recibo actual con deuda.' },
  { customerId: '130857463', caso: 'Baja a la mitad', resumen: 'De S/ 120.00 a S/ 60.01 tras el primer ciclo.' },
  { customerId: '58013061', caso: 'Reconexión y cambio de plan', resumen: 'Varios movimientos: reconexión, prorrateos y migración de plan.' },
  { customerId: '115358834', caso: 'Estable con deuda', resumen: 'Seis ciclos de S/ 83.99 sin variación, recibo actual pendiente de pago.' },
  { customerId: '103352291', caso: 'Consumo adicional', resumen: 'Sube S/ 81.57 por tráfico fuera del plan.' },
  { customerId: '51805212', caso: 'Descuento vigente', resumen: 'Baja de S/ 39.90 a S/ 29.90 por un descuento recurrente.' }
];

function leerCsv(archivo, delimitador, alLeerFila) {
  return new Promise((resolve, reject) => {
    const ruta = path.join(DATA, archivo);
    if (!fs.existsSync(ruta)) {
      reject(new Error(`No se encontró ${ruta}`));
      return;
    }

    const lector = readline.createInterface({
      input: fs.createReadStream(ruta, 'utf8'),
      crlfDelay: Infinity
    });

    let cabeceras = null;
    lector.on('line', (linea) => {
      if (cabeceras === null) {
        cabeceras = linea.replace(/^﻿/, '').split(delimitador).map((c) => c.trim());
        return;
      }
      if (!linea.trim()) return;

      const celdas = linea.split(delimitador);
      const fila = {};
      cabeceras.forEach((c, i) => { fila[c] = (celdas[i] || '').trim(); });
      alLeerFila(fila);
    });

    lector.on('error', reject);
    lector.on('close', resolve);
  });
}

/** Celular de acceso estable: 9 dígitos, derivado del CUSTOMER_KEY. */
function celularDeAcceso(customerId, usados) {
  const digitos = String(customerId).replace(/\D/g, '').slice(-8).padStart(8, '0');
  let candidato = `9${digitos}`;

  // Si dos clientes colisionan, se corre el último dígito.
  let intento = 0;
  while (usados.has(candidato)) {
    intento += 1;
    candidato = `9${digitos.slice(0, 7)}${(Number(digitos[7]) + intento) % 10}`;
  }
  usados.add(candidato);
  return candidato;
}

function antiguedadEnMeses(fechaActivacion) {
  const partes = String(fechaActivacion || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!partes) return null;

  const alta = new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]));
  const meses = Math.floor((Date.now() - alta.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  return meses > 0 ? meses : null;
}

async function main() {
  const buscados = new Set(ELEGIDOS.map((e) => e.customerId));

  // 1. Ciclos y totales reales de cada elegido.
  const porCliente = new Map();
  await leerCsv('Cargos_FacturadosV2.csv', ';', (fila) => {
    if (!buscados.has(fila.CUSTOMER_KEY)) return;
    if (fila.GRUPO === 'NO CONSIDERAR') return;

    if (!porCliente.has(fila.CUSTOMER_KEY)) {
      porCliente.set(fila.CUSTOMER_KEY, { ciclos: new Map(), cuenta: fila.FINANCIAL_ACCOUNT_KEY });
    }
    const datos = porCliente.get(fila.CUSTOMER_KEY);
    const previo = datos.ciclos.get(fila.ciclo) || 0;
    datos.ciclos.set(fila.ciclo, previo + (Number(fila.CHARGE_TOTAL_AMOUNT) || 0));
  });

  // 2. Tipo de servicio y antigüedad, de la planta.
  const planta = new Map();
  await leerCsv('PLANTA CLIENTES.csv', ';', (fila) => {
    if (!buscados.has(fila.COD_CLIENTE) || planta.has(fila.COD_CLIENTE)) return;
    planta.set(fila.COD_CLIENTE, {
      servicio: fila.lob_type || '',
      negocio: fila.negocio || '',
      alta: fila.fecha_activacion_original || '',
      ciclo: fila.ciclo || ''
    });
  });

  const usados = new Set();
  const cuentas = [];
  const descartados = [];

  for (const elegido of ELEGIDOS) {
    const datos = porCliente.get(elegido.customerId);

    if (!datos || datos.ciclos.size < 6) {
      descartados.push(`${elegido.customerId} (${datos ? datos.ciclos.size : 0} ciclos)`);
      continue;
    }

    const ordenados = [...datos.ciclos.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const serie = ordenados.slice(0, 6).map(([, total]) => Math.round(total * 100) / 100);
    const info = planta.get(elegido.customerId) || {};

    cuentas.push({
      phone: celularDeAcceso(elegido.customerId, usados),
      password: PASSWORD,
      customerId: elegido.customerId,
      // Etiqueta descriptiva, no un nombre de persona: la data está anonimizada.
      name: `Cliente ${elegido.customerId}`,
      caso: elegido.caso,
      resumen: elegido.resumen,
      servicio: info.servicio || null,
      negocio: info.negocio || null,
      fechaAlta: info.alta || null,
      antiguedadMeses: antiguedadEnMeses(info.alta),
      cuentaFinanciera: datos.cuenta || null,
      // Del más reciente al más antiguo; sirve para verificar la demo.
      ultimosTotales: serie
    });
  }

  fs.writeFileSync(SALIDA, JSON.stringify({
    generadoEl: new Date().toISOString().slice(0, 10),
    password: PASSWORD,
    nota: 'Generado por scripts/generarCuentasDemo.js desde la data real. El celular es una credencial de acceso, no el teléfono del cliente: el dataset está anonimizado.',
    cuentas
  }, null, 2) + '\n');

  console.log(`✅ ${cuentas.length} cuentas escritas en ${SALIDA}`);
  cuentas.forEach((c) => {
    console.log(`   ${c.phone}  →  ${c.customerId}  ${(c.servicio || '?').padEnd(5)} ${c.caso}`);
    console.log(`              serie: ${c.ultimosTotales.join(' · ')}`);
  });

  if (descartados.length > 0) {
    console.warn(`⚠️ Descartados por no tener 6 ciclos: ${descartados.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('Error generando las cuentas:', error.message);
  process.exit(1);
});
