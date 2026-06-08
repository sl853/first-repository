# Understudy

Express + EJS landing site for Understudy, an operator-owned holding company.

## Requirements

- Node.js 20+
- PostgreSQL database only when you are using migrations or database-backed features

## Environment Variables

- `PORT` - server port, defaults to `3000`
- `DATABASE_URL` - optional locally; required only for migrations/database use
- `POLSIA_ANALYTICS_SLUG` - optional analytics slug
- `OPENAI_API_KEY` - optional; enables model calls and OpenAI context graph embeddings
- `CONTEXT_GRAPH_EMBEDDINGS=local` - optional; force local hash embeddings even when `OPENAI_API_KEY` is set
- `CONTEXT_GRAPH_EMBEDDING_MODEL` - optional; defaults to `text-embedding-3-small`
- `PRIVATE_SITE_PASSWORD` - optional; when set, `/brain` requires this password
- `PRIVATE_SITE_SESSION_SECRET` - optional but recommended when `PRIVATE_SITE_PASSWORD` is set; signs the private login cookie

## Endpoints

- `GET /` - landing page
- `GET /health` - health check
- `GET /brain` - private operating brain, optionally password protected

## Local Development

```bash
npm install
npm run dev
```

The app can run locally without `DATABASE_URL`. If `DATABASE_URL` is not set,
`npm run build` skips migrations.

## Layout

```text
views/
  layout.ejs
  partials/
public/
  css/
  images/
lib/
  landing-context.js
server.js
migrate.js
```

## Deployment

Configured for Render via `render.yaml`. `npm run build` runs migrations when
`DATABASE_URL` is configured.
