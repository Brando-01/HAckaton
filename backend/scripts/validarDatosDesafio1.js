const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const { close } = require('./desafio1/sqliteHelpers');
const {
  runValidation,
  printValidationResults,
  hasBlockingErrors
} = require('./desafio1/validation');

const DB_PATH = process.env.DESAFIO1_DB_PATH
  ? path.resolve(process.env.DESAFIO1_DB_PATH)
  : path.resolve(__dirname, '../data/desafio1.db');

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ No existe ${DB_PATH}`);
    console.error('Ejecuta primero: npm run data:import:desafio1');
    process.exitCode = 1;
    return;
  }

  console.log(`🗄️ Validando: ${DB_PATH}`);
  const db = new sqlite3.Database(DB_PATH);

  try {
    const results = await runValidation(db, { persist: true });
    printValidationResults(results);

    if (hasBlockingErrors(results)) {
      console.error('\n❌ Hay errores críticos de relación en la base.');
      process.exitCode = 1;
    } else {
      console.log('\n✅ No se encontraron errores críticos de relación.');
    }
  } finally {
    await close(db);
  }
}

main().catch((error) => {
  console.error(`❌ ${error.stack || error.message}`);
  process.exitCode = 1;
});
