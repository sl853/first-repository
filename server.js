const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const { buildLandingContext } = require('./lib/landing-context');
const { buildBrainContext } = require('./lib/brain-context');
const { getLatestReportStatus } = require('./lib/report-context');

const app = express();
const port = process.env.PORT || 3000;
const privateSitePassword = process.env.PRIVATE_SITE_PASSWORD || '';
const privateSessionSecret =
  process.env.PRIVATE_SITE_SESSION_SECRET || (privateSitePassword ? `${privateSitePassword}:understudy` : '');
const privateCookieName = 'understudy_private';

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) return cookies;
      const name = decodeURIComponent(part.slice(0, eqIndex).trim());
      const value = decodeURIComponent(part.slice(eqIndex + 1).trim());
      cookies[name] = value;
      return cookies;
    }, {});
}

function buildPrivateAuthToken() {
  if (!privateSitePassword || !privateSessionSecret) return '';
  return crypto
    .createHash('sha256')
    .update(`${privateSitePassword}:${privateSessionSecret}`)
    .digest('hex');
}

function setPrivateAuthCookie(res) {
  const token = buildPrivateAuthToken();
  const parts = [
    `${privateCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearPrivateAuthCookie(res) {
  const parts = [
    `${privateCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function isPrivateAuthenticated(req) {
  if (!privateSitePassword) return true;

  const cookies = parseCookies(req.headers.cookie || '');
  const actual = cookies[privateCookieName] || '';
  const expected = buildPrivateAuthToken();
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sanitizeNextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/brain';
  if (value.startsWith('//')) return '/brain';
  return value;
}

function requirePrivateAuth(req, res, next) {
  if (isPrivateAuthenticated(req)) {
    return next();
  }

  const destination = encodeURIComponent(sanitizeNextPath(req.originalUrl || '/brain'));
  return res.redirect(`/brain/login?next=${destination}`);
}

// EJS view engine. Templates live in ./views/ (entry point: layout.ejs).
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health check endpoint (required for Render)
// Note: Does NOT query database to allow Neon auto-suspend
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: pool ? 'configured' : 'not_configured' });
});

app.get('/api/report-status', (_req, res) => {
  res.json(getLatestReportStatus());
});

// Serve static files from public folder.
// `index: false` disables auto-serving public/index.html as the directory
// index. `/` always hits the EJS render route below.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Landing page
app.get('/', (_req, res) => {
  res.render('layout', buildLandingContext());
});

app.get('/brain/login', (req, res) => {
  if (!privateSitePassword) {
    return res.redirect('/brain');
  }

  if (isPrivateAuthenticated(req)) {
    return res.redirect('/brain');
  }

  return res.render('brain-login', {
    ...buildLandingContext(),
    error: req.query.error === '1',
    next: sanitizeNextPath(req.query.next),
  });
});

app.post('/brain/login', (req, res) => {
  if (!privateSitePassword) {
    return res.redirect('/brain');
  }

  if (req.body.password !== privateSitePassword) {
    const nextTarget = sanitizeNextPath(req.body.next);
    return res.redirect(`/brain/login?error=1&next=${encodeURIComponent(nextTarget)}`);
  }

  setPrivateAuthCookie(res);
  const nextTarget = sanitizeNextPath(req.body.next);
  return res.redirect(nextTarget);
});

app.post('/brain/logout', (_req, res) => {
  clearPrivateAuthCookie(res);
  res.redirect('/brain/login');
});

app.get('/brain', requirePrivateAuth, (req, res) => {
  res.render('brain', {
    ...buildLandingContext(),
    ...buildBrainContext(),
    sent: req.query.sent === '1',
  });
});

app.post('/brain/message', requirePrivateAuth, async (req, res, next) => {
  try {
    const { saveBrainMessage, runBrainProcedure } = require('./lib/brain-context');
    const entry = saveBrainMessage({
      type: req.body.type,
      message: req.body.message,
    });
    if (entry) await runBrainProcedure(entry);
    res.redirect('/brain?sent=1');
  } catch (error) {
    next(error);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
