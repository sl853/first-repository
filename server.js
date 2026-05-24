import express from "express";
import multer from "multer";
import pg from "pg";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const dbPath = join(dataDir, "deal-radar.sqlite");
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
const usePostgres = Boolean(databaseUrl);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

const scraperUserAgent = "DealRadarBot/0.1 (+https://deal-radar-s6ur.onrender.com)";
const robotsCache = new Map();
const lastFetchByOrigin = new Map();
const minimumFetchDelayMs = Number(process.env.SCRAPER_DELAY_MS || 1500);

if (!existsSync(dataDir)) mkdirSync(dataDir);

let db;
let pool;
let insertDeal;
let insertSearchProfile;
let insertSearchRun;
let insertObservation;
let insertCorrection;

const createDealsTableSql = `
  CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    location TEXT NOT NULL,
    ask INTEGER NOT NULL,
    income_label TEXT NOT NULL,
    income INTEGER NOT NULL,
    metric_label TEXT NOT NULL,
    metric TEXT NOT NULL,
    score INTEGER NOT NULL,
    confidence INTEGER NOT NULL,
    verified INTEGER NOT NULL,
    summary TEXT NOT NULL,
    tags TEXT NOT NULL,
    reasons TEXT NOT NULL,
    missing TEXT NOT NULL,
    memo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const createSearchProfilesTableSql = `
  CREATE TABLE IF NOT EXISTS search_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    location TEXT NOT NULL,
    max_ask INTEGER,
    limit_count INTEGER NOT NULL,
    frequency TEXT NOT NULL,
    status TEXT NOT NULL,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const createSearchRunsTableSql = `
  CREATE TABLE IF NOT EXISTS search_runs (
    id TEXT PRIMARY KEY,
    search_id TEXT,
    criteria_json TEXT NOT NULL,
    status TEXT NOT NULL,
    imported_count INTEGER NOT NULL,
    existing_count INTEGER NOT NULL,
    source_links_json TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const createObservationsTableSql = `
  CREATE TABLE IF NOT EXISTS source_observations (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    search_id TEXT,
    source_name TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    snippet TEXT NOT NULL,
    raw_claim_text TEXT NOT NULL,
    extracted_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const createCorrectionsTableSql = `
  CREATE TABLE IF NOT EXISTS data_corrections (
    id TEXT PRIMARY KEY,
    observation_id TEXT,
    deal_id TEXT,
    field_name TEXT NOT NULL,
    observed_value TEXT NOT NULL,
    corrected_value TEXT NOT NULL,
    correction_type TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

if (usePostgres) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });
  await pool.query(createDealsTableSql);
  await pool.query(createSearchProfilesTableSql);
  await pool.query(createSearchRunsTableSql);
  await pool.query(createObservationsTableSql);
  await pool.query(createCorrectionsTableSql);
} else {
  const { DatabaseSync } = await import("node:sqlite");
  db = new DatabaseSync(dbPath);
  db.exec(createDealsTableSql);
  db.exec(createSearchProfilesTableSql);
  db.exec(createSearchRunsTableSql);
  db.exec(createObservationsTableSql);
  db.exec(createCorrectionsTableSql);
  insertDeal = db.prepare(`
    INSERT OR REPLACE INTO deals (
      id, source, name, type, location, ask, income_label, income, metric_label,
      metric, score, confidence, verified, summary, tags, reasons, missing, memo
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSearchProfile = db.prepare(`
    INSERT OR REPLACE INTO search_profiles (
      id, name, type, location, max_ask, limit_count, frequency, status, last_run_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSearchRun = db.prepare(`
    INSERT INTO search_runs (
      id, search_id, criteria_json, status, imported_count, existing_count, source_links_json, message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertObservation = db.prepare(`
    INSERT OR IGNORE INTO source_observations (
      id, run_id, search_id, source_name, url, title, snippet, raw_claim_text, extracted_json, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCorrection = db.prepare(`
    INSERT INTO data_corrections (
      id, observation_id, deal_id, field_name, observed_value, corrected_value, correction_type, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

const sampleDeals = [
  {
    id: "spin-cycle-express",
    source: "sample",
    name: "SpinCycle Express",
    type: "Laundromat",
    location: "Phoenix, AZ",
    ask: 840000,
    incomeLabel: "NOI",
    income: 156000,
    metricLabel: "Cap",
    metric: "18.6%",
    score: 92,
    confidence: 86,
    verified: true,
    summary: "Strong equipment base, below-market wash pricing, and room for unattended hours expansion.",
    tags: ["Lease Quality", "Automation", "Value Add"],
    reasons: [
      "Reported NOI supports a high implied yield at the asking price.",
      "Equipment list is mostly complete and supports lower near-term capex risk.",
      "Pricing and service mix leave a clear value-add path through card readers and wash-dry-fold."
    ],
    missing: ["Utility bills by month", "Lease assignment consent", "Machine-level maintenance history"],
    memo: "Attractive laundromat acquisition with strong cash yield and identifiable operational upside. Proceed to LOI only after utility normalization and landlord assignment confirmation."
  },
  {
    id: "metro-wash-house",
    source: "sample",
    name: "Metro Wash House",
    type: "Laundromat",
    location: "Cleveland, OH",
    ask: 610000,
    incomeLabel: "NOI",
    income: 98000,
    metricLabel: "Cap",
    metric: "16.1%",
    score: 81,
    confidence: 71,
    verified: false,
    summary: "Durable local traffic with upside from payment modernization and wash-dry-fold services.",
    tags: ["Stable Demand", "Tech Upgrade"],
    reasons: [
      "Cash flow appears solid relative to price, but documentation is incomplete.",
      "Neighborhood demand is steady and operating complexity is moderate.",
      "Technology upgrades create measurable revenue and labor-efficiency upside."
    ],
    missing: ["Tax returns", "Lease renewal option", "Equipment age schedule", "Payroll detail"],
    memo: "Good operational candidate with clear modernization upside. Confidence is medium because seller financials need verification before valuation is reliable."
  },
  {
    id: "summit-inn",
    source: "sample",
    name: "Summit Inn Flag Conversion",
    type: "Hotel",
    location: "Boise, ID",
    ask: 4200000,
    incomeLabel: "Keys",
    income: 58,
    metricLabel: "RevPAR",
    metric: "$82",
    score: 89,
    confidence: 78,
    verified: false,
    summary: "Rate gap versus the comp set suggests repositioning upside after light PIP investment.",
    tags: ["Brand Upside", "PIP", "Rate Gap"],
    reasons: [
      "RevPAR trails nearby comparable assets, creating a credible repositioning thesis.",
      "Asset size is large enough for professional management without becoming institutional.",
      "Debt coverage may work if PIP budget stays controlled."
    ],
    missing: ["Trailing 12 P&L", "Franchise PIP quote", "Occupancy by channel", "Property condition report"],
    memo: "Promising hospitality repositioning deal. The investment case depends on disciplined renovation scope and reliable trailing financials."
  },
  {
    id: "desert-suites",
    source: "sample",
    name: "Desert Suites",
    type: "Hotel",
    location: "Las Cruces, NM",
    ask: 2900000,
    incomeLabel: "Keys",
    income: 44,
    metricLabel: "DSCR",
    metric: "1.18x",
    score: 74,
    confidence: 62,
    verified: false,
    summary: "Attractive basis, but thin debt coverage requires conservative leverage assumptions.",
    tags: ["Financing Fit", "Basis"],
    reasons: [
      "Purchase basis is reasonable, but current cash flow leaves limited room for debt-service error.",
      "Smaller key count increases management sensitivity.",
      "Upside exists, but the financing case needs tighter documentation."
    ],
    missing: ["Lender quote", "ADR history", "Capex budget", "Insurance quote", "Tax reassessment estimate"],
    memo: "Watchlist hotel deal. Do not advance without a financing model, insurance quote, and verified operating history."
  },
  {
    id: "northline-spirits",
    source: "sample",
    name: "Northline Spirits",
    type: "Liquor Store",
    location: "Columbus, OH",
    ask: 1100000,
    incomeLabel: "SDE",
    income: 245000,
    metricLabel: "Margin",
    metric: "31%",
    score: 91,
    confidence: 83,
    verified: true,
    summary: "Strong category mix and favorable lease with upside from premium inventory rotation.",
    tags: ["Inventory", "Lease Quality", "Margin"],
    reasons: [
      "Seller discretionary earnings support a reasonable acquisition multiple.",
      "Lease terms reduce occupancy risk and improve financeability.",
      "Premium category expansion can improve gross margin without changing the footprint."
    ],
    missing: ["Inventory aging report", "License transfer timeline", "Point-of-sale export"],
    memo: "High-priority retail cash-flow deal with good earnings support. Verify inventory quality and license transfer before submitting final terms."
  },
  {
    id: "canyon-beverage",
    source: "sample",
    name: "Canyon Beverage Mart",
    type: "Liquor Store",
    location: "Reno, NV",
    ask: 930000,
    incomeLabel: "SDE",
    income: 176000,
    metricLabel: "Multiple",
    metric: "5.3x",
    score: 80,
    confidence: 68,
    verified: false,
    summary: "Consistent sales, but diligence should focus on license timing and shrink controls.",
    tags: ["License", "Shrink", "Inventory"],
    reasons: [
      "Headline multiple is acceptable if add-backs are real.",
      "Store has stable demand signals but weaker documentation quality.",
      "Shrink and inventory controls materially affect the true earnings base."
    ],
    missing: ["Add-back support", "Shrink report", "License transfer approval", "Vendor concentration"],
    memo: "Useful candidate for diligence, not yet a conviction deal. The next step is validating SDE and inventory control quality."
  },
  {
    id: "east-loop-flex",
    source: "sample",
    name: "East Loop Flex Park",
    type: "Industrial",
    location: "San Antonio, TX",
    ask: 3800000,
    incomeLabel: "NOI",
    income: 284000,
    metricLabel: "Occ.",
    metric: "96%",
    score: 94,
    confidence: 88,
    verified: true,
    summary: "Below-market rents, staggered leases, and strong small-bay demand support rent resets.",
    tags: ["Rent Growth", "Occupancy", "Industrial"],
    reasons: [
      "High occupancy and staggered rollover lower near-term income volatility.",
      "Current rents appear below market, creating a clean mark-to-market thesis.",
      "Small-bay demand improves tenant replacement probability."
    ],
    missing: ["Environmental report", "Roof inspection", "Tenant estoppels"],
    memo: "Best-in-pipeline industrial opportunity. Advance to full underwriting and request third-party diligence reports."
  },
  {
    id: "railspur-warehouse",
    source: "sample",
    name: "Railspur Warehouse",
    type: "Industrial",
    location: "Kansas City, MO",
    ask: 2400000,
    incomeLabel: "NOI",
    income: 171000,
    metricLabel: "Cap",
    metric: "7.1%",
    score: 85,
    confidence: 74,
    verified: false,
    summary: "Functional loading and infill location are positives; roof reserve should be modeled.",
    tags: ["Infill", "Roof Reserve", "Industrial"],
    reasons: [
      "Going-in yield is acceptable for a functional infill warehouse.",
      "Physical plant risk is manageable if roof reserve is priced correctly.",
      "Location and loading features support tenant demand."
    ],
    missing: ["Roof quote", "Phase I environmental", "Lease abstracts", "CAM reconciliation"],
    memo: "Solid industrial candidate with a specific diligence question: roof cost. Price adjustment should depend on inspection outcome."
  }
];

function toRow(deal) {
  return [
    deal.id,
    deal.source,
    deal.name,
    deal.type,
    deal.location,
    deal.ask,
    deal.incomeLabel,
    deal.income,
    deal.metricLabel,
    deal.metric,
    deal.score,
    deal.confidence,
    deal.verified ? 1 : 0,
    deal.summary,
    JSON.stringify(deal.tags),
    JSON.stringify(deal.reasons),
    JSON.stringify(deal.missing),
    deal.memo
  ];
}

function fromRow(row) {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    type: row.type,
    location: row.location,
    ask: row.ask,
    incomeLabel: row.income_label,
    income: row.income,
    metricLabel: row.metric_label,
    metric: row.metric,
    score: row.score,
    confidence: row.confidence,
    verified: Boolean(row.verified),
    summary: row.summary,
    tags: JSON.parse(row.tags),
    reasons: JSON.parse(row.reasons),
    missing: JSON.parse(row.missing),
    memo: row.memo,
    createdAt: row.created_at
  };
}

function searchProfileFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    location: row.location,
    maxAsk: row.max_ask,
    limit: row.limit_count,
    frequency: row.frequency,
    status: row.status,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at
  };
}

function searchRunFromRow(row) {
  return {
    id: row.id,
    searchId: row.search_id,
    criteria: JSON.parse(row.criteria_json),
    status: row.status,
    importedCount: row.imported_count,
    existingCount: row.existing_count,
    sourceLinks: JSON.parse(row.source_links_json),
    message: row.message,
    createdAt: row.created_at
  };
}

function observationFromRow(row) {
  return {
    id: row.id,
    runId: row.run_id,
    searchId: row.search_id,
    sourceName: row.source_name,
    url: row.url,
    title: row.title,
    snippet: row.snippet,
    rawClaimText: row.raw_claim_text,
    extracted: JSON.parse(row.extracted_json || "{}"),
    status: row.status,
    createdAt: row.created_at
  };
}

function correctionFromRow(row) {
  return {
    id: row.id,
    observationId: row.observation_id,
    dealId: row.deal_id,
    fieldName: row.field_name,
    observedValue: row.observed_value,
    correctedValue: row.corrected_value,
    correctionType: row.correction_type,
    notes: row.notes,
    createdAt: row.created_at
  };
}

async function insertDealRecord(deal) {
  const values = toRow(deal);
  if (usePostgres) {
    await pool.query(
      `
        INSERT INTO deals (
          id, source, name, type, location, ask, income_label, income, metric_label,
          metric, score, confidence, verified, summary, tags, reasons, missing, memo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET
          source = EXCLUDED.source,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          location = EXCLUDED.location,
          ask = EXCLUDED.ask,
          income_label = EXCLUDED.income_label,
          income = EXCLUDED.income,
          metric_label = EXCLUDED.metric_label,
          metric = EXCLUDED.metric,
          score = EXCLUDED.score,
          confidence = EXCLUDED.confidence,
          verified = EXCLUDED.verified,
          summary = EXCLUDED.summary,
          tags = EXCLUDED.tags,
          reasons = EXCLUDED.reasons,
          missing = EXCLUDED.missing,
          memo = EXCLUDED.memo
      `,
      values
    );
    return;
  }
  insertDeal.run(...values);
}

async function insertSearchProfileRecord(search) {
  const values = [
    search.id,
    search.name,
    search.type,
    search.location,
    search.maxAsk,
    search.limit,
    search.frequency,
    search.status,
    search.lastRunAt || null
  ];
  if (usePostgres) {
    await pool.query(
      `
        INSERT INTO search_profiles (
          id, name, type, location, max_ask, limit_count, frequency, status, last_run_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          location = EXCLUDED.location,
          max_ask = EXCLUDED.max_ask,
          limit_count = EXCLUDED.limit_count,
          frequency = EXCLUDED.frequency,
          status = EXCLUDED.status,
          last_run_at = EXCLUDED.last_run_at
      `,
      values
    );
    return;
  }
  insertSearchProfile.run(...values);
}

async function insertSearchRunRecord(run) {
  const values = [
    run.id,
    run.searchId || null,
    JSON.stringify(run.criteria),
    run.status,
    run.importedCount,
    run.existingCount,
    JSON.stringify(run.sourceLinks),
    run.message
  ];
  if (usePostgres) {
    await pool.query(
      `
        INSERT INTO search_runs (
          id, search_id, criteria_json, status, imported_count, existing_count, source_links_json, message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      values
    );
    return;
  }
  insertSearchRun.run(...values);
}

async function insertObservationRecord(observation) {
  const values = [
    observation.id,
    observation.runId || null,
    observation.searchId || null,
    observation.sourceName,
    observation.url,
    observation.title,
    observation.snippet,
    observation.rawClaimText,
    JSON.stringify(observation.extracted || {}),
    observation.status
  ];
  if (usePostgres) {
    await pool.query(
      `
        INSERT INTO source_observations (
          id, run_id, search_id, source_name, url, title, snippet, raw_claim_text, extracted_json, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `,
      values
    );
    return;
  }
  insertObservation.run(...values);
}

async function insertCorrectionRecord(correction) {
  const values = [
    correction.id,
    correction.observationId || null,
    correction.dealId || null,
    correction.fieldName,
    correction.observedValue,
    correction.correctedValue,
    correction.correctionType,
    correction.notes
  ];
  if (usePostgres) {
    await pool.query(
      `
        INSERT INTO data_corrections (
          id, observation_id, deal_id, field_name, observed_value, corrected_value, correction_type, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      values
    );
    return;
  }
  insertCorrection.run(...values);
}

async function allDealRows() {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM deals ORDER BY created_at DESC, score DESC");
    return result.rows;
  }
  return db.prepare("SELECT * FROM deals ORDER BY created_at DESC, score DESC").all();
}

async function allSearchProfileRows() {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM search_profiles ORDER BY created_at DESC");
    return result.rows;
  }
  return db.prepare("SELECT * FROM search_profiles ORDER BY created_at DESC").all();
}

async function activeSearchProfileRows() {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM search_profiles WHERE status = 'active' ORDER BY created_at DESC");
    return result.rows;
  }
  return db.prepare("SELECT * FROM search_profiles WHERE status = 'active' ORDER BY created_at DESC").all();
}

async function recentSearchRunRows(limit = 20) {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM search_runs ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows;
  }
  return db.prepare("SELECT * FROM search_runs ORDER BY created_at DESC LIMIT ?").all(limit);
}

async function recentObservationRows(limit = 100) {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM source_observations ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows;
  }
  return db.prepare("SELECT * FROM source_observations ORDER BY created_at DESC LIMIT ?").all(limit);
}

async function recentCorrectionRows(limit = 100) {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM data_corrections ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows;
  }
  return db.prepare("SELECT * FROM data_corrections ORDER BY created_at DESC LIMIT ?").all(limit);
}

async function brainSummary() {
  if (usePostgres) {
    const [observations, corrections, runs, sources] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM source_observations"),
      pool.query("SELECT COUNT(*)::int AS count FROM data_corrections"),
      pool.query("SELECT COUNT(*)::int AS count FROM search_runs"),
      pool.query("SELECT source_name, COUNT(*)::int AS count FROM source_observations GROUP BY source_name ORDER BY count DESC")
    ]);
    return {
      observations: observations.rows[0].count,
      corrections: corrections.rows[0].count,
      searchRuns: runs.rows[0].count,
      sources: sources.rows
    };
  }
  return {
    observations: db.prepare("SELECT COUNT(*) AS count FROM source_observations").get().count,
    corrections: db.prepare("SELECT COUNT(*) AS count FROM data_corrections").get().count,
    searchRuns: db.prepare("SELECT COUNT(*) AS count FROM search_runs").get().count,
    sources: db.prepare("SELECT source_name, COUNT(*) AS count FROM source_observations GROUP BY source_name ORDER BY count DESC").all()
  };
}

async function dealRowById(id) {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM deals WHERE id = $1", [id]);
    return result.rows[0];
  }
  return db.prepare("SELECT * FROM deals WHERE id = ?").get(id);
}

async function searchProfileRowById(id) {
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM search_profiles WHERE id = $1", [id]);
    return result.rows[0];
  }
  return db.prepare("SELECT * FROM search_profiles WHERE id = ?").get(id);
}

async function dealRowBySummaryUrl(url) {
  if (!url) return null;
  if (usePostgres) {
    const result = await pool.query("SELECT * FROM deals WHERE summary LIKE $1 LIMIT 1", [`%${url}%`]);
    return result.rows[0];
  }
  return db.prepare("SELECT * FROM deals WHERE summary LIKE ?").get(`%${url}%`);
}

async function dealRowByFingerprint(deal) {
  if (usePostgres) {
    const result = await pool.query(
      "SELECT * FROM deals WHERE lower(name) = lower($1) AND lower(location) = lower($2) AND ask = $3 LIMIT 1",
      [deal.name, deal.location, deal.ask]
    );
    return result.rows[0];
  }
  return db.prepare("SELECT * FROM deals WHERE lower(name) = lower(?) AND lower(location) = lower(?) AND ask = ?").get(deal.name, deal.location, deal.ask);
}

async function deleteDealById(id) {
  if (usePostgres) {
    const result = await pool.query("DELETE FROM deals WHERE id = $1 RETURNING id", [id]);
    return result.rowCount;
  }
  return db.prepare("DELETE FROM deals WHERE id = ?").run(id).changes;
}

async function deleteDealsBySource(source) {
  if (usePostgres) {
    const result = await pool.query("DELETE FROM deals WHERE source = $1", [source]);
    return result.rowCount;
  }
  return db.prepare("DELETE FROM deals WHERE source = ?").run(source).changes;
}

async function deleteDealsBySources(sources) {
  if (!sources.length) return 0;
  if (usePostgres) {
    const result = await pool.query("DELETE FROM deals WHERE source = ANY($1)", [sources]);
    return result.rowCount;
  }
  const placeholders = sources.map(() => "?").join(", ");
  return db.prepare(`DELETE FROM deals WHERE source IN (${placeholders})`).run(...sources).changes;
}

async function updateSearchLastRun(id) {
  if (usePostgres) {
    await pool.query("UPDATE search_profiles SET last_run_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    return;
  }
  db.prepare("UPDATE search_profiles SET last_run_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

async function seedSamples() {
  if (process.env.SEED_SAMPLE_DEALS !== "true") return;
  if (usePostgres) {
    for (const deal of sampleDeals) await insertDealRecord(deal);
    return;
  }
  db.exec("BEGIN");
  try {
    for (const deal of sampleDeals) insertDeal.run(...toRow(deal));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function parseDocs(docs) {
  if (Array.isArray(docs)) return docs.filter(Boolean);
  if (typeof docs === "string") return docs.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function metricFor({ ask, income, incomeLabel }) {
  if (!ask || !income || incomeLabel === "Unknown") {
    return { metricLabel: "Evidence", metric: "Needs source" };
  }
  if (incomeLabel === "Keys") {
    return { metricLabel: "Ask/key", metric: `$${Math.round(ask / Math.max(income, 1)).toLocaleString()}` };
  }
  if (incomeLabel === "SDE") {
    return { metricLabel: "Multiple", metric: `${(ask / Math.max(income, 1)).toFixed(1)}x` };
  }
  return { metricLabel: "Cap", metric: `${((income / ask) * 100).toFixed(1)}%` };
}

function scoreDeal({ ask, income, incomeLabel, type, docs, notes }) {
  if (!ask || !income || incomeLabel === "Unknown") {
    return {
      score: 38,
      confidence: Math.min(35, 18 + docs.length * 4 + (notes.trim().length > 35 ? 4 : 0))
    };
  }
  const docScore = docs.length * 6;
  const noteBoost = notes.trim().length > 35 ? 5 : 0;
  const yieldPercent = incomeLabel === "Keys" ? 0 : (income / ask) * 100;
  let score = 55 + docScore + noteBoost;

  if (incomeLabel === "NOI") {
    if (yieldPercent >= 12) score += 22;
    else if (yieldPercent >= 8) score += 15;
    else if (yieldPercent >= 6) score += 9;
    else score += 2;
  } else if (incomeLabel === "SDE") {
    const multiple = ask / Math.max(income, 1);
    if (multiple <= 3.5) score += 22;
    else if (multiple <= 5) score += 15;
    else if (multiple <= 6.5) score += 8;
    else score += 1;
  } else {
    const askPerKey = ask / Math.max(income, 1);
    if (askPerKey <= 70000) score += 18;
    else if (askPerKey <= 100000) score += 11;
    else score += 4;
  }

  if (type === "Industrial" && docs.includes("lease")) score += 4;
  if (type === "Laundromat" && docs.includes("utilities")) score += 4;
  if (type === "Hotel" && docs.includes("insurance")) score += 3;
  if (type === "Liquor Store" && docs.includes("financials")) score += 3;

  return {
    score: Math.max(40, Math.min(96, Math.round(score))),
    confidence: Math.min(95, 35 + docs.length * 9 + noteBoost)
  };
}

function missingItemsFor(type, docs, incomeLabel) {
  const docLabels = {
    financials: "P&L or tax return",
    lease: "Lease or rent roll",
    utilities: "Utility bills",
    equipment: "Equipment / capex list",
    taxes: "Property tax record",
    insurance: "Insurance quote"
  };
  const missing = Object.entries(docLabels)
    .filter(([key]) => !docs.includes(key))
    .map(([, label]) => label);

  if (type === "Hotel" && incomeLabel === "Keys") missing.unshift("Trailing 12 operating statement");
  if (type === "Liquor Store") missing.push("License transfer timeline");
  if (type === "Industrial") missing.push("Environmental report");
  if (type === "Laundromat") missing.push("Machine-level maintenance history");
  return missing.slice(0, 6);
}

function buildDeal(input, source = "manual") {
  const name = String(input.name || "").trim();
  const type = String(input.type || "").trim();
  const location = String(input.location || "").trim();
  const ask = Number(input.ask);
  const incomeLabel = String(input.incomeLabel || input.income_label || "NOI").trim();
  const income = Number(input.income);
  const notes = String(input.notes || input.summary || "");
  const docs = parseDocs(input.docs);
  const researchOnly = source === "research" || (source === "web" && (!ask || !income || incomeLabel === "Unknown"));

  if (!name || !type || !location || !Number.isFinite(ask) || (!researchOnly && ask <= 0) || !Number.isFinite(income)) {
    const error = new Error("name, type, location, ask, and income are required.");
    error.status = 400;
    throw error;
  }

  const { score, confidence } = scoreDeal({ ask, income, incomeLabel, type, docs, notes });
  const { metricLabel, metric } = metricFor({ ask, income, incomeLabel });
  const missing = missingItemsFor(type, docs, incomeLabel);
  const verified = confidence >= 82;
  const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "deal";
  const sourceLabels = {
    csv: "CSV Upload",
    image: "Image Import",
    web: "Web Lead",
    research: "Research Lead",
    manual: "Manual Entry"
  };
  const leadTag = sourceLabels[source] || "Manual Entry";
  const qualityTag = researchOnly ? "Needs Contact" : verified ? "Verified Inputs" : "Needs Verification";
  const priorityTag = researchOnly ? "Research Queue" : score >= 85 ? "Priority" : "Diligence";

  return {
    id: `${idBase}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    source,
    name,
    type,
    location,
    ask,
    incomeLabel,
    income,
    metricLabel,
    metric,
    score,
    confidence,
    verified,
    summary: notes.trim() || "Listing added for Deal Radar scoring and diligence review.",
    tags: [leadTag, qualityTag, priorityTag],
    reasons: researchOnly
      ? [
        "This source looked relevant, but price and income were not visible enough for underwriting.",
        "The next step is to find the broker/seller contact and request source financials.",
        "Do not treat the Deal Score as valuation signal until core fields are verified."
      ]
      : [
        incomeLabel === "Keys" ? `Initial hotel basis is ${metric}.` : `${incomeLabel} implies ${metric} at the asking price.`,
        `${docs.length} of 6 core diligence documents were marked as received.`,
        confidence >= 82 ? "Confidence is high enough for deeper underwriting." : "Confidence is limited by missing source documents."
      ],
    missing,
    memo: researchOnly
      ? `${name} is a research lead for ${type.toLowerCase()} opportunities in ${location}. It needs contact discovery and source documents before Deal Radar can underwrite it.`
      : `${name} is a ${type.toLowerCase()} opportunity in ${location} with an initial Deal Score of ${score} and ${confidence}% confidence. Next step: request the missing diligence items before treating the valuation as reliable.`
  };
}

function normalizeSearchCriteria(input = {}) {
  const type = String(input.type || "all").trim();
  const location = String(input.location || "").trim();
  const maxAsk = Number(input.maxAsk || input.max_ask) > 0 ? Number(input.maxAsk || input.max_ask) : null;
  const limit = Math.min(12, Math.max(1, Number(input.limit || input.limit_count || 6)));
  if (!location) {
    const error = new Error("location is required.");
    error.status = 400;
    throw error;
  }
  return { type, location, maxAsk, limit };
}

function buildSearchProfile(input = {}) {
  const criteria = normalizeSearchCriteria(input);
  const name = String(input.name || `${criteria.location} ${criteria.type === "all" ? "priority targets" : criteria.type}`).trim();
  const frequency = String(input.frequency || "manual").trim();
  const status = String(input.status || "active").trim();
  return {
    id: input.id || `search-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name,
    ...criteria,
    frequency,
    status,
    lastRunAt: input.lastRunAt || null
  };
}

const defaultSearchProfiles = [
  { name: "Florida laundromats", type: "Laundromat", location: "Florida", maxAsk: 1500000, limit: 4 },
  { name: "Florida liquor stores", type: "Liquor Store", location: "Florida", maxAsk: 1200000, limit: 4 },
  { name: "Texas car washes", type: "Car Wash", location: "Texas", maxAsk: 2000000, limit: 4 },
  { name: "Texas auto repair", type: "Auto Repair", location: "Texas", maxAsk: 1000000, limit: 4 },
  { name: "Arizona laundromats", type: "Laundromat", location: "Arizona", maxAsk: 1500000, limit: 4 }
].map((search) => ({
  id: null,
  frequency: "recommended",
  status: "active",
  lastRunAt: null,
  ...search
}));

function sourceNameForUrl(url = "", title = "") {
  const text = `${url} ${title}`.toLowerCase();
  if (text.includes("businessbroker.net")) return "BusinessBroker.net";
  if (text.includes("bizbuysell")) return "BizBuySell";
  if (text.includes("bizquest")) return "BizQuest";
  if (text.includes("loopnet")) return "LoopNet";
  if (text.includes("crexi")) return "Crexi";
  if (text.includes("sunbelt")) return "Sunbelt Network";
  if (text.includes("bing.com/search")) return "Bing source search";
  return "Public web";
}

function observationIdFor(url, runId, status) {
  const base = Buffer.from(`${runId}:${status}:${url}`).toString("base64url").slice(0, 42);
  return `obs-${base}`;
}

async function recordSearchObservations({ run, searchId, found, sourceLinks }) {
  const seen = new Set();
  const records = [];

  for (const result of found) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    records.push({
      id: observationIdFor(result.url, run.id, "extracted"),
      runId: run.id,
      searchId,
      sourceName: sourceNameForUrl(result.url, result.input?.name),
      url: result.url,
      title: result.input?.name || "Extracted listing",
      snippet: result.input?.notes || "",
      rawClaimText: result.input?.notes || "",
      extracted: result.input || {},
      status: "extracted_claim"
    });
  }

  for (const link of sourceLinks) {
    if (!link.url || seen.has(link.url)) continue;
    seen.add(link.url);
    records.push({
      id: observationIdFor(link.url, run.id, "source"),
      runId: run.id,
      searchId,
      sourceName: sourceNameForUrl(link.url, link.title),
      url: link.url,
      title: link.title || "Source link",
      snippet: link.snippet || "",
      rawClaimText: `${link.title || ""}\n${link.snippet || ""}`.trim(),
      extracted: {},
      status: "source_link"
    });
  }

  for (const record of records) await insertObservationRecord(record);
  return records.length;
}

function buildCorrection(input = {}) {
  const fieldName = String(input.fieldName || input.field_name || "").trim();
  const observedValue = String(input.observedValue || input.observed_value || "").trim();
  const correctedValue = String(input.correctedValue || input.corrected_value || "").trim();
  const correctionType = String(input.correctionType || input.correction_type || "field_correction").trim();
  const notes = String(input.notes || "").trim();
  if (!fieldName || !observedValue || !correctedValue) {
    const error = new Error("fieldName, observedValue, and correctedValue are required.");
    error.status = 400;
    throw error;
  }
  return {
    id: `correction-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    observationId: input.observationId || input.observation_id || null,
    dealId: input.dealId || input.deal_id || null,
    fieldName,
    observedValue,
    correctedValue,
    correctionType,
    notes
  };
}

async function runSearchAgent(criteria, searchId = null) {
  const { results: found, sourceLinks } = await runPublicWebSearch(criteria);
  const created = [];
  const existingDeals = [];
  const researchLeads = [];

  for (const result of found) {
    const deal = buildDeal(result.input, "web");
    const existing = await dealRowBySummaryUrl(result.url) || await dealRowByFingerprint(deal);
    if (existing) {
      existingDeals.push(fromRow(existing));
      continue;
    }
    await insertDealRecord(deal);
    created.push(deal);
  }

  const usedUrls = new Set(found.map((result) => result.url).filter(Boolean));
  for (const link of sourceLinks) {
    if (created.length + existingDeals.length + researchLeads.length >= criteria.limit) break;
    if (link.kind !== "candidate") continue;
    if (!link.url || usedUrls.has(link.url)) continue;
    const deal = buildDeal(buildResearchLeadInput(link, criteria), "research");
    const existing = await dealRowBySummaryUrl(link.url) || await dealRowByFingerprint(deal);
    if (existing) {
      existingDeals.push(fromRow(existing));
      continue;
    }
    await insertDealRecord(deal);
    researchLeads.push(deal);
  }

  const totalLeads = created.length + researchLeads.length + existingDeals.length;
  const importedWithIncome = created.filter((deal) => Number(deal.income) > 0).length;
  const message = created.length
    ? `Imported ${created.length} public listing candidate${created.length === 1 ? "" : "s"}; ${importedWithIncome} had visible income/cash-flow signals.`
    : totalLeads
      ? "Added research leads that need contact discovery and source documents before underwriting."
      : "No source leads found. Try a broader location or inspect the source links manually.";
  const run = {
    id: `run-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    searchId,
    criteria,
    status: created.length ? "imported" : totalLeads ? "research_queue" : "needs_manual_review",
    importedCount: created.length,
    existingCount: existingDeals.length,
    sourceLinks: sourceLinks.slice(0, 8),
    message
  };
  await insertSearchRunRecord(run);
  await recordSearchObservations({ run, searchId, found, sourceLinks: run.sourceLinks });
  if (searchId) await updateSearchLastRun(searchId);

  return {
    criteria,
    count: created.length,
    researchCount: researchLeads.length,
    existingCount: existingDeals.length,
    deals: [...created, ...researchLeads, ...existingDeals],
    sourceLinks: run.sourceLinks,
    message,
    run
  };
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripHtml(value = "") {
  return decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch (_error) {
    return url;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function robotsPatternToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.?+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\$/g, "$");
  return new RegExp(`^${escaped}`);
}

function parseRobots(text) {
  const groups = [];
  let currentAgents = [];
  let currentRules = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey.toLowerCase().trim();
    const value = rawValue.join(":").trim();
    if (key === "user-agent") {
      if (currentAgents.length && currentRules.length) {
        groups.push({ agents: currentAgents, rules: currentRules });
        currentRules = [];
      }
      currentAgents = [value.toLowerCase()];
    } else if (["allow", "disallow"].includes(key) && currentAgents.length) {
      currentRules.push({ type: key, pattern: value });
    }
  }

  if (currentAgents.length) groups.push({ agents: currentAgents, rules: currentRules });
  return groups;
}

function isAllowedByRobots(groups, targetUrl) {
  const { pathname, search } = new URL(targetUrl);
  const path = `${pathname}${search}`;
  const matching = groups
    .filter((group) => group.agents.includes("*") || group.agents.some((agent) => scraperUserAgent.toLowerCase().includes(agent)))
    .flatMap((group) => group.rules)
    .filter((rule) => rule.pattern === "" || robotsPatternToRegExp(rule.pattern).test(path))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  if (!matching.length) return true;
  return matching[0].type === "allow" || matching[0].pattern === "";
}

async function robotsGroupsFor(targetUrl) {
  const origin = new URL(targetUrl).origin;
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < 1000 * 60 * 60 * 12) return cached.groups;

  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": scraperUserAgent, "Accept": "text/plain" }
    });
    const text = response.ok ? await response.text() : "";
    const groups = parseRobots(text);
    robotsCache.set(origin, { fetchedAt: Date.now(), groups });
    return groups;
  } catch (_error) {
    robotsCache.set(origin, { fetchedAt: Date.now(), groups: [] });
    return [];
  }
}

async function waitForOrigin(origin) {
  const lastFetch = lastFetchByOrigin.get(origin) || 0;
  const waitMs = Math.max(0, minimumFetchDelayMs - (Date.now() - lastFetch));
  if (waitMs) await sleep(waitMs);
  lastFetchByOrigin.set(origin, Date.now());
}

async function politeFetchText(url) {
  const origin = new URL(url).origin;
  const robotsGroups = await robotsGroupsFor(url);
  if (!isAllowedByRobots(robotsGroups, url)) {
    return { ok: false, blocked: true, status: 0, text: "", url };
  }

  await waitForOrigin(origin);
  const response = await fetch(url, {
    headers: {
      "User-Agent": scraperUserAgent,
      "Accept": "text/html,application/xhtml+xml,text/plain"
    }
  });
  const text = response.ok ? await response.text() : "";
  return { ok: response.ok, blocked: false, status: response.status, text, url: response.url || url };
}

function parseBingRss(xml) {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((match) => {
    const item = match[1];
    const title = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "");
    const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "");
    return { title, link, description };
  });
}

function moneyFromText(text) {
  const matches = Array.from(text.matchAll(/\$ ?([0-9][0-9,.]*)( ?[kKmM])?/g));
  return matches.map((match) => {
    const base = Number(match[1].replace(/,/g, ""));
    const suffix = (match[2] || "").trim().toLowerCase();
    if (!Number.isFinite(base)) return 0;
    if (suffix === "k") return base * 1000;
    if (suffix === "m") return base * 1000000;
    return base;
  }).filter((value) => value > 0);
}

function inferType(text, requestedType) {
  if (requestedType && requestedType !== "all") return requestedType;
  const lower = text.toLowerCase();
  if (lower.includes("car wash") || lower.includes("truck wash")) return "Car Wash";
  if (lower.includes("auto repair") || lower.includes("automotive")) return "Auto Repair";
  if (lower.includes("laundromat") || lower.includes("laundry")) return "Laundromat";
  if (lower.includes("hotel") || lower.includes("motel")) return "Hotel";
  if (lower.includes("liquor")) return "Liquor Store";
  if (lower.includes("industrial") || lower.includes("warehouse")) return "Industrial";
  return "Laundromat";
}

function inferListingFields(result, criteria) {
  const text = `${result.title} ${result.description}`;
  const amounts = moneyFromText(text);
  const ask = amounts.find((value) => !criteria.maxAsk || value <= criteria.maxAsk) || amounts[0] || 0;
  const income = amounts.find((value) => value > 1000 && value < ask * 0.8) || 0;
  const type = inferType(text, criteria.type);
  const name = result.title
    .replace(/\s*\|\s*BizBuySell.*$/i, "")
    .replace(/\s*-\s*BizBuySell.*$/i, "")
    .replace(/\s*\|\s*BizScout.*$/i, "")
    .slice(0, 90)
    .trim() || `${type} Web Lead`;

  return {
    name,
    type,
    location: criteria.location,
    ask,
    incomeLabel: type === "Hotel" ? "Keys" : "SDE",
    income,
    notes: `Automatic web search lead. Title: ${result.title}. Snippet: ${result.description}. URL: ${result.link}`,
    docs: []
  };
}

function buildResearchLeadInput(link, criteria) {
  const text = `${link.title || ""} ${link.snippet || ""}`;
  const requestedType = criteria.type && criteria.type !== "all" ? criteria.type : "";
  const type = requestedType || inferType(text, "");
  const name = (link.title || `${type} research lead`)
    .replace(/^Search\s+/i, "Source search: ")
    .slice(0, 90)
    .trim();

  return {
    name,
    type,
    location: criteria.location,
    ask: 0,
    incomeLabel: "Unknown",
    income: 0,
    notes: `Research lead from public source scout. Snippet: ${link.snippet || "No snippet available."} URL: ${link.url}`,
    docs: []
  };
}

function meaningfulLocationTokens(location) {
  return location.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function isLowQualitySearchResult(text) {
  return [
    "wikipedia",
    "reddit",
    "trustpilot",
    "review:",
    "reviews of",
    "flippa vs",
    "about us",
    "cookie policy"
  ].some((term) => text.includes(term));
}

function brokerSearchLinks(criteria) {
  const asset = criteria.type && criteria.type !== "all" ? criteria.type : "business";
  const query = `${criteria.location} ${asset} for sale asking price cash flow`;
  const encoded = encodeURIComponent(query);
  return [
    {
      title: `Search BizBuySell for ${query}`,
      url: `https://www.bing.com/search?q=${encodeURIComponent(`site:bizbuysell.com ${query}`)}`,
      snippet: "Manual source search. Import only after price and income are visible.",
      kind: "fallback_search"
    },
    {
      title: `Search BizQuest for ${query}`,
      url: `https://www.bing.com/search?q=${encodeURIComponent(`site:bizquest.com ${query}`)}`,
      snippet: "Manual source search. Import only after price and income are visible.",
      kind: "fallback_search"
    },
    {
      title: `Search LoopNet/Crexi for ${query}`,
      url: `https://www.bing.com/search?q=${encodeURIComponent(`(site:loopnet.com OR site:crexi.com) ${query}`)}`,
      snippet: "Manual source search for commercial assets and broker pages.",
      kind: "fallback_search"
    },
    {
      title: `General web search for ${query}`,
      url: `https://www.bing.com/search?q=${encoded}`,
      snippet: "Broader search when broker pages do not expose importable listing details.",
      kind: "fallback_search"
    }
  ];
}

const stateSlugs = {
  alabama: "alabama",
  al: "alabama",
  alaska: "alaska",
  ak: "alaska",
  arizona: "arizona",
  az: "arizona",
  arkansas: "arkansas",
  ar: "arkansas",
  california: "california",
  ca: "california",
  colorado: "colorado",
  co: "colorado",
  connecticut: "connecticut",
  ct: "connecticut",
  delaware: "delaware",
  de: "delaware",
  florida: "florida",
  fl: "florida",
  georgia: "georgia",
  ga: "georgia",
  illinois: "illinois",
  il: "illinois",
  indiana: "indiana",
  in: "indiana",
  kentucky: "kentucky",
  ky: "kentucky",
  louisiana: "louisiana",
  la: "louisiana",
  michigan: "michigan",
  mi: "michigan",
  missouri: "missouri",
  mo: "missouri",
  nevada: "nevada",
  nv: "nevada",
  "new york": "new-york",
  ny: "new-york",
  "north carolina": "north-carolina",
  nc: "north-carolina",
  ohio: "ohio",
  oh: "ohio",
  oklahoma: "oklahoma",
  ok: "oklahoma",
  pennsylvania: "pennsylvania",
  pa: "pennsylvania",
  tennessee: "tennessee",
  tn: "tennessee",
  texas: "texas",
  tx: "texas",
  virginia: "virginia",
  va: "virginia",
  washington: "washington",
  wa: "washington"
};

const businessBrokerTypeSlugs = {
  Laundromat: ["laundromat"],
  "Car Wash": ["car-wash"],
  "Auto Repair": ["auto-repair"],
  Hotel: ["hotel", "motel"],
  "Liquor Store": ["liquor-store"],
  Industrial: ["warehouse", "manufacturing"]
};

function stateSlugFromLocation(location = "") {
  const normalized = location.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (stateSlugs[normalized]) return stateSlugs[normalized];
  for (const token of normalized.split(" ")) {
    if (stateSlugs[token]) return stateSlugs[token];
  }
  for (const [name, slug] of Object.entries(stateSlugs)) {
    if (name.length > 2 && normalized.includes(name)) return slug;
  }
  return null;
}

function businessBrokerSlugsForType(type) {
  if (type && type !== "all") return businessBrokerTypeSlugs[type] || [];
  return Object.values(businessBrokerTypeSlugs).flat();
}

function textAmountAfter(label, text) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*:?\\s*\\$\\s*([0-9][0-9,.]*)`, "i"));
  if (!match) return 0;
  return Number(match[1].replace(/,/g, "")) || 0;
}

function parseBusinessBrokerListings(html, criteria, sourceUrl) {
  const blocks = Array.from(html.matchAll(/<div class="result-item listing"[\s\S]*?(?=<div class="result-item listing"|<div id="fsboLinkEmail"|<\/form>)/g));
  return blocks.map((blockMatch) => {
    const block = blockMatch[0];
    const rawText = stripHtml(block);
    const title = decodeXml(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "").trim();
    const locations = Array.from(block.matchAll(/<div class="location">([\s\S]*?)<\/div>/gi)).map((match) => stripHtml(match[1]));
    const href = block.match(/href="([^"]*\/business-for-sale\/[^"]+)"/i)?.[1] || sourceUrl;
    const ask = textAmountAfter("Asking Price", rawText);
    const sde = textAmountAfter("Cash Flow (SDE)", rawText) || textAmountAfter("Cash Flow", rawText);
    const revenue = textAmountAfter("Revenue", rawText) || textAmountAfter("Gross Revenue", rawText);
    const url = absoluteUrl(href, "https://www.businessbroker.net");
    const type = inferType(`${title} ${rawText}`, criteria.type);
    const incomeLabel = sde ? "SDE" : revenue ? "Revenue" : "Unknown";
    const income = sde || revenue || 0;
    const sourceNote = [
      "BusinessBroker.net public listing scout.",
      `Visible ask: ${ask ? `$${ask.toLocaleString()}` : "not disclosed"}.`,
      `${incomeLabel === "Unknown" ? "Cash flow/revenue not disclosed" : `Visible ${incomeLabel}: $${income.toLocaleString()}`}.`,
      `URL: ${url}`
    ].join(" ");

    if (!title || !ask) return null;
    if (criteria.maxAsk && ask > criteria.maxAsk) return null;

    return {
      input: {
        name: title,
        type,
        location: locations[0] || criteria.location,
        ask,
        incomeLabel,
        income,
        notes: `${sourceNote} Snippet: ${rawText.slice(0, 900)}`,
        docs: []
      },
      url,
      sourceName: "BusinessBroker.net"
    };
  }).filter(Boolean);
}

function visiblePageText(html) {
  return stripHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
  );
}

function textAfter(label, text, stopLabels = []) {
  const start = text.toLowerCase().indexOf(label.toLowerCase());
  if (start === -1) return "";
  const valueStart = start + label.length;
  const stops = stopLabels
    .map((stop) => text.toLowerCase().indexOf(stop.toLowerCase(), valueStart))
    .filter((index) => index > valueStart);
  const end = stops.length ? Math.min(...stops) : Math.min(text.length, valueStart + 160);
  return text.slice(valueStart, end).replace(/^[:\s]+/, "").trim();
}

function parseBusinessBrokerDetail(html) {
  const text = visiblePageText(html);
  const contact = textAfter("Contact:", text, ["Add To Request", "Quick Facts", "Asking Price"]);
  const listingNumber = textAfter("BBN Listing #:", text, ["Broker Reference", "Email or Print", "Business Overview"]);
  const brokerReference = textAfter("Broker Reference #:", text, ["Email or Print", "Business Overview"]);
  const annualRevenue = textAmountAfter("Annual Revenue", text) || textAmountAfter("Gross Revenue", text);
  const cashFlow = textAmountAfter("Cash Flow", text) || textAmountAfter("Cash Flow (SDE)", text);
  const businessOverview = textAfter("Business Overview:", text, ["Detailed Information", "Facilities:", "Competition:"]);

  return {
    contact: contact.replace(/\s+/g, " ").slice(0, 80),
    listingNumber: listingNumber.replace(/\D/g, "").slice(0, 20),
    brokerReference: brokerReference.replace(/\s+/g, " ").slice(0, 40),
    annualRevenue,
    cashFlow,
    businessOverview: businessOverview.replace(/\s+/g, " ").slice(0, 1200)
  };
}

async function enrichBusinessBrokerResult(result) {
  const fetched = await politeFetchText(result.url);
  if (!fetched.ok) {
    result.input.notes = `${result.input.notes} Detail scrape skipped: ${fetched.blocked ? "blocked by robots.txt" : `HTTP ${fetched.status}`}.`;
    return result;
  }

  const detail = parseBusinessBrokerDetail(fetched.text);
  if (!result.input.income && detail.cashFlow) {
    result.input.incomeLabel = "SDE";
    result.input.income = detail.cashFlow;
  } else if (!result.input.income && detail.annualRevenue) {
    result.input.incomeLabel = "Revenue";
    result.input.income = detail.annualRevenue;
  }

  const detailNotes = [
    detail.contact ? `Contact: ${detail.contact}.` : "",
    detail.listingNumber ? `BBN listing #: ${detail.listingNumber}.` : "",
    detail.brokerReference ? `Broker reference #: ${detail.brokerReference}.` : "",
    detail.businessOverview ? `Detail overview: ${detail.businessOverview}` : ""
  ].filter(Boolean).join(" ");

  if (detailNotes) result.input.notes = `${result.input.notes} Detail scrape: ${detailNotes}`;
  return result;
}

async function runBusinessBrokerSearch(criteria) {
  const stateSlug = stateSlugFromLocation(criteria.location);
  if (!stateSlug) return { results: [], sourceLinks: [] };

  const seen = new Set();
  const results = [];
  const sourceLinks = [];
  for (const typeSlug of businessBrokerSlugsForType(criteria.type).slice(0, 8)) {
    if (results.length >= criteria.limit) break;
    const url = `https://www.businessbroker.net/keyword/${stateSlug}/${typeSlug}-businesses-for-sale.aspx`;
    sourceLinks.push({
      title: `BusinessBroker.net ${criteria.location} ${typeSlug.replace(/-/g, " ")} listings`,
      url,
      snippet: "Direct public listing page scanned by Deal Radar.",
      kind: "source_page"
    });
    try {
      const fetched = await politeFetchText(url);
      if (!fetched.ok) {
        sourceLinks[sourceLinks.length - 1].snippet = fetched.blocked
          ? "Skipped because robots.txt disallows this path."
          : `Skipped because source returned HTTP ${fetched.status}.`;
        continue;
      }
      for (const result of parseBusinessBrokerListings(fetched.text, criteria, url)) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        results.push(await enrichBusinessBrokerResult(result));
        if (results.length >= criteria.limit) break;
      }
    } catch (_error) {
      continue;
    }
  }
  return { results, sourceLinks };
}

async function runPublicWebSearch(criteria) {
  const direct = await runBusinessBrokerSearch(criteria);
  if (direct.results.length >= criteria.limit) return direct;

  const typeTerms = criteria.type && criteria.type !== "all"
    ? [criteria.type]
    : ["laundromat", "car wash", "auto repair", "hotel", "liquor store", "industrial"];
  const sourceTerms = ["BusinessBroker.net", "BizBuySell", "BizQuest", "LoopNet", "Crexi", "Sunbelt Network"];
  const queries = typeTerms.flatMap((type) =>
    sourceTerms.map((source) => ({
      type,
      query: `${source} ${criteria.location} ${type} business for sale asking price cash flow`
    }))
  );
  const seen = new Set();
  const results = [...direct.results];
  const sourceLinks = [...direct.sourceLinks];

  for (const search of queries.slice(0, 18)) {
    const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(search.query)}`;
    const response = await fetch(url, { headers: { "User-Agent": "DealRadar/0.1" } });
    if (!response.ok) continue;
    const xml = await response.text();
    for (const item of parseBingRss(xml)) {
      if (!item.link || seen.has(item.link)) continue;
      seen.add(item.link);
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      if (isLowQualitySearchResult(haystack)) continue;
      const locationSignal = meaningfulLocationTokens(criteria.location).some((token) => haystack.includes(token));
      const typeSignal = search.type.toLowerCase().split(/\s+/).some((token) => haystack.includes(token));
      if (!locationSignal && !typeSignal) continue;
      if (!haystack.includes("sale") && !haystack.includes("business") && !haystack.includes("listing")) continue;
      sourceLinks.push({ title: item.title, url: item.link, snippet: item.description, kind: "candidate" });
      const input = inferListingFields(item, criteria);
      if (!input.ask || !input.income) continue;
      if (criteria.maxAsk && input.ask > criteria.maxAsk) continue;
      results.push({ input, url: item.link });
      if (results.length >= criteria.limit) return { results, sourceLinks };
    }
  }

  return { results, sourceLinks: sourceLinks.length ? sourceLinks : brokerSearchLinks(criteria) };
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Image extraction did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeExtractedDeal(extracted) {
  const type = String(extracted.type || "Laundromat").trim();
  const supportedTypes = ["Laundromat", "Hotel", "Car Wash", "Auto Repair", "Liquor Store", "Industrial"];
  return {
    name: String(extracted.name || "Image Imported Deal").trim(),
    type: supportedTypes.includes(type) ? type : "Laundromat",
    location: String(extracted.location || "Unknown location").trim(),
    ask: Number(extracted.ask || 1),
    incomeLabel: String(extracted.incomeLabel || "NOI").trim(),
    income: Number(extracted.income || 0),
    notes: String(extracted.notes || "Extracted from uploaded image. Treat all values as unverified until source documents are reviewed."),
    docs: parseDocs(extracted.docs)
  };
}

async function extractDealFromImage(file) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not set. Add it to your environment to enable screenshot extraction.");
    error.status = 503;
    throw error;
  }

  const base64 = file.buffer.toString("base64");
  const dataUrl = `data:${file.mimetype};base64,${base64}`;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Extract an acquisition listing from this screenshot or photo.",
                "Return only JSON with keys: name, type, location, ask, incomeLabel, income, notes, docs.",
                "type must be one of Laundromat, Hotel, Liquor Store, Industrial.",
                "incomeLabel must be one of NOI, SDE, Keys.",
                "ask and income must be numbers. Use 1 for ask if unknown and 0 for income if unknown.",
                "docs should be an array using any of: financials, lease, utilities, equipment, taxes, insurance.",
                "If a field is not visible, infer cautiously and explain uncertainty in notes."
              ].join(" ")
            },
            { type: "input_image", image_url: dataUrl }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`OpenAI image extraction failed: ${detail}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n");
  if (!outputText) throw new Error("OpenAI image extraction returned no text.");
  return normalizeExtractedDeal(extractJson(outputText));
}

await seedSamples();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: usePostgres ? "postgres" : dbPath });
});

app.get("/api/scrape/sources", (_req, res) => {
  res.json({
    userAgent: scraperUserAgent,
    delayMs: minimumFetchDelayMs,
    sources: [
      {
        name: "BusinessBroker.net",
        mode: "direct_scrape",
        status: "active",
        coverage: "Public keyword listing pages and public listing detail pages",
        notes: "Robots-aware, rate-limited, no login/captcha bypass."
      },
      {
        name: "BizBuySell / BizQuest / LoopNet / Crexi / Sunbelt",
        mode: "source_discovery",
        status: "discovery_only",
        coverage: "Public search result links only unless a result exposes importable listing data",
        notes: "Direct pages often block commodity scraping, so these need official feeds, broker uploads, or source-specific adapters."
      }
    ]
  });
});

app.get("/api/deals", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").toLowerCase();
    const type = String(req.query.type || "");
    const rows = await allDealRows();
    const deals = rows.map(fromRow).filter((deal) => {
      const matchesType = !type || type === "all" || deal.type === type;
      const haystack = [deal.name, deal.type, deal.location, deal.metric, deal.summary, ...deal.tags, ...deal.reasons, ...deal.missing].join(" ").toLowerCase();
      return matchesType && (!q || haystack.includes(q));
    });
    res.json({ deals });
  } catch (error) {
    next(error);
  }
});

app.get("/api/deals/:id", async (req, res, next) => {
  try {
    const row = await dealRowById(req.params.id);
    if (!row) return res.status(404).json({ error: "Deal not found." });
    res.json({ deal: fromRow(row) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/deals/:id", async (req, res, next) => {
  try {
    const deleted = await deleteDealById(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Deal not found." });
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/deals", async (req, res, next) => {
  try {
    const source = String(req.query.source || "").trim();
    if (source === "scout") {
      const deleted = await deleteDealsBySources(["web", "research"]);
      res.json({ deleted });
      return;
    }
    if (!["web", "research"].includes(source)) {
      const error = new Error("Only source=web, source=research, or source=scout can be bulk deleted.");
      error.status = 400;
      throw error;
    }
    const deleted = await deleteDealsBySource(source);
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

app.get("/api/searches", async (_req, res, next) => {
  try {
    const searches = (await allSearchProfileRows()).map(searchProfileFromRow);
    res.json({ searches });
  } catch (error) {
    next(error);
  }
});

app.post("/api/searches", async (req, res, next) => {
  try {
    const search = buildSearchProfile(req.body);
    await insertSearchProfileRecord(search);
    res.status(201).json({ search });
  } catch (error) {
    next(error);
  }
});

app.get("/api/search-runs", async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const runs = (await recentSearchRunRows(limit)).map(searchRunFromRow);
    res.json({ runs });
  } catch (error) {
    next(error);
  }
});

app.get("/api/brain/summary", async (_req, res, next) => {
  try {
    res.json({ summary: await brainSummary() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/brain/observations", async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const observations = (await recentObservationRows(limit)).map(observationFromRow);
    res.json({ observations });
  } catch (error) {
    next(error);
  }
});

app.get("/api/brain/corrections", async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const corrections = (await recentCorrectionRows(limit)).map(correctionFromRow);
    res.json({ corrections });
  } catch (error) {
    next(error);
  }
});

app.post("/api/brain/corrections", async (req, res, next) => {
  try {
    const correction = buildCorrection(req.body);
    await insertCorrectionRecord(correction);
    res.status(201).json({ correction });
  } catch (error) {
    next(error);
  }
});

app.get("/api/brain/training-data", async (req, res, next) => {
  try {
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 500)));
    const observations = (await recentObservationRows(limit)).map(observationFromRow);
    const corrections = (await recentCorrectionRows(limit)).map(correctionFromRow);
    const lines = [
      ...observations.map((observation) => ({
        task: "source_observation",
        sourceName: observation.sourceName,
        url: observation.url,
        title: observation.title,
        rawClaimText: observation.rawClaimText,
        extracted: observation.extracted,
        status: observation.status,
        createdAt: observation.createdAt
      })),
      ...corrections.map((correction) => ({
        task: "field_correction",
        fieldName: correction.fieldName,
        observedValue: correction.observedValue,
        correctedValue: correction.correctedValue,
        correctionType: correction.correctionType,
        notes: correction.notes,
        observationId: correction.observationId,
        dealId: correction.dealId,
        createdAt: correction.createdAt
      }))
    ].map((item) => JSON.stringify(item)).join("\n");
    res.type("text/plain").send(`${lines}\n`);
  } catch (error) {
    next(error);
  }
});

app.post("/api/searches/:id/run", async (req, res, next) => {
  try {
    const row = await searchProfileRowById(req.params.id);
    if (!row) return res.status(404).json({ error: "Search profile not found." });
    const search = searchProfileFromRow(row);
    const result = await runSearchAgent(
      {
        type: search.type,
        location: search.location,
        maxAsk: search.maxAsk,
        limit: search.limit
      },
      search.id
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/agent/run-all", async (req, res, next) => {
  try {
    const secret = process.env.AGENT_CRON_SECRET;
    if (secret && req.get("x-agent-secret") !== secret && req.query.secret !== secret) {
      const error = new Error("Invalid agent secret.");
      error.status = 401;
      throw error;
    }

    const savedSearches = (await activeSearchProfileRows()).map(searchProfileFromRow);
    const searches = savedSearches.length ? savedSearches : defaultSearchProfiles;
    const runs = [];
    for (const search of searches.slice(0, 10)) {
      const result = await runSearchAgent(
        {
          type: search.type,
          location: search.location,
          maxAsk: search.maxAsk,
          limit: search.limit
        },
        search.id || null
      );
      runs.push(result.run);
    }
    res.status(201).json({ count: runs.length, mode: savedSearches.length ? "saved_searches" : "recommended_defaults", runs });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals", async (req, res, next) => {
  try {
    const deal = buildDeal(req.body, req.body.source || "manual");
    await insertDealRecord(deal);
    res.status(201).json({ deal });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/csv", async (req, res, next) => {
  try {
    const rows = parseCsv(String(req.body || ""));
    const created = rows.map((row) => buildDeal(row, "csv"));
    for (const deal of created) await insertDealRecord(deal);
    res.status(201).json({ deals: created });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/extract-image", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("Upload an image file using the image field.");
      error.status = 400;
      throw error;
    }
    if (!req.file.mimetype.startsWith("image/")) {
      const error = new Error("Only image uploads are supported.");
      error.status = 400;
      throw error;
    }

    const extracted = await extractDealFromImage(req.file);
    const deal = buildDeal(extracted, "image");
    deal.tags = ["Image Import", ...deal.tags.filter((tag) => tag !== "Manual Entry")];
    deal.reasons = [
      "Fields were extracted from an uploaded screenshot or photo and should be verified against source documents.",
      ...deal.reasons
    ];
    await insertDealRecord(deal);
    res.status(201).json({ extracted, deal });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/web-search", async (req, res, next) => {
  try {
    const criteria = normalizeSearchCriteria(req.body);
    const result = await runSearchAgent(criteria);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found. Restart the backend if you recently added this feature." });
});

app.use(express.static(__dirname));

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ error: error.message || "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`Deal Radar running at http://localhost:${port}`);
});
