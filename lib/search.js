const https = require('https');

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
          if (raw.length > 1000000) request.destroy(new Error(`Response too large from ${url}`));
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode} from ${url}: ${raw.slice(0, 300)}`));
            return;
          }
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
          }
        });
      }
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Timed out fetching ${url}`)));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'UnderstudyBrain/0.2 (+https://understudy.local)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          resolve(fetchText(new URL(response.headers.location, url).toString(), timeoutMs));
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 300000) request.destroy();
        });
        response.on('end', () => resolve(body));
      }
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Timed out fetching ${url}`)));
    request.on('error', reject);
  });
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(html) {
  return decodeHtml(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractDuckDuckGoResults(html) {
  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(html)) && results.length < 8) {
    const rawUrl = decodeHtml(match[1]);
    let url = rawUrl;
    try {
      const parsed = new URL(rawUrl, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) url = uddg;
    } catch {
      url = rawUrl;
    }
    results.push({
      title: stripHtml(match[2]),
      url,
      snippet: stripHtml(match[3]),
      source: 'duckduckgo',
      score: null,
      publishedDate: null,
    });
  }
  return results;
}

async function searchDuckDuckGo(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  return extractDuckDuckGoResults(html);
}

async function searchTavily(query, { maxResults = 5, depth = 'basic' } = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY is not set.');

  const response = await requestJson(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: depth,
      include_answer: true,
      include_raw_content: false,
      topic: 'general',
    }),
    timeoutMs: 20000,
  });

  return {
    answer: response.answer || '',
    results: (response.results || []).map((result) => ({
      title: result.title || 'Untitled source',
      url: result.url || '',
      snippet: (result.content || result.snippet || '').replace(/\s+/g, ' ').trim(),
      source: 'tavily',
      score: typeof result.score === 'number' ? result.score : null,
      publishedDate: result.published_date || null,
    })),
  };
}

function formatSearchResults(query, run) {
  if (!run || !(run.results || []).length) return null;

  const lines = [`Web search: "${query}"`, `Provider: ${run.provider}`];

  if (run.answer) {
    lines.push(`\nSummary: ${run.answer}`);
  }

  if (run.warning) {
    lines.push(`\nFallback note: ${run.warning}`);
  }

  lines.push('\nSources:');
  run.results.slice(0, 5).forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   ${result.url}`);
    if (result.snippet) lines.push(`   ${result.snippet.slice(0, 280)}`);
  });

  return lines.join('\n');
}

async function runSingleSearch(query) {
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavily = await searchTavily(query);
      return {
        provider: 'tavily',
        query,
        answer: tavily.answer,
        results: tavily.results,
      };
    } catch (error) {
      const fallbackResults = await searchDuckDuckGo(query);
      return {
        provider: 'duckduckgo-fallback',
        query,
        answer: '',
        results: fallbackResults,
        warning: error.message,
      };
    }
  }

  return {
    provider: 'duckduckgo',
    query,
    answer: '',
    results: await searchDuckDuckGo(query),
  };
}

async function runWebResearch(question) {
  const q1 = question.trim();
  const q2 = question
    .replace(/^(what|how|why|when|where|who|should|can|is|are|does|do|will|would|could)\s+/i, '')
    .replace(/\?/g, '')
    .trim()
    .slice(0, 80);

  const queries = q2 && q2 !== q1 ? [q1, q2] : [q1];
  const runs = [];
  const blocks = [];

  for (const query of queries) {
    let run;
    try {
      run = await runSingleSearch(query);
    } catch (error) {
      run = {
        provider: 'failed',
        query,
        answer: '',
        results: [],
        warning: error.message,
      };
    }
    runs.push(run);
    const block = formatSearchResults(query, run);
    if (block) blocks.push(block);
  }

  const seen = new Set();
  const sources = runs
    .flatMap((run) => run.results || [])
    .filter((result) => {
      if (!result.url || seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    })
    .slice(0, 8)
    .map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      source: result.source,
      score: result.score,
      publishedDate: result.publishedDate,
    }));

  return {
    queries,
    runs,
    sources,
    summary: blocks.length ? blocks.join('\n\n---\n\n') : 'No web research results captured.',
  };
}

module.exports = {
  runWebResearch,
  formatSearchResults,
};
