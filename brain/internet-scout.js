const { runWebResearch } = require('../lib/search');

async function searchWeb(query) {
  const pack = await runWebResearch(query);
  const firstRun = pack?.runs?.[0];
  return (firstRun?.results || []).map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.snippet,
  }));
}

function summarizeResults(query, results) {
  if (!results || !results.length) {
    return `Research query: ${query}

No public search results were captured. Try a narrower query or verify that the research provider is configured correctly.`;
  }

  const lines = results
    .slice(0, 5)
    .map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`)
    .join('\n\n');

  return `Research query: ${query}

Captured sources:

${lines}

Scout synthesis:

- Treat these results as leads, not truth.
- Look for repeated patterns across sources before changing the operating plan.
- Promote only durable findings into memory after CEO/Critic review.`;
}

module.exports = { searchWeb, summarizeResults };
