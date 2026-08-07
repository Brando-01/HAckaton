const { procesarConsultaFactura } = require('./services/ragService');

(async () => {
  console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'SET' : 'NOT SET');
  console.log('--- HOLA ---');
  console.log(await procesarConsultaFactura('hola', 'debug-session', false));
  console.log('--- SI ---');
  console.log(await procesarConsultaFactura('si', 'debug-session', false));
  console.log('--- HOLA next ---');
  console.log(await procesarConsultaFactura('hola', 'debug-session', false));
})();
