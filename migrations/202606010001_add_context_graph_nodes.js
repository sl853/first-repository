module.exports = {
  name: 'add_context_graph_nodes',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS context_graph_nodes (
        id BIGSERIAL PRIMARY KEY,
        source_type VARCHAR(80) NOT NULL,
        source_id VARCHAR(255),
        title TEXT,
        summary TEXT,
        content TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        content_hash CHAR(64) NOT NULL UNIQUE,
        embedding_model VARCHAR(120) NOT NULL,
        embedding_dimensions INTEGER NOT NULL,
        embedding JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS context_graph_nodes_source_idx
      ON context_graph_nodes (source_type, source_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS context_graph_nodes_metadata_idx
      ON context_graph_nodes USING GIN (metadata)
    `);
  },
};
