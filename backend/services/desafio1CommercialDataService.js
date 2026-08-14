const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const DEFAULT_DB_PATH = path.resolve(
  __dirname,
  '../data/app.db'
);

const DEFAULT_CATALOG_PATH = path.resolve(
  __dirname,
  '../data/catalogo_ofertas_entrega.csv'
);

function normalizeBool(value) {
  return ['true', '1', 'si', 'yes']
    .includes(
      String(value ?? '')
        .trim()
        .toLowerCase()
    );
}

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : null;
}

function mapProfile(row) {
  if (!row) {
    return null;
  }

  return {
    customerId:
      String(row.cliente_id || '').trim(),
    customerType:
      String(row.tipo_cliente || '').trim() || null,
    hasMobile:
      normalizeBool(row.tiene_movil),
    hasHome:
      normalizeBool(row.tiene_hogar),
    isMovistarTotal:
      normalizeBool(row.es_movistar_total),
    eligibleMovistarTotal:
      normalizeBool(row.elegible_mt),
    currentOfferId:
      String(row.plan_actual_id || '').trim() || null,
    averageDataGb:
      nullableNumber(row.consumo_datos_gb_prom),
    complaintCount:
      nullableNumber(row.n_reclamos),
    preferredChannel:
      String(row.canal_mas_usado || '').trim() || null
  };
}

function mapCampaign(row) {
  if (!row) {
    return null;
  }

  return {
    offerId:
      String(row.oferta_id || '').trim() || null,
    date:
      String(row.fecha || '').trim() || null,
    result:
      String(row.resultado || '').trim() || null
  };
}

function mapOffer(row) {
  if (!row) {
    return null;
  }

  return {
    offerId:
      String(row.oferta_id || '').trim(),
    name:
      String(row.nombre_oferta || '').trim(),
    offerType:
      String(row.tipo_oferta || '').trim(),
    targetSegment:
      String(row.segmento_objetivo || '').trim() || null,
    isMovistarTotal:
      normalizeBool(row.es_movistar_total),
    monthlyPrice:
      nullableNumber(row.precio_mensual),
    savingsPct:
      nullableNumber(row.ahorro_pct),
    includedGb:
      nullableNumber(row.gb_incluidos),
    shortDescription:
      String(row.descripcion_corta || '').trim() || null
  };
}

function openDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(
      dbPath,
      sqlite3.OPEN_READONLY,
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(db);
      }
    );
  });
}

function getOne(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row || null);
    });
  });
}

function getAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows || []);
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }

    db.close(() => resolve());
  });
}

function loadCatalog(catalogPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(catalogPath)) {
      const error = new Error(
        'No está disponible el catálogo comercial simulado.'
      );
      error.code = 'COMMERCIAL_CATALOG_NOT_FOUND';
      reject(error);
      return;
    }

    const rows = [];

    fs.createReadStream(catalogPath)
      .pipe(csv())
      .on('data', (row) => {
        const mapped = mapOffer(row);
        if (mapped?.offerId && mapped?.name) {
          rows.push(mapped);
        }
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

class Desafio1CommercialDataService {
  constructor({
    dbPath = DEFAULT_DB_PATH,
    catalogPath = DEFAULT_CATALOG_PATH
  } = {}) {
    this.dbPath = dbPath;
    this.catalogPath = catalogPath;
    this.catalogPromise = null;
  }

  async getCatalog() {
    if (!this.catalogPromise) {
      this.catalogPromise = loadCatalog(
        this.catalogPath
      );
    }

    return this.catalogPromise;
  }

  async getCommercialSnapshot(customerId) {
    const id = String(customerId || '').trim();

    if (!id) {
      return null;
    }

    const db = await openDatabase(this.dbPath);

    try {
      const [profileRow, campaignRows, catalog] =
        await Promise.all([
          getOne(
            db,
            `SELECT
              cliente_id,
              tipo_cliente,
              tiene_movil,
              tiene_hogar,
              es_movistar_total,
              elegible_mt,
              plan_actual_id,
              consumo_datos_gb_prom,
              n_reclamos,
              canal_mas_usado
             FROM dataset_clientes
             WHERE cliente_id = ?
             LIMIT 1`,
            [id]
          ),
          getAll(
            db,
            `SELECT
              oferta_id,
              fecha,
              resultado
             FROM historial_campanias
             WHERE cliente_id = ?
             ORDER BY fecha DESC
             LIMIT 50`,
            [id]
          ),
          this.getCatalog()
        ]);

      return {
        scope: 'SIMULATED_COMMERCIAL_LAYER',
        profile: mapProfile(profileRow),
        campaigns:
          campaignRows
            .map(mapCampaign)
            .filter(Boolean),
        catalog: catalog.map(
          (offer) => ({ ...offer })
        ),
        provenance: {
          profile:
            'dataset_clientes.csv',
          campaignHistory:
            'historial_campanias.csv',
          offerCatalog:
            'catalogo_ofertas_entrega.csv',
          affectsOfficialFinancialReasoning:
            false
        }
      };
    } finally {
      await closeDatabase(db);
    }
  }
}

function createDesafio1CommercialDataService(options) {
  return new Desafio1CommercialDataService(options);
}

module.exports = {
  DEFAULT_DB_PATH,
  DEFAULT_CATALOG_PATH,
  normalizeBool,
  nullableNumber,
  mapProfile,
  mapCampaign,
  mapOffer,
  loadCatalog,
  Desafio1CommercialDataService,
  createDesafio1CommercialDataService
};
