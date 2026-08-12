// backend/convertirData.js
const fs = require('fs');
const path = require('path');

// Esta función simula la lectura de un archivo CSV/JSON crudo y lo transforma
// al formato indexado por DNI que necesita tu RAG.
function estructurarDatasetOficial(dataCruda) {
  const datasetEstructurado = {};

  dataCruda.forEach((item) => {
    // Ajustas los nombres de las columnas según lo que te entregue la organización
    const dni = item.dni || item.DNI || item.documento;

    datasetEstructurado[dni] = {
      nombre: item.nombre || "Cliente",
      dni: dni,
      recibo_actual: {
        periodo: item.periodo_actual || "Mes Actual",
        monto: parseFloat(item.monto_actual || 0),
        vencimiento: item.fecha_vencimiento || "A definir"
      },
      recibos_anteriores: [
        { periodo: "Mes Anterior", monto: parseFloat(item.monto_anterior || 0) }
      ],
      variacion: {
        diferencia: item.diferencia || "S/ 0.00",
        motivo: item.motivo_variacion || item.causa || "Sin variaciones reportadas."
      }
    };
  });

  return datasetEstructurado;
}

// Ejemplo de uso:
// const dataCruda = JSON.parse(fs.readFileSync('dataset_organizadores.json'));
// const dataLista = estructurarDatasetOficial(dataCruda);
// fs.writeFileSync('./data/recibos_demo.json', JSON.stringify(dataLista, null, 2));

console.log("🛠️ Script de conversión listo para ser usado el día del evento.");