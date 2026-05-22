import express from "express";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const dbPath = join(dataDir, "deal-radar.sqlite");
const port = Number(process.env.PORT || 3000);

if (!existsSync(dataDir)) mkdirSync(dataDir);

const db = new DatabaseSync(dbPath);
db.exec(`
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

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
  }
];

const insertDeal = db.prepare(`
  INSERT OR REPLACE INTO deals (
    id, source, name, type, location, ask, income_label, income, metric_label,
    metric, score, confidence, verified, summary, tags, reasons, missing, memo
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

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

function seedSamples() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM deals").get().count;
  if (count > 0) return;
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
  if (incomeLabel === "Keys") {
    return { metricLabel: "Ask/key", metric: `$${Math.round(ask / Math.max(income, 1)).toLocaleString()}` };
  }
  if (incomeLabel === "SDE") {
    return { metricLabel: "Multiple", metric: `${(ask / Math.max(income, 1)).toFixed(1)}x` };
  }
  return { metricLabel: "Cap", metric: `${((income / ask) * 100).toFixed(1)}%` };
}

function scoreDeal({ ask, income, incomeLabel, type, docs, notes }) {
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

  if (!name || !type || !location || !Number.isFinite(ask) || ask <= 0 || !Number.isFinite(income)) {
    const error = new Error("name, type, location, ask, and income are required.");
    error.status = 400;
    throw error;
  }

  const { score, confidence } = scoreDeal({ ask, income, incomeLabel, type, docs, notes });
  const { metricLabel, metric } = metricFor({ ask, income, incomeLabel });
  const missing = missingItemsFor(type, docs, incomeLabel);
  const verified = confidence >= 82;
  const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "deal";

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
    tags: [source === "csv" ? "CSV Upload" : "Manual Entry", verified ? "Verified Inputs" : "Needs Verification", score >= 85 ? "Priority" : "Diligence"],
    reasons: [
      incomeLabel === "Keys" ? `Initial hotel basis is ${metric}.` : `${incomeLabel} implies ${metric} at the asking price.`,
      `${docs.length} of 6 core diligence documents were marked as received.`,
      confidence >= 82 ? "Confidence is high enough for deeper underwriting." : "Confidence is limited by missing source documents."
    ],
    missing,
    memo: `${name} is a ${type.toLowerCase()} opportunity in ${location} with an initial Deal Score of ${score} and ${confidence}% confidence. Next step: request the missing diligence items before treating the valuation as reliable.`
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

seedSamples();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: dbPath });
});

app.get("/api/deals", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const type = String(req.query.type || "");
  const rows = db.prepare("SELECT * FROM deals ORDER BY created_at DESC, score DESC").all();
  const deals = rows.map(fromRow).filter((deal) => {
    const matchesType = !type || type === "all" || deal.type === type;
    const haystack = [deal.name, deal.type, deal.location, deal.metric, deal.summary, ...deal.tags, ...deal.reasons, ...deal.missing].join(" ").toLowerCase();
    return matchesType && (!q || haystack.includes(q));
  });
  res.json({ deals });
});

app.get("/api/deals/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Deal not found." });
  res.json({ deal: fromRow(row) });
});

app.post("/api/deals", (req, res, next) => {
  try {
    const deal = buildDeal(req.body, req.body.source || "manual");
    insertDeal.run(...toRow(deal));
    res.status(201).json({ deal });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/csv", (req, res, next) => {
  try {
    const rows = parseCsv(String(req.body || ""));
    const created = rows.map((row) => buildDeal(row, "csv"));
    db.exec("BEGIN");
    try {
      for (const deal of created) insertDeal.run(...toRow(deal));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.status(201).json({ deals: created });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ error: error.message || "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`Deal Radar running at http://localhost:${port}`);
});
