// services/nboService.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

let catalogoOfertas = [];

// Cargar catálogo de ofertas al iniciar
function cargarCatalogo() {
  const rutaCatalogo = path.resolve(__dirname, '../catalogo_ofertas_entrega.csv');
  if (!fs.existsSync(rutaCatalogo)) return;

  fs.createReadStream(rutaCatalogo)
    .pipe(csv())
    .on('data', (row) => catalogoOfertas.push(row))
    .on('end', () => console.log('✅ Catálogo de ofertas NBO cargado exitosamente.'));
}

cargarCatalogo();

/**
 * Regla / Modelo de inferencia para determinar la Next Best Offer (NBO)
 */
function recomendarOferta(perfilCliente) {
  // Regla prioritaria: Si es elegible para Movistar Total (MT), ofrecer MT
  if (perfilCliente.elegible_mt === 'True' || perfilCliente.elegible_mt === true) {
    const ofertaMT = catalogoOfertas.find(o => o.es_movistar_total === 'True' || o.es_movistar_total === true);
    return {
      nbo: ofertaMT || { nombre_oferta: 'Movistar Total Dúo 200 Mbps', precio_mensual: 119.90 },
      probabilidad_aceptacion: 0.85,
      canal_sugerido: perfilCliente.canal_mas_usado || 'Digital',
      motivo: 'Cliente elegible para paquete convergente con descuento especial (hasta 50% de ahorro).',
      rebate_sugerido: 'Bono adicional de 20GB por 3 meses si duda en aceptar'
    };
  }

  // Si consume muchos datos móviles -> Upgrade Móvil
  if (parseFloat(perfilCliente.consumo_datos_gb_prom || 0) > 30) {
    return {
      nbo: { nombre_oferta: 'Plan Móvil Ilimitado Gigas', precio_mensual: 69.90 },
      probabilidad_aceptacion: 0.72,
      canal_sugerido: 'Digital',
      motivo: 'Alto consumo de datos móviles detectado en los últimos 6 meses.',
      rebate_sugerido: 'Descuento del 20% en los primeros 3 meses'
    };
  }

  // Oferta por defecto
  return {
    nbo: { nombre_oferta: 'Fibra Hogar 200Mbps', precio_mensual: 89.90 },
    probabilidad_aceptacion: 0.60,
    canal_sugerido: 'Call Out',
    motivo: 'Oferta estándar de fidelización.',
    rebate_sugerido: 'Instalación costo S/0'
  };
}

module.exports = {
  recomendarOferta
};