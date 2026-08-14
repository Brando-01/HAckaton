/**
 * Mide la latencia del motor de recibos, por mensaje.
 *
 *     node scripts/medirLatencia.js [muestras]
 *
 * El §7 de CLAUDE.md pide medir p50/p95 antes y después de indexar la data,
 * porque la latencia percibida es criterio de demo. Este script deja la cifra
 * registrada en vez de afirmarla de memoria.
 *
 * Compara los dos caminos sobre los MISMOS clientes:
 *
 *   ANTES  buildCustomerBillingSummary, que recorre todos los archivos de
 *          data/ con readFileSync en cada llamada.
 *   AHORA  obtenerHechosDeCliente, que consulta el índice en memoria.
 *
 * La construcción del índice se hace una vez y se mide aparte: se paga al
 * arrancar, no en cada mensaje.
 */

const path = require('path');

const {
  obtenerHechosDeCliente,
  listarClientesConHistorial,
  precargarIndice
} = require('../services/cargosRepository');
const { buildCustomerBillingSummary } = require('../services/dataContextService');

const DATA = path.resolve(__dirname, '..', 'data');
const MUESTRAS = Number(process.argv[2] || 40);

/** Cuántas llamadas del camino viejo medir: cada una tarda segundos. */
const MUESTRAS_LENTAS = Math.min(MUESTRAS, 5);

function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, indice)];
}

function resumir(nombre, tiempos) {
  const total = tiempos.reduce((s, t) => s + t, 0);
  console.log(`\n${nombre}`);
  console.log(`  muestras : ${tiempos.length}`);
  console.log(`  p50      : ${percentil(tiempos, 50).toFixed(1)} ms`);
  console.log(`  p95      : ${percentil(tiempos, 95).toFixed(1)} ms`);
  console.log(`  max      : ${Math.max(...tiempos).toFixed(1)} ms`);
  console.log(`  media    : ${(total / tiempos.length).toFixed(1)} ms`);
  return { p50: percentil(tiempos, 50), p95: percentil(tiempos, 95) };
}

async function main() {
  console.log('Construyendo el índice (coste único, al arrancar el servidor)...');
  const inicioIndice = Date.now();
  const estado = await precargarIndice(DATA);
  const msIndice = Date.now() - inicioIndice;

  if (!estado.disponible) {
    console.error('No se encontró backend/data/Cargos_FacturadosV2.csv');
    process.exit(1);
  }

  console.log(`  ${estado.filas.toLocaleString('es-PE')} filas, ${estado.clientes.toLocaleString('es-PE')} clientes en ${msIndice} ms`);

  const clientes = (await listarClientesConHistorial(DATA, 6, MUESTRAS)).map((c) => c.cliente);
  console.log(`\nMidiendo sobre ${clientes.length} clientes con 6 ciclos.`);

  // --- Camino actual: índice en memoria ---
  const conIndice = [];
  for (const cliente of clientes) {
    const t0 = process.hrtime.bigint();
    await obtenerHechosDeCliente(DATA, cliente);
    conIndice.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const ahora = resumir('AHORA — índice en memoria', conIndice);

  // --- Camino anterior: releer los CSV en cada mensaje ---
  console.log(`\nMidiendo el camino anterior sobre ${MUESTRAS_LENTAS} clientes (tarda segundos por llamada)...`);
  const sinIndice = [];
  for (const cliente of clientes.slice(0, MUESTRAS_LENTAS)) {
    const t0 = process.hrtime.bigint();
    buildCustomerBillingSummary(DATA, cliente);
    sinIndice.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const antes = resumir('ANTES — releyendo data/ en cada mensaje', sinIndice);

  const mejoraP50 = antes.p50 / Math.max(ahora.p50, 0.001);
  const mejoraP95 = antes.p95 / Math.max(ahora.p95, 0.001);

  console.log('\n─────────────────────────────────────────────');
  console.log(`p50: ${antes.p50.toFixed(0)} ms → ${ahora.p50.toFixed(1)} ms  (${mejoraP50.toFixed(0)}× más rápido)`);
  console.log(`p95: ${antes.p95.toFixed(0)} ms → ${ahora.p95.toFixed(1)} ms  (${mejoraP95.toFixed(0)}× más rápido)`);
  console.log(`Índice: ${msIndice} ms una sola vez al arrancar.`);
  console.log('─────────────────────────────────────────────');
}

main().catch((error) => {
  console.error('Error midiendo:', error);
  process.exit(1);
});
