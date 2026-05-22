# Deal Radar Deployment

Deal Radar now supports two database modes:

- Local development uses SQLite in `data/deal-radar.sqlite`.
- Production uses Postgres when `DATABASE_URL` is set.

## Recommended First Host

Use Render for the web app and Neon or Supabase for Postgres.

- Render web services: https://render.com/docs/web-services
- Render environment variables: https://render.com/docs/configure-environment-variables
- Neon connection strings: https://neon.com/docs/get-started-with-neon/connect-neon

GitHub Pages is still useful as a static preview, but it cannot run `server.js`, save listings, call the search endpoint, or process uploads. The live product should be hosted on a backend-capable platform.

## Render Setup

1. Push this repository to GitHub.
2. Create a new Postgres database with Neon or Supabase.
3. Copy the Postgres connection string.
4. In Render, create a new Web Service from this GitHub repository.
5. Use:
   - Build command: `npm install`
   - Start command: `npm start`
6. Add environment variables in Render:
   - `DATABASE_URL`: your Postgres connection string
   - `PGSSLMODE`: `require`
   - `SEED_SAMPLE_DEALS`: `false`
   - `OPENAI_API_KEY`: optional, needed for screenshot/photo extraction
   - `OPENAI_MODEL`: optional, defaults to `gpt-4.1-mini`
7. Deploy the service.
8. Open `https://your-render-service.onrender.com/api/health`.

If health returns `{ "ok": true, "database": "postgres" }`, the deployed backend is connected to production storage.

## Local Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm start
```

Open:

```text
http://localhost:3000/
```

Local listings are saved to SQLite. Production listings are saved to Postgres.

## Important Notes

The current public web search is an MVP scout, not a perfect feed. It pulls public search results, converts likely listings into Deal Radar records, and marks them as unverified.

The stronger long-term backend should add:

- Broker upload portal
- Standard listing template
- Document upload for P&L, leases, taxes, utilities, and equipment lists
- AI extraction into structured fields
- Verified/unverified badges
- Provider feeds and enrichment data after the core workflow proves useful
