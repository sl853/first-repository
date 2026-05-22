import express from "express";
import multer from "multer";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const dbPath = join(dataDir, "deal-radar.sqlite");
const port = Number(process.env.PORT || 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

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
  const sourceLabels = {
    csv: "CSV Upload",
    image: "Image Import",
    web: "Web Lead",
    manual: "Manual Entry"
  };

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
    tags: [sourceLabels[source] || "Manual Entry", verified ? "Verified Inputs" : "Needs Verification", score >= 85 ? "Priority" : "Diligence"],
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

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripHtml(value = "") {
  return decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
  const ask = amounts.find((value) => !criteria.maxAsk || value <= criteria.maxAsk) || amounts[0] || 1;
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

async function runPublicWebSearch(criteria) {
  const typeTerms = criteria.type && criteria.type !== "all"
    ? [criteria.type]
    : ["laundromat", "car wash", "auto repair"];
  const sourceTerms = ["site:bizbuysell.com", "site:bizscout.com", "site:sunbeltnetwork.com"];
  const queries = typeTerms.flatMap((type) =>
    sourceTerms.map((source) => `${source} ${criteria.location} ${type} for sale asking price cash flow`)
  );
  const seen = new Set();
  const results = [];

  for (const query of queries.slice(0, 9)) {
    const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { "User-Agent": "DealRadar/0.1" } });
    if (!response.ok) continue;
    const xml = await response.text();
    for (const item of parseBingRss(xml)) {
      if (!item.link || seen.has(item.link)) continue;
      seen.add(item.link);
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      if (!haystack.includes("sale") && !haystack.includes("cash flow") && !haystack.includes("asking")) continue;
      const input = inferListingFields(item, criteria);
      if (criteria.maxAsk && input.ask > criteria.maxAsk) continue;
      results.push({ input, url: item.link });
      if (results.length >= criteria.limit) return results;
    }
  }

  return results;
}

function fallbackWebLeads(criteria) {
  const fallback = [
    {
      name: "Cougar Ridge Car Wash",
      type: "Car Wash",
      location: "Waco, TX",
      ask: 1000000,
      incomeLabel: "SDE",
      income: 84495,
      notes: "Fallback public broker scout lead from BizBuySell Texas car wash category page. Snippet shows asking price $1,000,000 and cash flow $84,495. URL: https://www.bizbuysell.com/texas/car-washes-for-sale/",
      docs: []
    },
    {
      name: "Turnkey Single Bay Automatic Car Wash",
      type: "Car Wash",
      location: "San Antonio, TX",
      ask: 1500000,
      incomeLabel: "SDE",
      income: 197000,
      notes: "Fallback public broker scout lead from BizBuySell Texas car wash category page. Snippet shows asking price $1,500,000 and cash flow $197,000 with real estate included. URL: https://broker.bizbuysell.com/texas/car-washes-for-sale/",
      docs: []
    },
    {
      name: "Auto and Body Shop",
      type: "Auto Repair",
      location: "Houston, TX",
      ask: 115000,
      incomeLabel: "SDE",
      income: 77000,
      notes: "Fallback public broker scout lead from BizBuySell Texas auto repair category page. Snippet shows asking price $115,000 and cash flow $77,000. URL: https://www.bizbuysell.com/texas/auto-repair-and-service-shops-established-businesses-for-sale/",
      docs: []
    },
    {
      name: "Auto Repair Shop in Collin County",
      type: "Auto Repair",
      location: "Collin County, TX",
      ask: 200000,
      incomeLabel: "SDE",
      income: 76600,
      notes: "Fallback public broker scout lead from BizBuySell Texas auto repair page. Snippet shows asking price $200,000 and cash flow $76,600. URL: https://www.bizbuysell.com/texas/auto-repair-and-service-shop-established-businesses-for-sale/2/",
      docs: []
    },
    {
      name: "Northeast Texas Auto Repair",
      type: "Auto Repair",
      location: "Northeast Texas",
      ask: 720000,
      incomeLabel: "SDE",
      income: 240000,
      notes: "Fallback public broker scout lead from BizBuySell Texas auto repair page. Snippet shows asking price $720,000 and cash flow $240,000. URL: https://www.bizbuysell.com/texas/auto-repair-and-service-shop-established-businesses-for-sale/2/",
      docs: []
    },
    {
      name: "Garland Smart Laundromat",
      type: "Laundromat",
      location: "Garland, TX",
      ask: 550000,
      incomeLabel: "SDE",
      income: 140000,
      notes: "Fallback public broker scout lead from BizBuySell Texas laundromat category page. Snippet shows asking price $550,000 and cash flow $140,000. URL: https://www.bizbuysell.com/texas/laundromats-and-coin-laundry-established-businesses-for-sale/",
      docs: []
    }
  ];

  const state = criteria.location.toLowerCase().includes("tx") || criteria.location.toLowerCase().includes("texas");
  return fallback
    .filter((lead) => criteria.type === "all" || lead.type === criteria.type)
    .filter((lead) => state || lead.location.toLowerCase().includes(criteria.location.toLowerCase()))
    .filter((lead) => !criteria.maxAsk || lead.ask <= criteria.maxAsk)
    .slice(0, criteria.limit)
    .map((input) => ({ input, url: input.notes.match(/URL: (.*)$/)?.[1] || "" }));
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
  return {
    name: String(extracted.name || "Image Imported Deal").trim(),
    type: ["Laundromat", "Hotel", "Liquor Store", "Industrial"].includes(type) ? type : "Laundromat",
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
    insertDeal.run(...toRow(deal));
    res.status(201).json({ extracted, deal });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/web-search", async (req, res, next) => {
  try {
    const criteria = {
      type: String(req.body.type || "all"),
      location: String(req.body.location || "Texas").trim(),
      maxAsk: Number(req.body.maxAsk || 1500000),
      limit: Math.min(12, Math.max(1, Number(req.body.limit || 6)))
    };
    if (!criteria.location) {
      const error = new Error("location is required.");
      error.status = 400;
      throw error;
    }

    let found = await runPublicWebSearch(criteria);
    if (!found.length) found = fallbackWebLeads(criteria);
    const created = [];
    for (const result of found) {
      const deal = buildDeal(result.input, "web");
      const existing = db.prepare("SELECT id FROM deals WHERE summary LIKE ?").get(`%${result.url}%`);
      if (existing) continue;
      insertDeal.run(...toRow(deal));
      created.push(deal);
    }
    res.status(201).json({ criteria, count: created.length, deals: created });
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
