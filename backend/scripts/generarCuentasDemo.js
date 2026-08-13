/**
 * Genera las cuentas de acceso de la demo a partir de la data real.
 *
 *     node scripts/generarCuentasDemo.js
 *
 * Escribe `data/cuentas-demo.json`, que es lo que siembra `authService`.
 *
 * Los clientes NO están escritos a mano: el script recorre a todos los que
 * tienen 6 ciclos facturados, les pasa el motor de diff y se queda con el
 * ejemplo más claro de cada causa que el motor sabe clasificar. Si mañana
 * cambia la data o la clasificación, la selección cambia con ella.
 *
 * Por qué hacen falta credenciales generadas: el dataset está anonimizado.
 * `PLANTA CLIENTES` solo trae `telefono_hash` (SHA-256, irreversible) y los
 * BRAINY_* traen `Telefono` y `numerodocumento` como "xxxx". No hay ningún
 * celular ni documento con el que iniciar sesión, así que se fabrica una
 * credencial de acceso y se la ata a un CUSTOMER_KEY que sí existe.
 *
 * El celular es de acceso, no del cliente. El nombre mostrado es una
 * etiqueta, no una identidad: inventar nombres de persona sobre datos
 * anonimizados sería simular información que no tenemos.
 */

const fs = require('fs');
const path = require('path');

const {
  obtenerHechosDeCliente,
  listarClientesConHistorial
} = require('../services/cargosRepository');

const DATA = path.resolve(__dirname, '..', 'data');
const SALIDA = path.join(DATA, 'cuentas-demo.json');
const PASSWORD = 'Demo1234!';

/**
 * Cuántos clientes revisar. Con 6 ciclos hay ~13 mil y el motor por cliente
 * es barato, así que se barren todos: con una muestra parcial se perdían
 * casos que solo aparecen más adelante en el archivo.
 */
const A_REVISAR = Number(process.env.CLIENTES_A_REVISAR || 20000);

/** Etiquetas legibles de cada causa que emite el motor. */
const NOMBRE_CAUSA = {
  RECONEXION: 'Reconexión tras suspensión',
  FIN_DESCUENTO: 'Fin de descuento',
  NUEVO_DESCUENTO: 'Descuento aplicado',
  PRORRATEO: 'Cobro proporcional por días',
  CAMBIO_PLAN: 'Cambio de plan',
  CONSUMO_ADICIONAL: 'Consumo fuera del plan',
  CARGO_TERCEROS: 'Servicios de terceros',
  PAQUETE: 'Paquetes contratados',
  NOTA_CREDITO: 'Nota de crédito',
  CUOTA_EQUIPO: 'Cuota de equipo',
  AJUSTE_TARIFA: 'Ajuste de tarifa',
  SIN_VARIACION: 'Recibo estable',
  PICO_HISTORICO: 'Pico en un recibo anterior'
};

function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

/** Celular de acceso estable: 9 dígitos, derivado del CUSTOMER_KEY. */
function celularDeAcceso(customerId, usados) {
  const digitos = String(customerId).replace(/\D/g, '').slice(-8).padStart(8, '0');
  let candidato = `9${digitos}`;

  let intento = 0;
  while (usados.has(candidato)) {
    intento += 1;
    candidato = `9${digitos.slice(0, 7)}${(Number(digitos[7]) + intento) % 10}`;
  }
  usados.add(candidato);
  return candidato;
}

/**
 * Clasifica al cliente en el caso que mejor demuestra.
 *
 * Además de la causa del último recibo, detecta el caso "pico histórico":
 * un recibo muy alto en un ciclo pasado, que es lo que permite demostrar
 * preguntas como "¿por qué mi recibo de marzo salió tan alto?".
 */
function clasificar(hechos) {
  const totales = hechos.historial.map((ciclo) => ciclo.total);
  const maximo = Math.max(...totales);
  const mediana = [...totales].sort((a, b) => a - b)[Math.floor(totales.length / 2)];

  // El pico tiene que estar en un ciclo viejo, no en el actual.
  const picoViejo = maximo > mediana * 2.5
    && maximo > 100
    && totales.indexOf(maximo) > 0;

  if (picoViejo) {
    return {
      caso: 'PICO_HISTORICO',
      relevancia: maximo - mediana,
      resumen: `Pico de S/ ${maximo.toFixed(2)} en un ciclo anterior; sirve para preguntar por un recibo pasado.`
    };
  }

  if (hechos.causas.length === 0) {
    // Un recibo estable de S/ 0.00 no demuestra nada, así que el monto pesa.
    // Y uno con deuda pendiente da más juego que uno ya pagado.
    const multiplicador = hechos.reciboActual.deuda === 'CON DEUDA' ? 2 : 1;

    return {
      caso: 'SIN_VARIACION',
      relevancia: Math.max(hechos.reciboActual.total, 0) * multiplicador,
      resumen: `Seis ciclos de S/ ${hechos.reciboActual.total.toFixed(2)} sin variación. Comprueba que no se inventen causas.`
    };
  }

  const principal = hechos.causas[0];
  const detalle = hechos.causas.length > 1
    ? ` Junto con ${NOMBRE_CAUSA[hechos.causas[1].codigo] || hechos.causas[1].codigo} (S/ ${hechos.causas[1].impacto.toFixed(2)}).`
    : '';

  // Un recibo con una sola causa se explica mucho mejor en una demo que uno
  // donde tres movimientos se compensan, así que pesa más. Y una causa que
  // mueve el recibo en la dirección que uno espera (la reconexión lo sube, el
  // descuento lo baja) es más didáctica que una que lo mueve al revés.
  const esUnicaCausa = hechos.causas.length === 1;
  const direccionEsperada = { RECONEXION: 1, FIN_DESCUENTO: 1, CONSUMO_ADICIONAL: 1, CARGO_TERCEROS: 1, PAQUETE: 1, CUOTA_EQUIPO: 1, NUEVO_DESCUENTO: -1, NOTA_CREDITO: -1 };
  const esperada = direccionEsperada[principal.codigo];
  const vaEnSuDireccion = !esperada || Math.sign(principal.impacto) === esperada;

  let relevancia = Math.abs(principal.impacto);
  if (esUnicaCausa) relevancia *= 3;
  if (!vaEnSuDireccion) relevancia /= 4;

  return {
    caso: principal.codigo,
    relevancia,
    resumen: `${hechos.variacion.direccion === 'AUMENTO' ? 'Sube' : 'Baja'} S/ ${Math.abs(hechos.variacion.monto).toFixed(2)} por ${(NOMBRE_CAUSA[principal.codigo] || principal.codigo).toLowerCase()}.${detalle}`
  };
}

async function main() {
  console.log(`Revisando hasta ${A_REVISAR} clientes con 6 ciclos...`);
  const candidatos = await listarClientesConHistorial(DATA, 6, A_REVISAR);
  console.log(`  ${candidatos.length} candidatos.`);

  // Mejor ejemplo de cada caso.
  const mejores = new Map();
  let revisados = 0;

  for (const { cliente } of candidatos) {
    const hechos = await obtenerHechosDeCliente(DATA, cliente);
    if (!hechos.encontrado || hechos.historial.length < 6) {
      continue;
    }

    revisados += 1;
    const { caso, relevancia, resumen } = clasificar(hechos);
    const previo = mejores.get(caso);

    // Ante empate, gana el CUSTOMER_KEY menor: así regenerar da lo mismo.
    const gana = !previo
      || relevancia > previo.relevancia
      || (relevancia === previo.relevancia && cliente < previo.customerId);

    if (gana) {
      mejores.set(caso, {
        customerId: cliente,
        relevancia,
        caso,
        resumen,
        hechos
      });
    }
  }

  console.log(`  ${revisados} con historial completo; ${mejores.size} casos distintos encontrados.`);

  const usados = new Set();
  const cuentas = [];

  // Orden estable: por nombre de caso.
  for (const elegido of [...mejores.values()].sort((a, b) => a.caso.localeCompare(b.caso))) {
    const { hechos } = elegido;

    cuentas.push({
      phone: celularDeAcceso(elegido.customerId, usados),
      password: PASSWORD,
      customerId: elegido.customerId,
      name: `Cliente ${elegido.customerId}`,
      caso: NOMBRE_CAUSA[elegido.caso] || elegido.caso,
      codigoCaso: elegido.caso,
      resumen: elegido.resumen,
      servicios: hechos.servicio ? hechos.servicio.servicios : [],
      antiguedadMeses: hechos.servicio ? hechos.servicio.antiguedadMeses : null,
      cuentaFinanciera: hechos.cuentaFinanciera || null,
      deuda: hechos.reciboActual.deuda || null,
      // Del más reciente al más antiguo; el test lo compara contra el motor.
      ultimosTotales: hechos.historial.map((ciclo) => redondear(ciclo.total))
    });
  }

  fs.writeFileSync(SALIDA, JSON.stringify({
    generadoEl: new Date().toISOString().slice(0, 10),
    password: PASSWORD,
    nota: 'Generado por scripts/generarCuentasDemo.js. Los clientes se eligen automáticamente: se busca el ejemplo más claro de cada causa que clasifica el motor. El celular es una credencial de acceso, no el teléfono del cliente: el dataset está anonimizado.',
    cuentas
  }, null, 2) + '\n');

  console.log(`\n✅ ${cuentas.length} cuentas escritas en ${SALIDA}\n`);
  cuentas.forEach((c) => {
    console.log(`   ${c.phone}  →  ${c.customerId}  ${c.caso}`);
    console.log(`              ${c.resumen}`);
    console.log(`              serie: ${c.ultimosTotales.join(' · ')}`);
  });
}

main().catch((error) => {
  console.error('Error generando las cuentas:', error);
  process.exit(1);
});
