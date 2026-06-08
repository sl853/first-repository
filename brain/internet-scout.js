const https = require('https');

function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'UnderstudyBrain/0.1 (+https://understudy.local)',
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
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out fetching ${url}`));
    });
    request.on('error', reject);
  });
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(html) {
  return decodeHtml(
    html
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
    });
  }
  return results;
}

async function searchWeb(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  return extractDuckDuckGoResults(html);
}

function summarizeResults(query, results) {
  if (!results.length) {
    return `No public search results were captured for "${query}". Try a narrower query or add an API-backed search provider later.`;
  }

  const sourceLines = results
    .slice(0, 5)
    .map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`)
    .join('\n\n');

  return `Research query: ${query}

Captured sources:

${sourceLines}

Scout synthesis:

- Treat these results as leads, not truth.
- Look for repeated patterns across sources before changing the operating plan.
- Promote only durable findings into memory after CEO/Critic review.`;
}

module.exports = { searchWeb, summarizeResults };
