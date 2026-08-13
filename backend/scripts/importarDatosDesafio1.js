const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const { DATASETS, INDEX_STATEMENTS } = require('./desafio1/datasets');
const {
  normalizeHeader,
  normalizeByType,
  shouldCountParseWarning,
  validateHeaders,
  sha256File
} = require('./desafio1/importUtils');
const { run, close } = require('./desafio1/sqliteHelpers');
const {
  runValidation,
  printValidationResults,
  hasBlockingErrors
} = require('./desafio1/validation');

const DATA_DIR = process.env.DESAFIO1_DATA_DIR
  ? path.resolve(process.env.DESAFIO1_DATA_DIR)
  : path.resolve(__dirname, '../data/oficial');

const FINAL_DB_PATH = process.env.DESAFIO1_DB_PATH
  ? path.resolve(process.env.DESAFIO1_DB_PATH)
  : path.resolve(__dirname, '../data/desafio1.db');

const TEMP_DB_PATH = `${FINAL_DB_PATH}.tmp`;
const MAX_PENDING_INSERTS = 1000;
const RESUME_AT_PENDING = 400;

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}


function getDatasetCandidates(dataset) {
  return [dataset.fileName, ...(dataset.aliases || [])];
}

function resolveDatasetFile(dataset) {
  const found = getDatasetCandidates(dataset)
    .map((fileName) => ({
      fileName,
      filePath: path.join(DATA_DIR, fileName)
    }))
    .filter((candidate) => fs.existsSync(candidate.filePath));

  if (found.length === 0) {
    throw new Error(
      `No se encontró ${getDatasetCandidates(dataset).join(' ni ')} en ${DATA_DIR}`
    );
  }

  if (found.length > 1) {
    throw new Error(
      `Hay más de una copia candidata para ${dataset.key}: `
      + `${found.map((candidate) => candidate.fileName).join(', ')}. `
      + 'Deja solo la versión que quieras importar.'
    );
  }

  return found[0];
}

function getInsertSql(dataset) {
  const targets = dataset.columns.map((column) => column.target).concat('source_row');
  const placeholders = targets.map(() => '?').join(', ');
  return `INSERT INTO ${dataset.tableName} (${targets.join(', ')}) VALUES (${placeholders})`;
}

function expectedHeaders(dataset) {
  return dataset.columns.map((column) => column.source);
}

function mapRow(dataset, row, sourceRow, warningCounter) {
  const mapped = dataset.columns.map((column) => {
    const rawValue = row[column.source];
    const normalized = normalizeByType(column.type, rawValue);

    if (shouldCountParseWarning(column.type, rawValue, normalized)) {
      warningCounter.total += 1;
      const key = `${column.source}:${column.type}`;
      warningCounter.byField.set(key, (warningCounter.byField.get(key) || 0) + 1);
    }

    return normalized;
  });

  mapped.push(sourceRow);
  return mapped;
}

async function createSchema(db) {
  await run(db, `
    CREATE TABLE d1_import_metadata (
      dataset_key TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      imported_rows INTEGER NOT NULL,
      delimiter TEXT NOT NULL,
      header_json TEXT NOT NULL,
      parse_warning_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL
    )
  `);

  for (const dataset of DATASETS) {
    await run(db, dataset.createTableSql);
  }
}

async function importDataset(db, dataset) {
  const resolvedFile = resolveDatasetFile(dataset);
  const { filePath, fileName: actualFileName } = resolvedFile;
  const fileStat = fs.statSync(filePath);
  const fileHash = await sha256File(filePath);
  const warningCounter = { total: 0, byField: new Map() };
  const insertSql = getInsertSql(dataset);

  console.log(`\n📥 ${actualFileName}`);
  console.log(`   Tabla: ${dataset.tableName}`);

  await run(db, 'BEGIN TRANSACTION');

  try {
    const streamResult = await new Promise((resolve, reject) => {
      let rowCount = 0;
      let pending = 0;
      let streamFinished = false;
      let streamPaused = false;
      let finalizing = false;
      let fatalError = null;
      let headersSeen = null;

      const stmt = db.prepare(insertSql);
      const stream = fs
        .createReadStream(filePath)
        .pipe(csv({
          separator: dataset.delimiter,
          mapHeaders: ({ header }) => normalizeHeader(header)
        }));

      const finish = () => {
        if (finalizing || !streamFinished || pending > 0) return;
        finalizing = true;

        stmt.finalize((finalizeError) => {
          if (finalizeError && !fatalError) fatalError = finalizeError;

          if (fatalError) {
            reject(fatalError);
            return;
          }

          resolve({ rowCount, headersSeen });
        });
      };

      stream.on('headers', (headers) => {
        headersSeen = headers.map(normalizeHeader);
        const comparison = validateHeaders(headersSeen, expectedHeaders(dataset));

        if (!comparison.ok) {
          const parts = [];
          if (comparison.missing.length) {
            parts.push(`faltan: ${comparison.missing.join(', ')}`);
          }
          if (comparison.unexpected.length) {
            parts.push(`sobran: ${comparison.unexpected.join(', ')}`);
          }
          fatalError = new Error(
            `La estructura de ${actualFileName} cambió (${parts.join('; ')}). `
            + 'Detén la importación y revisa la nueva versión del dataset.'
          );
          stream.destroy(fatalError);
        }
      });

      stream.on('data', (row) => {
        if (fatalError) return;

        rowCount += 1;
        const sourceRow = rowCount + 1;
        let params;

        try {
          params = mapRow(dataset, row, sourceRow, warningCounter);
        } catch (error) {
          fatalError = new Error(
            `${actualFileName}, fila ${sourceRow}: ${error.message}`
          );
          stream.destroy(fatalError);
          return;
        }

        pending += 1;
        if (pending >= MAX_PENDING_INSERTS && !streamPaused) {
          stream.pause();
          streamPaused = true;
        }

        stmt.run(params, (error) => {
          pending -= 1;

          if (error && !fatalError) {
            fatalError = new Error(
              `${actualFileName}, fila ${sourceRow}: ${error.message}`
            );
            stream.destroy(fatalError);
          }

          if (streamPaused && pending <= RESUME_AT_PENDING && !fatalError) {
            streamPaused = false;
            stream.resume();
          }

          finish();
        });

        if (rowCount % 50000 === 0) {
          console.log(`   … ${rowCount.toLocaleString('es-PE')} filas leídas`);
        }
      });

      stream.on('end', () => {
        streamFinished = true;
        finish();
      });

      stream.on('error', (error) => {
        if (!fatalError) fatalError = error;
        streamFinished = true;
        finish();
      });
    });

    await run(db, 'COMMIT');

    await run(
      db,
      `
        INSERT INTO d1_import_metadata (
          dataset_key,
          file_name,
          sha256,
          file_size_bytes,
          imported_rows,
          delimiter,
          header_json,
          parse_warning_count,
          imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        dataset.key,
        actualFileName,
        fileHash,
        fileStat.size,
        streamResult.rowCount,
        dataset.delimiter,
        JSON.stringify(streamResult.headersSeen || []),
        warningCounter.total,
        new Date().toISOString()
      ]
    );

    console.log(`   ✅ ${streamResult.rowCount.toLocaleString('es-PE')} filas importadas.`);
    if (warningCounter.total > 0) {
      console.log(`   ⚠️ ${warningCounter.total.toLocaleString('es-PE')} valores no pudieron normalizarse.`);
      for (const [field, count] of warningCounter.byField.entries()) {
        console.log(`      - ${field}: ${count.toLocaleString('es-PE')}`);
      }
    }

    return {
      key: dataset.key,
      fileName: actualFileName,
      rows: streamResult.rowCount,
      warnings: warningCounter.total,
      sha256: fileHash
    };
  } catch (error) {
    try {
      await run(db, 'ROLLBACK');
    } catch {
      // Si SQLite ya cerró la transacción por el error original, conservamos ese error.
    }
    throw error;
  }
}

async function createIndexes(db) {
  console.log('\n⚙️ Creando índices para consultas de facturación...');
  for (const statement of INDEX_STATEMENTS) {
    await run(db, statement);
  }
  console.log(`   ✅ ${INDEX_STATEMENTS.length} índices creados.`);
}

async function configureImportDatabase(db) {
  await run(db, 'PRAGMA foreign_keys = OFF');
  await run(db, 'PRAGMA journal_mode = OFF');
  await run(db, 'PRAGMA synchronous = OFF');
  await run(db, 'PRAGMA temp_store = MEMORY');
  await run(db, 'PRAGMA cache_size = -64000');
}

async function main() {
  ensureDirectory(path.dirname(FINAL_DB_PATH));
  ensureDirectory(DATA_DIR);
  removeIfExists(TEMP_DB_PATH);

  console.log('===================================================');
  console.log('  FASE 1 · IMPORTACIÓN DATASET OFICIAL DESAFÍO 1');
  console.log('===================================================');
  console.log(`📂 Datos: ${DATA_DIR}`);
  console.log(`🗄️ Base destino: ${FINAL_DB_PATH}`);
  console.log('ℹ️ La aplicación actual sigue usando app.db. Esta importación no la reemplaza.');

  const missingDatasets = DATASETS.filter((dataset) =>
    !getDatasetCandidates(dataset).some((fileName) =>
      fs.existsSync(path.join(DATA_DIR, fileName))
    )
  );

  if (missingDatasets.length > 0) {
    console.error('\n❌ Faltan archivos requeridos:');
    for (const dataset of missingDatasets) {
      console.error(`   - ${getDatasetCandidates(dataset).join(' o ')}`);
    }
    console.error(`\nCópialos a: ${DATA_DIR}`);
    process.exitCode = 1;
    return;
  }

  const db = new sqlite3.Database(TEMP_DB_PATH);
  let succeeded = false;

  try {
    await configureImportDatabase(db);
    await createSchema(db);

    const summaries = [];
    for (const dataset of DATASETS) {
      summaries.push(await importDataset(db, dataset));
    }

    await createIndexes(db);

    const validationResults = await runValidation(db, { persist: true });
    printValidationResults(validationResults);

    console.log('\n📊 Resumen de importación');
    for (const summary of summaries) {
      console.log(
        `   ${summary.fileName}: ${summary.rows.toLocaleString('es-PE')} filas`
        + (summary.warnings ? ` · ${summary.warnings.toLocaleString('es-PE')} warnings` : '')
      );
    }

    if (hasBlockingErrors(validationResults)) {
      throw new Error(
        'La importación terminó, pero una o más relaciones críticas fallaron. '
        + 'No se reemplazará desafio1.db.'
      );
    }

    await run(db, 'ANALYZE');
    succeeded = true;
  } catch (error) {
    console.error(`\n❌ ${error.message}`);
    process.exitCode = 1;
  } finally {
    try {
      await close(db);
    } catch (error) {
      console.error(`⚠️ No se pudo cerrar la base temporal: ${error.message}`);
      process.exitCode = 1;
      succeeded = false;
    }
  }

  if (!succeeded) {
    removeIfExists(TEMP_DB_PATH);
    return;
  }

  removeIfExists(FINAL_DB_PATH);
  fs.renameSync(TEMP_DB_PATH, FINAL_DB_PATH);

  console.log('\n🎉 Fase 1 completada.');
  console.log(`   Base generada: ${FINAL_DB_PATH}`);
  console.log('   El frontend, Lucía, login y handoff aún no consumen esta base.');
  console.log('   El siguiente paso será reconstruir recibos y evidencias (Fase 2).');
}

main().catch((error) => {
  console.error(`\n❌ Error inesperado: ${error.stack || error.message}`);
  removeIfExists(TEMP_DB_PATH);
  process.exitCode = 1;
});
