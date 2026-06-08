const fs = require('fs');
const path = require('path');
const { listReports } = require('./report-context');
const { runCeoArtifacts } = require('./ceo-artifacts');
const { runConstitutionalScanner } = require('./constitutional-scanner');
const { readLocalContextGraph, storeContextGraphNode } = require('./context-graph');
const { logRoutingDecision, routeDecision } = require('./model-routing');
const { runWebResearch } = require('./search');

function renderMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

const BRAIN_DIR = path.join(__dirname, '..', 'brain');
const STATE_DIR = path.join(BRAIN_DIR, 'state');
const CONVERSATIONS_DIR = path.join(BRAIN_DIR, 'conversations');
const INBOX_DIR = path.join(BRAIN_DIR, 'inbox');
const DREAMS_DIR = path.join(BRAIN_DIR, 'dreams');
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

function openaiEnabled() {
  return process.env.DISABLE_OPENAI !== 'true' && Boolean(process.env.OPENAI_API_KEY);
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
  const latestProcedure = conversations[0] || null;

  return {
    memory,
    tasks,
    contextGraph,
    modelStatus: buildModelStatus(config),
    scrollingState,
    conversations,
    latestProcedure,
    procedureStatus: buildProcedureStatus(latestProcedure),
    reports,
    latestReport: reports[0] || null,
    renderMarkdown,
    runCadence: {
      current: 'On demand: every saved message runs the CEO procedure immediately.',
      recommended: 'Daily: one standing CEO procedure each morning, plus ad hoc procedures whenever Spencer asks.',
      hosted: 'Later: schedule a daily job after model access and approval gates are configured.',
    },
  };
}

function buildProcedureStatus(latestProcedure) {
  if (!latestProcedure || !latestProcedure.data) {
    return {
      label: 'Waiting for first question',
      tone: 'neutral',
      detail: 'Ask one direct question and the answer will appear here.',
      nextStep: 'Use Ask for normal questions, Remember for durable notes, and Research for scout directions.',
    };
  }

  const mode = String(latestProcedure.data.mode || '').toLowerCase();

  if (mode.includes('429') || mode.includes('quota') || mode.includes('billing')) {
    return {
      label: 'Connected, but blocked by API quota',
      tone: 'warn',
      detail: 'The brain reached the hosted model, but the API account hit a quota or billing limit, so this run fell back.',
      nextStep: 'Fix billing or replace the API key, then ask the full question again.',
    };
  }

  if (mode.includes('local-fallback-after-model-error')) {
    return {
      label: 'Fallback response',
      tone: 'warn',
      detail: 'The procedure ran, but the model path failed and the page showed the local backup structure instead.',
      nextStep: 'Check model connection, then rerun the question in full.',
    };
  }

  if (mode.includes('local-fallback')) {
    return {
      label: 'Local backup mode',
      tone: 'neutral',
      detail: 'The page is working, but the answer came from the local fallback path rather than a live model.',
      nextStep: 'Connect a working model backend for fuller responses.',
    };
  }

  return {
    label: 'Answered normally',
    tone: 'good',
    detail: 'The last procedure used the connected model path and completed normally.',
    nextStep: 'Keep asking full questions in one message so the procedure has clean context.',
  };
}

function buildModelStatus(config) {
  const provider = config.provider || 'auto';
  const openaiReady = openaiEnabled();
  const openaiDisabled = process.env.DISABLE_OPENAI === 'true';
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || config.ollama?.baseUrl || 'http://127.0.0.1:11434';
  const ollamaModel = config.ollama?.model || 'llama3.1:8b';
  const vllmBaseUrl = process.env.VLLM_BASE_URL || config.vllm?.baseUrl || '';
  const vllmModel = process.env.VLLM_MODEL || config.vllm?.model || 'Qwen/Qwen3-32B';
  const hostedLoopbackOllama = isRenderRuntime() && isLoopbackBaseUrl(ollamaBaseUrl);

  let active = 'local fallback';
  let detail = 'No hosted key or local adapter is active yet.';

  if (openaiDisabled) {
    active = 'OpenAI disabled';
    detail = `will try Ollama ${ollamaModel} at ${ollamaBaseUrl}, then fallback`;
  } else if ((provider === 'auto' || provider === 'openai') && openaiReady) {
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

function buildDreamingCandidate(transcript) {
  return {
    date: transcript.date,
    type: 'dreaming_candidate',
    question: transcript.question,
    title: `Dreaming candidate: ${transcript.type}`,
    content: [
      transcript.question ? `Question: ${transcript.question}` : null,
      transcript.synthesis ? `Synthesis: ${transcript.synthesis}` : null,
      transcript.critic ? `Risk review: ${transcript.critic}` : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

function saveDreamingCandidate(note) {
  if (!note || !note.date || !note.content) return null;
  if (!fs.existsSync(DREAMS_DIR)) fs.mkdirSync(DREAMS_DIR, { recursive: true });
  const outPath = path.join(DREAMS_DIR, `${slugTime()}-dreaming-note.json`);
  writeJson(outPath, note);
  return path.relative(BRAIN_DIR, outPath);
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
  const canUseHosted = openaiEnabled();
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

  if (provider === 'openai' && openaiEnabled()) {
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
    const shouldUseHosted = openaiEnabled() && routing.useHeavyModel;

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
  let webResearch = null;

  try {
    const temperature = Number.isFinite(context.config.temperature) ? context.config.temperature : 0.4;

    // ── Step 0: Web research (runs in parallel with nothing — first in chain) ──
    webResearch = await runWebResearch(entry.message);

    // Save research as a first-class artifact so it accumulates over time
    if (webResearch) {
      const researchDir = path.join(BRAIN_DIR, 'research');
      if (!fs.existsSync(researchDir)) fs.mkdirSync(researchDir, { recursive: true });
      writeJson(path.join(researchDir, `${slugTime()}-research.json`), {
        date: new Date().toISOString(),
        question: entry.message,
        queries: webResearch.queries,
        sources: webResearch.sources,
        summary: webResearch.summary,
      });
    }

    const webContext = webResearch
      ? `\n\nLive web research for this question:\n${webResearch.summary}`
      : '';

    // ── Step 1: CEO (first pass) ──────────────────────────────────────────────
    const ceoResult = await callConfiguredModel(
      context,
      'ceo',
      [
        { role: 'system', content: `${context.prompts.ceo}\n\n${context.prompts.ceoResearch}` },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}${webContext}` },
        { role: 'user', content: entry.message },
      ],
      { temperature }
    );
    const ceoFirst = ceoResult.content;
    mode = ceoResult.provider;

    // ── Step 2: Scout (gets web research + CEO first pass) ────────────────────
    const scoutResult = await callConfiguredModel(
      context,
      'scout',
      [
        { role: 'system', content: `${context.prompts.scout}\n\n${context.prompts.researchDirective}` },
        {
          role: 'system',
          content: `Understudy operating context:\n${contextBlock}\n\nCEO first pass:\n${ceoFirst}${webContext}`,
        },
        { role: 'user', content: `Find new angles on this Spencer message: ${entry.message}` },
      ],
      { temperature: 0.5 }
    );
    const scout = scoutResult.content;

    // ── Step 3: Critic ────────────────────────────────────────────────────────
    const criticResult = await callConfiguredModel(
      context,
      'critic',
      [
        { role: 'system', content: context.prompts.critic },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        {
          role: 'user',
          content: `Review CEO and Scout outputs.\n\nSpencer message:\n${entry.message}\n\nCEO:\n${ceoFirst}\n\nScout:\n${scout}`,
        },
      ],
      { temperature: 0.2 }
    );
    const critic = criticResult.content;

    // ── Step 4: CEO revision (reads Critic, revises if warranted) ─────────────
    const ceoReviseResult = await callConfiguredModel(
      context,
      'ceo',
      [
        { role: 'system', content: `${context.prompts.ceo}\n\n${context.prompts.ceoResearch}` },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}${webContext}` },
        {
          role: 'user',
          content: `You wrote the following answer to Spencer's question. The Critic has reviewed it and the Scout found new angles. Revise your answer only where the Critic identified genuine weaknesses or the Scout found something that materially changes the picture. If the original answer was already strong, keep it — just tighten the prose.\n\nSpencer's question:\n${entry.message}\n\nYour original answer:\n${ceoFirst}\n\nScout angles:\n${scout}\n\nCritic review:\n${critic}`,
        },
      ],
      { temperature }
    );
    const ceo = ceoReviseResult.content;

    // ── Step 5: Synthesis ─────────────────────────────────────────────────────
    const synthesisResult = await callConfiguredModel(
      context,
      'operator',
      [
        { role: 'system', content: context.prompts.operator },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        {
          role: 'user',
          content: `Synthesize this procedure into state updates and next action.\n\nSpencer message:\n${entry.message}\n\nCEO (final):\n${ceo}\n\nScout:\n${scout}\n\nCritic:\n${critic}`,
        },
      ],
      { temperature: 0.3 }
    );
    const synthesis = synthesisResult.content;

    output = {
      mode,
      ceo,
      ceoFirst,
      scout,
      critic,
      synthesis,
      webResearchSummary: webResearch?.summary || null,
      webSources: webResearch?.sources || [],
    };
  } catch (error) {
    output = localProcedureFallback(entry);
    output.mode = `local-fallback-after-model-error: ${error.message}`;
    output.webResearchSummary = webResearch?.summary || null;
    output.webSources = webResearch?.sources || [];
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
    ceoFirst: output.ceoFirst || null,
    scout: output.scout,
    critic: output.critic,
    synthesis: output.synthesis,
    webResearchSummary: output.webResearchSummary || null,
    webSources: output.webSources || [],
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
  transcript.dreaming = saveDreamingCandidate(buildDreamingCandidate(transcript));
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

  if (transcript.webResearchSummary) {
    await storeContextGraphNode({
      sourceType: 'live_research_pack',
      sourceId: `${transcript.date}:research`,
      title: `Live Scout research: ${entry.type}`,
      content: transcript.webResearchSummary,
      metadata: {
        question: entry.message.slice(0, 500),
        conversationPath,
        sourceCount: transcript.webSources.length,
      },
    });
  }

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
