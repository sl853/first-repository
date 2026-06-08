const fs = require('fs');
const path = require('path');
const { listReports } = require('./report-context');
const { runCeoArtifacts } = require('./ceo-artifacts');
const { runConstitutionalScanner } = require('./constitutional-scanner');
const { readLocalContextGraph, storeContextGraphNode } = require('./context-graph');
const { logRoutingDecision, routeDecision } = require('./model-routing');

const BRAIN_DIR = path.join(__dirname, '..', 'brain');
const STATE_DIR = path.join(BRAIN_DIR, 'state');
const CONVERSATIONS_DIR = path.join(BRAIN_DIR, 'conversations');
const INBOX_DIR = path.join(BRAIN_DIR, 'inbox');
const PROMPTS_DIR = path.join(BRAIN_DIR, 'prompts');
const BRIEF_PATH = path.join(__dirname, '..', 'docs', 'understudy-brief.md');
const CHARTER_PATH = path.join(BRAIN_DIR, 'charter.md');
const ARCHITECTURE_PATH = path.join(BRAIN_DIR, 'architecture.md');
const CONFIG_PATH = path.join(BRAIN_DIR, 'config.json');

function isLoopbackBaseUrl(baseUrl = '') {
  return /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(baseUrl);
}

function isRenderRuntime() {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
}

function hostedOllamaWarning(baseUrl) {
  return `Hosted deployment cannot reach local Ollama at ${baseUrl}. Add OPENAI_API_KEY or set OLLAMA_BASE_URL to a remote model server.`;
}

function readText(filePath, fallback = '') {
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function listJson(dirPath, suffix) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .reverse()
    .map((file) => {
      const fullPath = path.join(dirPath, file);
      return {
        file,
        data: readJson(fullPath, {}),
        mtime: fs.statSync(fullPath).mtime,
      };
    });
}

function buildBrainContext() {
  const memory = readJson(path.join(STATE_DIR, 'memory.json'), {});
  const tasks = readJson(path.join(STATE_DIR, 'tasks.json'), []);
  const config = readJson(CONFIG_PATH, {});
  const scrollingState = readText(path.join(STATE_DIR, 'scrolling-state.md'), 'No state yet.');
  const conversations = listJson(CONVERSATIONS_DIR, '.json').slice(0, 8);
  const reports = listReports(8);
  const contextGraph = readLocalContextGraph(12);

  return {
    memory,
    tasks,
    contextGraph,
    modelStatus: buildModelStatus(config),
    scrollingState,
    conversations,
    latestProcedure: conversations[0] || null,
    reports,
    latestReport: reports[0] || null,
    runCadence: {
      current: 'On demand: every saved message runs the CEO procedure immediately.',
      recommended: 'Daily: one standing CEO procedure each morning, plus ad hoc procedures whenever Spencer asks.',
      hosted: 'Later: schedule a daily job after model access and approval gates are configured.',
    },
  };
}

function buildModelStatus(config) {
  const provider = config.provider || 'auto';
  const openaiReady = Boolean(process.env.OPENAI_API_KEY);
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || config.ollama?.baseUrl || 'http://127.0.0.1:11434';
  const ollamaModel = config.ollama?.model || 'llama3.1:8b';
  const vllmBaseUrl = process.env.VLLM_BASE_URL || config.vllm?.baseUrl || '';
  const vllmModel = process.env.VLLM_MODEL || config.vllm?.model || 'Qwen/Qwen3-32B';
  const hostedLoopbackOllama = isRenderRuntime() && isLoopbackBaseUrl(ollamaBaseUrl);

  let active = 'local fallback';
  let detail = 'No hosted key or local adapter is active yet.';

  if ((provider === 'auto' || provider === 'openai') && openaiReady) {
    active = 'OpenAI';
    detail = `${config.model || 'gpt-4o-mini'} via OPENAI_API_KEY`;
  } else if (provider === 'hybrid') {
    active = 'Hybrid';
    detail = openaiReady
      ? `Ollama ${ollamaModel} for routine work; ${config.model || 'gpt-4o-mini'} for critic and complex decisions`
      : `Ollama ${ollamaModel}; set OPENAI_API_KEY to enable complex-decision routing`;
  } else if (provider === 'vllm' || provider === 'openai-compatible') {
    active = 'OpenAI-compatible';
    detail = vllmBaseUrl
      ? `${vllmModel} via ${vllmBaseUrl}`
      : `${vllmModel}; set VLLM_BASE_URL before use`;
  } else if (hostedLoopbackOllama && (provider === 'auto' || provider === 'ollama' || provider === 'hybrid')) {
    active = 'Model not connected';
    detail = hostedOllamaWarning(ollamaBaseUrl);
  } else if (provider === 'auto') {
    active = 'Auto';
    detail = openaiReady
      ? `${config.model || 'gpt-4o-mini'} via OPENAI_API_KEY`
      : `will try Ollama ${ollamaModel} at ${ollamaBaseUrl}, then fallback`;
  } else if (provider === 'ollama') {
    active = 'Ollama configured';
    detail = `${ollamaModel} at ${ollamaBaseUrl}`;
  }

  return {
    provider,
    active,
    detail,
    openaiReady,
    ollamaBaseUrl,
    ollamaModel,
    vllmBaseUrl,
    vllmModel,
  };
}

function slugTime() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function saveBrainMessage(input) {
  const type = ['request', 'memory', 'research'].includes(input.type) ? input.type : 'request';
  const message = String(input.message || '').trim();
  if (!message) return null;

  if (!fs.existsSync(INBOX_DIR)) fs.mkdirSync(INBOX_DIR, { recursive: true });
  const entry = {
    date: new Date().toISOString(),
    type,
    message,
    status: 'new',
  };
  const inboxPath = path.join(INBOX_DIR, `${slugTime()}-${type}.json`);
  fs.writeFileSync(inboxPath, `${JSON.stringify(entry, null, 2)}\n`);
  entry.inboxPath = inboxPath;

  if (type === 'memory') {
    const memoryPath = path.join(STATE_DIR, 'memory.json');
    const memory = readJson(memoryPath, { notes: [] });
    memory.notes = memory.notes || [];
    memory.notes.push({ date: entry.date.slice(0, 10), note: message });
    fs.writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);
  }

  return entry;
}

function buildProcedureContext() {
  return {
    config: readJson(CONFIG_PATH, {}),
    brief: readText(BRIEF_PATH),
    charter: readText(CHARTER_PATH),
    architecture: readText(ARCHITECTURE_PATH),
    scrollingState: readText(path.join(STATE_DIR, 'scrolling-state.md')),
    memory: readJson(path.join(STATE_DIR, 'memory.json'), {}),
    tasks: readJson(path.join(STATE_DIR, 'tasks.json'), []),
    contextGraph: readLocalContextGraph(20),
    prompts: {
      ceo: readText(path.join(PROMPTS_DIR, 'ceo.md')),
      critic: readText(path.join(PROMPTS_DIR, 'critic.md')),
      scout: readText(path.join(PROMPTS_DIR, 'scout.md')),
      operator: readText(path.join(PROMPTS_DIR, 'operator.md')),
      researchDirective: readText(path.join(PROMPTS_DIR, 'research-directive.md')),
      ceoResearch: readText(path.join(PROMPTS_DIR, 'ceo-research-simple.md')),
    },
  };
}

async function callOpenAI(messages, model, temperature, options = {}) {
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    baseURL: options.baseURL,
  });
  const response = await client.chat.completions.create({
    model,
    temperature,
    messages,
  });
  return response.choices[0]?.message?.content || '';
}

async function callOllama(messages, model, temperature, baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama ${response.status}: ${text.slice(0, 240)}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function callAutoModel(context, role, messages, temperature) {
  const useCritic = role === 'critic';
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || context.config.ollama?.baseUrl || 'http://127.0.0.1:11434';
  const ollamaModel = useCritic
    ? context.config.ollama?.criticModel || context.config.ollama?.model || 'llama3.1:8b'
    : context.config.ollama?.model || 'llama3.1:8b';
  const openaiModel = useCritic
    ? context.config.criticModel || context.config.model || 'gpt-4o-mini'
    : context.config.model || 'gpt-4o-mini';
  const canUseHosted = Boolean(process.env.OPENAI_API_KEY);
  const hostedLoopbackOllama = isRenderRuntime() && isLoopbackBaseUrl(ollamaBaseUrl);

  if (!hostedLoopbackOllama) {
    try {
      return {
        provider: 'ollama',
        content: await callOllama(messages, ollamaModel, temperature, ollamaBaseUrl),
      };
    } catch (error) {
      if (!canUseHosted) throw error;
    }
  } else if (!canUseHosted) {
    throw new Error(hostedOllamaWarning(ollamaBaseUrl));
  }

  if (canUseHosted) {
    return {
      provider: 'openai',
      content: await callOpenAI(messages, openaiModel, temperature),
    };
  }

  throw new Error(hostedOllamaWarning(ollamaBaseUrl));
}

async function callConfiguredModel(context, role, messages, options = {}) {
  const provider = context.config.provider || 'auto';
  const temperature = options.temperature ?? 0.4;
  const useCritic = role === 'critic';
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || context.config.ollama?.baseUrl || 'http://127.0.0.1:11434';
  const hostedLoopbackOllama = isRenderRuntime() && isLoopbackBaseUrl(ollamaBaseUrl);

  if (provider === 'auto') {
    return callAutoModel(context, role, messages, temperature);
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    const model = useCritic
      ? context.config.criticModel || context.config.model || 'gpt-4o-mini'
      : context.config.model || 'gpt-4o-mini';
    return {
      provider: 'openai',
      content: await callOpenAI(messages, model, temperature),
    };
  }

  if (provider === 'hybrid') {
    const routing = routeDecision(role, messages);
    const shouldUseHosted = process.env.OPENAI_API_KEY && routing.useHeavyModel;

    if (shouldUseHosted) {
      const model = useCritic
        ? context.config.criticModel || context.config.model || 'gpt-4o-mini'
        : context.config.model || 'gpt-4o-mini';
      logRoutingDecision({
        role,
        provider: 'hybrid-openai',
        model,
        ...routing,
      });
      return {
        provider: 'hybrid-openai',
        content: await callOpenAI(messages, model, temperature),
      };
    }

    if (hostedLoopbackOllama) {
      throw new Error(hostedOllamaWarning(ollamaBaseUrl));
    }

    const baseUrl = ollamaBaseUrl;
    const model = useCritic
      ? context.config.ollama?.criticModel || context.config.ollama?.model || 'llama3.1:8b'
      : context.config.ollama?.model || 'llama3.1:8b';
    logRoutingDecision({
      role,
      provider: 'hybrid-ollama',
      model,
      ...routing,
    });
    return {
      provider: 'hybrid-ollama',
      content: await callOllama(messages, model, temperature, baseUrl),
    };
  }

  if (provider === 'vllm' || provider === 'openai-compatible') {
    const baseURL = process.env.VLLM_BASE_URL || context.config.vllm?.baseUrl;
    if (!baseURL) throw new Error(`VLLM_BASE_URL is required for "${provider}" provider.`);
    const model = useCritic
      ? process.env.VLLM_CRITIC_MODEL || context.config.vllm?.criticModel || context.config.vllm?.model || 'Qwen/Qwen3-32B'
      : process.env.VLLM_MODEL || context.config.vllm?.model || 'Qwen/Qwen3-32B';
    return {
      provider,
      content: await callOpenAI(messages, model, temperature, {
        baseURL,
        apiKey: process.env.VLLM_API_KEY || context.config.vllm?.apiKey || 'not-needed',
      }),
    };
  }

  if (provider === 'auto' || provider === 'ollama') {
    if (hostedLoopbackOllama) {
      throw new Error(hostedOllamaWarning(ollamaBaseUrl));
    }

    const baseUrl = ollamaBaseUrl;
    const model = useCritic
      ? context.config.ollama?.criticModel || context.config.ollama?.model || 'llama3.1:8b'
      : context.config.ollama?.model || 'llama3.1:8b';
    return {
      provider: 'ollama',
      content: await callOllama(messages, model, temperature, baseUrl),
    };
  }

  throw new Error(`No model provider configured for "${provider}".`);
}

function localProcedureFallback(entry) {
  const subject = entry.message;
  const lower = subject.toLowerCase();
  const isMicroInvestor = lower.includes('micro investor') || lower.includes('micro-investor');

  if (isMicroInvestor) {
    return {
      mode: 'local-fallback',
      ceo: `Situation
Micro investing for Understudy should mean small, selective support for builders, tools, and tiny companies that already show taste, trust, and unusual conviction.

Recommendation
Treat it as a research-and-relationship practice before treating it as an asset class. Start with a watchlist, tiny checks only when legally and financially clean, and non-capital help where Understudy can add taste, product judgment, distribution, or operational clarity.

Why
The valuable pattern is early recognition. Understudy should learn to notice small loyal communities, odd but useful products, and builders whose work feels like a world before it feels like a market.

Next action
Create a Micro Investor Watchlist with columns for builder, product, community signal, why it matters, possible help, risk, and approval needed.`,
      scout: `New angle
The research edge is not just investing money. It is building a map of strange early conviction before the market packages it.

Why it matters
Understudy can compound learning by tracking tiny tools, local AI workflows, creator utilities, niche games, media communities, and one-person software businesses over time.

Experiment to run
Pick 10 builders or products and write one paragraph on each: what they are making, why people care, what feels unusually alive, and what Understudy could learn.`,
      critic: `Pass / Revise / Block
Pass

Strongest part
It keeps micro investing tied to learning, trust, and relationship rather than pretending Understudy is already a fund.

Weakest assumption
That small investments are the right first move rather than research, advising, or partnership.

Risk
Legal, tax, and relationship complexity can arrive fast once money changes hands.

Required approval
Spencer approval required before any investment, external outreach, or public positioning.`,
      synthesis: `What changed
Micro investing should become a disciplined watchlist and learning procedure first.

What the brain learned
Understudy is looking for early signs of durable attachment: strange conviction, small loyal communities, useful tools, and products with a world inside them.

Next action
Add a Micro Investor Watchlist artifact and begin with research before capital.`,
    };
  }

  return {
    mode: 'local-fallback',
    ceo: `Situation
Spencer submitted a ${entry.type} to the Understudy brain: "${subject}"

Recommendation
Treat this as an active CEO procedure, not an inbox note. Convert it into a clear decision, research path, or next action.

Why
The brain has to earn trust by answering in the State Log immediately, then improving through memory and review.

Next action
Clarify the smallest useful output for this request and record it in the procedure.`,
    scout: `New angle
This request should be checked against Understudy's core search pattern: trust, taste, utility, local/cloud AI infrastructure, strange builders, and durable operating models.

Experiment to run
Turn the request into one concrete research question and one concrete operating action.`,
    critic: `Pass / Revise / Block
Revise

Strongest part
The system is now treating Spencer's message as something to answer.

Weakest assumption
The local fallback is not as thoughtful as a real model-backed procedure.

Risk
Without an API key or local model adapter, responses remain structured but limited.

Required approval
No approval required for local logging. Approval required before external actions.`,
    synthesis: `What changed
The State Log now receives a CEO procedure immediately when Spencer submits a message.

What the brain learned
Conversation should be active, not queued.

Next action
Connect a model key or local model adapter so the procedure can reason more deeply.`,
  };
}

async function runBrainProcedure(entry) {
  if (!entry || !entry.message) return null;

  const context = buildProcedureContext();
  const contextBlock = JSON.stringify(
    {
      brief: context.brief,
      charter: context.charter,
      architecture: context.architecture,
      memory: context.memory,
      contextGraph: context.contextGraph,
      tasks: context.tasks,
      researchDirective: context.prompts.researchDirective,
      ceoResearch: context.prompts.ceoResearch,
    },
    null,
    2
  );

  let output;
  let mode = 'local-fallback';

  try {
    const temperature = Number.isFinite(context.config.temperature) ? context.config.temperature : 0.4;

    const ceoResult = await callConfiguredModel(
      context,
      'ceo',
      [
        { role: 'system', content: `${context.prompts.ceo}\n\n${context.prompts.ceoResearch}` },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: entry.message },
      ],
      { temperature }
    );
    const ceo = ceoResult.content;
    mode = ceoResult.provider;

    const scoutResult = await callConfiguredModel(
      context,
      'scout',
      [
        { role: 'system', content: `${context.prompts.scout}\n\n${context.prompts.researchDirective}` },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}\n\nCEO response:\n${ceo}` },
        { role: 'user', content: `Find new angles on this Spencer message: ${entry.message}` },
      ],
      { temperature: 0.5 }
    );
    const scout = scoutResult.content;

    const criticResult = await callConfiguredModel(
      context,
      'critic',
      [
        { role: 'system', content: context.prompts.critic },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: `Review CEO and Scout outputs.\n\nSpencer message:\n${entry.message}\n\nCEO:\n${ceo}\n\nScout:\n${scout}` },
      ],
      { temperature: 0.2 }
    );
    const critic = criticResult.content;

    const synthesisResult = await callConfiguredModel(
      context,
      'operator',
      [
        { role: 'system', content: context.prompts.operator },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: `Synthesize this procedure into state updates and next action.\n\nSpencer message:\n${entry.message}\n\nCEO:\n${ceo}\n\nScout:\n${scout}\n\nCritic:\n${critic}` },
      ],
      { temperature: 0.3 }
    );
    const synthesis = synthesisResult.content;
    output = { mode, ceo, scout, critic, synthesis };
  } catch (error) {
    output = localProcedureFallback(entry);
    output.mode = `local-fallback-after-model-error: ${error.message}`;
  }

  const statePath = path.join(STATE_DIR, 'scrolling-state.md');
  fs.appendFileSync(
    statePath,
    `\n## ${new Date().toISOString()}\n\n### Spencer ${entry.type}\n\n${entry.message}\n\n### CEO\n\n${output.ceo}\n\n### Scout\n\n${output.scout}\n\n### Critic\n\n${output.critic}\n\n### Synthesis\n\n${output.synthesis}\n`
  );

  if (!fs.existsSync(CONVERSATIONS_DIR)) fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  const transcript = {
    date: new Date().toISOString(),
    mode: output.mode || mode,
    type: entry.type,
    question: entry.message,
    ceo: output.ceo,
    scout: output.scout,
    critic: output.critic,
    synthesis: output.synthesis,
  };
  const outPath = path.join(CONVERSATIONS_DIR, `${slugTime()}-site-procedure.json`);
  transcript.scanner = runConstitutionalScanner({
    decision: output.ceo,
    context: entry.message,
    ceo: output.ceo,
    synthesis: output.synthesis,
  });
  const artifactResult = runCeoArtifacts(transcript);
  transcript.artifacts = artifactResult;
  writeJson(outPath, transcript);

  const conversationPath = path.relative(BRAIN_DIR, outPath);

  if (entry.type === 'memory') {
    await storeContextGraphNode({
      sourceType: 'memory_note',
      sourceId: entry.date,
      title: 'Memory note',
      content: entry.message,
      metadata: {
        inboxPath: entry.inboxPath ? path.relative(BRAIN_DIR, entry.inboxPath) : null,
        conversationPath,
      },
    });
  }

  await storeContextGraphNode({
    sourceType: 'procedure_synthesis',
    sourceId: transcript.date,
    title: `Procedure synthesis: ${entry.type}`,
    content: transcript.synthesis,
    metadata: {
      entryType: entry.type,
      question: entry.message.slice(0, 500),
      conversationPath,
      mode: transcript.mode,
    },
  });

  if (entry.inboxPath && fs.existsSync(entry.inboxPath)) {
    const saved = readJson(entry.inboxPath, entry);
    saved.status = 'processed';
    saved.processedAt = transcript.date;
    saved.conversationPath = conversationPath;
    writeJson(entry.inboxPath, saved);
  }

  return transcript;
}

async function processPendingBrainMessages() {
  if (!fs.existsSync(INBOX_DIR)) return [];
  const processed = [];
  const files = fs
    .readdirSync(INBOX_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();

  for (const file of files) {
    const inboxPath = path.join(INBOX_DIR, file);
    const entry = readJson(inboxPath, null);
    if (!entry || entry.status === 'processed') continue;
    entry.inboxPath = inboxPath;
    processed.push(await runBrainProcedure(entry));
  }

  const statePath = path.join(STATE_DIR, 'scrolling-state.md');
  const state = readText(statePath);
  if (state.includes('Saved to brain inbox. Awaiting CEO loop.')) {
    fs.writeFileSync(
      statePath,
      state.replace(/Saved to brain inbox\. Awaiting CEO loop\./g, 'Saved to brain inbox. Processed by CEO procedure below.')
    );
  }

  return processed;
}

module.exports = { buildBrainContext, saveBrainMessage, runBrainProcedure, processPendingBrainMessages };
