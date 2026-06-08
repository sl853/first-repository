const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const BRAIN_DIR = path.join(__dirname, '..', 'brain');
const STATE_DIR = path.join(BRAIN_DIR, 'state');
const CONTEXT_GRAPH_PATH = path.join(STATE_DIR, 'context-graph.json');
const LOCAL_EMBEDDING_DIMENSIONS = 256;
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

let pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function summarizeContent(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
}

function shouldStoreContextNode(content) {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim();
  if (normalized.length < 40) return false;
  if (/^(saved|remembered)\.?$/i.test(normalized)) return false;
  return true;
}

function localHashEmbedding(content) {
  const vector = new Array(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
  const tokens = String(content || '').toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g) || [];

  for (const token of tokens) {
    const digest = crypto.createHash('sha256').update(token).digest();
    const index = digest.readUInt16BE(0) % LOCAL_EMBEDDING_DIMENSIONS;
    const sign = digest[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

async function embedContent(content) {
  const model = process.env.CONTEXT_GRAPH_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL;

  if (process.env.OPENAI_API_KEY && process.env.CONTEXT_GRAPH_EMBEDDINGS !== 'local') {
    try {
      const OpenAI = require('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.embeddings.create({
        model,
        input: String(content).slice(0, 24000),
      });
      const embedding = response.data[0]?.embedding || [];
      return { embedding, model, dimensions: embedding.length };
    } catch (error) {
      console.warn(`OpenAI embedding failed; using local hash embedding: ${error.message}`);
    }
  }

  const embedding = localHashEmbedding(content);
  return {
    embedding,
    model: 'local-hash-v1',
    dimensions: embedding.length,
  };
}

async function writeDatabaseNode(node) {
  const database = getPool();
  if (!database) return false;

  await database.query(
    `
      INSERT INTO context_graph_nodes (
        source_type,
        source_id,
        title,
        summary,
        content,
        metadata,
        content_hash,
        embedding_model,
        embedding_dimensions,
        embedding
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb)
      ON CONFLICT (content_hash) DO UPDATE SET
        source_type = EXCLUDED.source_type,
        source_id = EXCLUDED.source_id,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        content = EXCLUDED.content,
        metadata = context_graph_nodes.metadata || EXCLUDED.metadata,
        embedding_model = EXCLUDED.embedding_model,
        embedding_dimensions = EXCLUDED.embedding_dimensions,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `,
    [
      node.sourceType,
      node.sourceId,
      node.title,
      node.summary,
      node.content,
      JSON.stringify(node.metadata),
      node.contentHash,
      node.embeddingModel,
      node.embeddingDimensions,
      JSON.stringify(node.embedding),
    ]
  );

  return true;
}

function writeLocalNode(node) {
  const graph = readJson(CONTEXT_GRAPH_PATH, { nodes: [] });
  graph.nodes = graph.nodes || [];
  const existingIndex = graph.nodes.findIndex((item) => item.contentHash === node.contentHash);

  if (existingIndex >= 0) {
    graph.nodes[existingIndex] = {
      ...graph.nodes[existingIndex],
      ...node,
      metadata: {
        ...(graph.nodes[existingIndex].metadata || {}),
        ...(node.metadata || {}),
      },
      updatedAt: new Date().toISOString(),
    };
  } else {
    graph.nodes.push(node);
  }

  writeJson(CONTEXT_GRAPH_PATH, graph);
}

function readLocalContextGraph(limit = 20) {
  const graph = readJson(CONTEXT_GRAPH_PATH, { nodes: [] });
  return (graph.nodes || [])
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, limit)
    .map((node) => ({
      sourceType: node.sourceType,
      sourceId: node.sourceId,
      title: node.title,
      summary: node.summary,
      metadata: node.metadata,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    }));
}

async function storeContextGraphNode(input) {
  const content = String(input.content || '').trim();
  if (!shouldStoreContextNode(content)) {
    return { stored: false, reason: 'content-not-memory-worthy' };
  }

  const contentHash = hashValue(`${input.sourceType || 'unknown'}\n${content}`);
  const embedded = await embedContent(content);
  const node = {
    sourceType: input.sourceType || 'unknown',
    sourceId: input.sourceId || null,
    title: input.title || null,
    summary: input.summary || summarizeContent(content),
    content,
    metadata: input.metadata || {},
    contentHash,
    embeddingModel: embedded.model,
    embeddingDimensions: embedded.dimensions,
    embedding: embedded.embedding,
    createdAt: new Date().toISOString(),
  };

  try {
    if (await writeDatabaseNode(node)) {
      return { stored: true, backend: 'database', contentHash };
    }
  } catch (error) {
    console.warn(`Context graph database write failed; using local file fallback: ${error.message}`);
  }

  writeLocalNode(node);
  return { stored: true, backend: 'file', contentHash };
}

module.exports = { storeContextGraphNode, shouldStoreContextNode, readLocalContextGraph, CONTEXT_GRAPH_PATH };
