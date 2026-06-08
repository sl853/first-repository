const fs = require('fs');
const path = require('path');
const { searchWeb, summarizeResults } = require('./internet-scout');
const { runCeoArtifacts } = require('../lib/ceo-artifacts');
const { runConstitutionalScanner } = require('../lib/constitutional-scanner');
const { readLocalContextGraph, storeContextGraphNode } = require('../lib/context-graph');

const ROOT = __dirname;
const STATE_DIR = path.join(ROOT, 'state');
const REPORTS_DIR = path.join(ROOT, 'reports');
const CONVERSATIONS_DIR = path.join(ROOT, 'conversations');
const DECISIONS_DIR = path.join(ROOT, 'decisions');
const MEMORY_PATH = path.join(STATE_DIR, 'memory.json');
const TASKS_PATH = path.join(STATE_DIR, 'tasks.json');
const SCROLLING_STATE_PATH = path.join(STATE_DIR, 'scrolling-state.md');
const BRIEF_PATH = path.join(__dirname, '..', 'docs', 'understudy-brief.md');
const CHARTER_PATH = path.join(ROOT, 'charter.md');
const ARCHITECTURE_PATH = path.join(ROOT, 'architecture.md');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const PROMPTS_DIR = path.join(ROOT, 'prompts');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function printHelp() {
  console.log(`Understudy Brain

Commands:
  brief                         Print the company brief
  tasks                         List open tasks
  remember <note>               Add a memory note
  add-task <title> [flags]      Add a task
    --owner ceo|critic|researcher|operator
    --risk low|medium|high
    --approval true|false
  daily                         Write today's daily brief
  ask <question>                 Ask the AI CEO, then run critic review
  loop <question>                Run CEO -> Scout -> Critic -> Synthesis
  research <query>               Let the Scout search the web and write a report
`);
}

function parseFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function commandBrief() {
  console.log(fs.readFileSync(BRIEF_PATH, 'utf8'));
}

function commandTasks() {
  const tasks = readJson(TASKS_PATH, []);
  const open = tasks.filter((task) => task.status !== 'done');
  if (!open.length) {
    console.log('No open tasks.');
    return;
  }
  for (const task of open) {
    const approval = task.requiresApproval ? 'approval required' : 'no approval needed';
    console.log(`#${task.id} [${task.owner}/${task.risk}] ${task.title} (${approval})`);
  }
}

async function commandRemember(note) {
  if (!note) {
    console.error('Usage: npm run brain -- remember "note"');
    process.exit(1);
  }
  const memory = readJson(MEMORY_PATH, { notes: [] });
  memory.notes = memory.notes || [];
  memory.notes.push({ date: today(), note });
  writeJson(MEMORY_PATH, memory);

  await storeContextGraphNode({
    sourceType: 'memory_note',
    sourceId: `${today()}:${memory.notes.length}`,
    title: 'CLI memory note',
    content: note,
    metadata: {
      command: 'remember',
      memoryPath: path.relative(path.join(__dirname, '..'), MEMORY_PATH),
    },
  });

  console.log('Remembered.');
}

function commandAddTask(title) {
  if (!title) {
    console.error('Usage: npm run brain -- add-task "task title"');
    process.exit(1);
  }
  const tasks = readJson(TASKS_PATH, []);
  const maxId = tasks.reduce((max, task) => Math.max(max, task.id || 0), 0);
  const task = {
    id: maxId + 1,
    title,
    owner: parseFlag('owner', 'operator'),
    risk: parseFlag('risk', 'low'),
    status: 'open',
    requiresApproval: parseFlag('approval', 'false') === 'true',
    createdAt: today(),
  };
  tasks.push(task);
  writeJson(TASKS_PATH, tasks);
  console.log(`Added task #${task.id}.`);
}

function commandDaily() {
  const memory = readJson(MEMORY_PATH, { company: {}, principles: [], notes: [] });
  const tasks = readJson(TASKS_PATH, []);
  const open = tasks.filter((task) => task.status !== 'done');
  const needsApproval = open.filter((task) => task.requiresApproval);
  const topTask = open[0];
  const report = `# Daily Brief - ${today()}

## Company Posture

${memory.company.name || 'Understudy'} remains ${memory.company.position || 'a private parent company'}.

## Current Principles

${(memory.principles || []).map((item) => `- ${item}`).join('\n')}

## Open Tasks

${open.length ? open.map((task) => `- #${task.id} [${task.owner}/${task.risk}] ${task.title}`).join('\n') : '- No open tasks.'}

## Needs Spencer

${needsApproval.length ? needsApproval.map((task) => `- #${task.id} ${task.title}`).join('\n') : '- Nothing requires approval right now.'}

## Recommended Next Action

${topTask ? `Do task #${topTask.id}: ${topTask.title}` : 'Add the next real task.'}

## Recent Memory

${(memory.notes || []).slice(-5).map((entry) => `- ${entry.date}: ${entry.note}`).join('\n') || '- No new notes.'}
`;

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, `${today()}-daily-brief.md`);
  fs.writeFileSync(outPath, report);
  console.log(report);
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)}`);
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function buildBrainContext() {
  const memory = readJson(MEMORY_PATH, {});
  const tasks = readJson(TASKS_PATH, []);
  const config = readJson(CONFIG_PATH, {});
  const prompts = {
    ceo: readText(path.join(PROMPTS_DIR, 'ceo.md')),
    critic: readText(path.join(PROMPTS_DIR, 'critic.md')),
    researcher: readText(path.join(PROMPTS_DIR, 'researcher.md')),
    scout: readText(path.join(PROMPTS_DIR, 'scout.md')),
    operator: readText(path.join(PROMPTS_DIR, 'operator.md')),
  };

  return {
    config,
    brief: readText(BRIEF_PATH),
    charter: readText(CHARTER_PATH),
    architecture: readText(ARCHITECTURE_PATH),
    scrollingState: readText(SCROLLING_STATE_PATH),
    prompts,
    memory,
    contextGraph: readLocalContextGraph(20),
    tasks,
  };
}

function localLoopFallback(question, context) {
  const ceo = `Situation
Understudy wants a company brain that feels like an ongoing conversation, not a static chatbot.

Recommendation
Build the loop as CEO -> Scout -> Critic -> Synthesis, with a scrolling state log. Treat GAN as the metaphor: productive tension between roles, not literal adversarial model training.

Next action
Use the loop daily and let the state log become the first training corpus.`;

  const scout = `New angle
The strongest learning mechanism at this stage is not weight training; it is disciplined accumulation of high-quality internal traces.

Why it matters
If every conversation produces structured state, decisions, rejected paths, and research questions, Understudy starts building proprietary context.

Experiment to run
For seven days, ask one strategic question daily and save CEO / Scout / Critic / Synthesis output. Review the state log at the end of the week.`;

  const critic = `Pass / Revise / Block
Pass

Strongest part
It preserves Spencer's desire for a living, searching mind while avoiding premature ML infrastructure.

Weakest assumption
That disciplined state accumulation will actually happen daily.

Risk
Without a daily habit, the brain remains a folder instead of a mind.

Required approval
No approval required for local state logging.`;

  const synthesis = `What changed
The project should be described as a GAN-inspired dialogue loop, not a GAN.

What the brain learned
The first form of learning is structured memory and research accumulation.

Next action
Run this loop daily and append every result to scrolling state.`;

  return { ceo, scout, critic, synthesis };
}

function localFallbackAnswer(question, context) {
  const openTasks = (context.tasks || []).filter((task) => task.status !== 'done');
  const topTask = openTasks[0];
  return `Situation
Understudy has a website foundation and the first local brain scaffold. The company posture is: ${context.memory.company?.position || 'private parent company'}.

Recommendation
Build the first working AI CEO loop before adding external tool access.

Why
The highest leverage move is to make the brain useful in conversation: memory, task state, CEO recommendation, critic review, and approval boundaries. Tool access should come after the judgment loop is coherent.

Risks
The main risk is overbuilding infrastructure before the operating doctrine is stable.

What I can do without Spencer
- Keep writing prompts and local scaffolding
- Add conversation persistence
- Add decision records
- Add an Ollama/local-model adapter
- Draft approval workflows

What requires Spencer
- API keys
- GPU/RunPod account
- Gmail/GitHub/Stripe/domain access
- Permission to send or deploy anything externally

Next action
${topTask ? `Do task #${topTask.id}: ${topTask.title}` : 'Add one concrete task for the AI CEO prototype.'}

Question received
${question}`;
}

async function callOpenAI(messages, model, temperature) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    temperature,
    messages,
  });
  return response.choices[0]?.message?.content || '';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function slugTime() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function commandAsk(question) {
  if (!question) {
    console.error('Usage: npm run brain -- ask "question"');
    process.exit(1);
  }

  const context = buildBrainContext();
  const model = context.config.model || 'gpt-4o-mini';
  const criticModel = context.config.criticModel || model;
  const temperature = Number.isFinite(context.config.temperature) ? context.config.temperature : 0.4;
  const contextBlock = JSON.stringify(
    {
      brief: context.brief,
      charter: context.charter,
      memory: context.memory,
      contextGraph: context.contextGraph,
      tasks: context.tasks,
    },
    null,
    2
  );

  let ceoAnswer;
  let criticReview;
  let mode = 'local-fallback';

  if (process.env.OPENAI_API_KEY) {
    mode = 'openai';
    ceoAnswer = await callOpenAI(
      [
        { role: 'system', content: context.prompts.ceo },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: question },
      ],
      model,
      temperature
    );
    criticReview = await callOpenAI(
      [
        { role: 'system', content: context.prompts.critic },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: `Review this CEO answer for Understudy:\n\n${ceoAnswer}` },
      ],
      criticModel,
      0.2
    );
  } else {
    ceoAnswer = localFallbackAnswer(question, context);
    criticReview = `Pass / Revise / Block
Revise

Strongest part
The recommendation correctly prioritizes the judgment loop before external tool access.

Weakest assumption
It assumes the next step should remain local rather than immediately wiring a hosted model.

Risk
The prototype could become a notes app unless the ask/critic loop is used daily.

Required approval
No external approval required for local scaffolding. Spencer approval required before API keys, account connections, spending, or deployments.

Suggested revision
Add the real model adapter next, then add decision records and explicit approval gates.`;
  }

  const transcript = {
    date: new Date().toISOString(),
    mode,
    question,
    ceoAnswer,
    criticReview,
  };

  ensureDir(CONVERSATIONS_DIR);
  const outPath = path.join(CONVERSATIONS_DIR, `${slugTime()}-ask.json`);
  writeJson(outPath, transcript);

  console.log(`# CEO Answer\n\n${ceoAnswer}\n\n# Critic Review\n\n${criticReview}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
}

async function commandLoop(question) {
  if (!question) {
    console.error('Usage: npm run brain -- loop "question"');
    process.exit(1);
  }

  const context = buildBrainContext();
  const contextBlock = JSON.stringify(
    {
      brief: context.brief,
      charter: context.charter,
      architecture: context.architecture,
      scrollingState: context.scrollingState,
      memory: context.memory,
      contextGraph: context.contextGraph,
      tasks: context.tasks,
    },
    null,
    2
  );

  let output;
  let mode = 'local-fallback';

  if (process.env.OPENAI_API_KEY) {
    mode = 'openai';
    const model = context.config.model || 'gpt-4o-mini';
    const criticModel = context.config.criticModel || model;
    const temperature = Number.isFinite(context.config.temperature) ? context.config.temperature : 0.4;

    const ceo = await callOpenAI(
      [
        { role: 'system', content: context.prompts.ceo },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: question },
      ],
      model,
      temperature
    );
    const scout = await callOpenAI(
      [
        { role: 'system', content: context.prompts.scout },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}\n\nCEO response:\n${ceo}` },
        { role: 'user', content: `Find new angles on this question: ${question}` },
      ],
      model,
      0.5
    );
    const critic = await callOpenAI(
      [
        { role: 'system', content: context.prompts.critic },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: `Review CEO and Scout outputs.\n\nQuestion:\n${question}\n\nCEO:\n${ceo}\n\nScout:\n${scout}` },
      ],
      criticModel,
      0.2
    );
    const synthesis = await callOpenAI(
      [
        { role: 'system', content: context.prompts.operator },
        { role: 'system', content: `Understudy operating context:\n${contextBlock}` },
        { role: 'user', content: `Synthesize this loop into state updates and next action.\n\nQuestion:\n${question}\n\nCEO:\n${ceo}\n\nScout:\n${scout}\n\nCritic:\n${critic}` },
      ],
      model,
      0.3
    );
    output = { ceo, scout, critic, synthesis };
  } else {
    output = localLoopFallback(question, context);
  }

  const entry = `\n## ${new Date().toISOString()}\n\n### Question\n\n${question}\n\n### CEO\n\n${output.ceo}\n\n### Scout\n\n${output.scout}\n\n### Critic\n\n${output.critic}\n\n### Synthesis\n\n${output.synthesis}\n`;
  fs.appendFileSync(SCROLLING_STATE_PATH, entry);

  const transcript = {
    date: new Date().toISOString(),
    mode,
    question,
    type: 'loop',
    ...output,
  };
  transcript.scanner = runConstitutionalScanner({
    decision: output.ceo,
    context: question,
    ceo: output.ceo,
    synthesis: output.synthesis,
  });
  transcript.artifacts = runCeoArtifacts(transcript);
  ensureDir(CONVERSATIONS_DIR);
  const outPath = path.join(CONVERSATIONS_DIR, `${slugTime()}-loop.json`);
  writeJson(outPath, transcript);

  await storeContextGraphNode({
    sourceType: 'loop_synthesis',
    sourceId: transcript.date,
    title: 'CLI loop synthesis',
    content: transcript.synthesis,
    metadata: {
      question: question.slice(0, 500),
      conversationPath: path.relative(path.join(__dirname, '..'), outPath),
      mode,
    },
  });

  console.log(`# CEO\n\n${output.ceo}\n\n# Scout\n\n${output.scout}\n\n# Critic\n\n${output.critic}\n\n# Synthesis\n\n${output.synthesis}\n`);
  console.log(`Appended ${path.relative(process.cwd(), SCROLLING_STATE_PATH)}`);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
}

async function commandResearch(query) {
  if (!query) {
    console.error('Usage: npm run brain -- research "query"');
    process.exit(1);
  }

  const results = await searchWeb(query);
  const report = `# Scout Research - ${today()}

${summarizeResults(query, results)}
`;

  ensureDir(REPORTS_DIR);
  const reportPath = path.join(REPORTS_DIR, `${today()}-scout-research.md`);
  fs.writeFileSync(reportPath, report);

  const stateEntry = `\n## ${new Date().toISOString()}\n\n### Scout Research Query\n\n${query}\n\n### Captured Leads\n\n${results
    .slice(0, 5)
    .map((result) => `- [${result.title}](${result.url}) — ${result.snippet}`)
    .join('\n') || '- No leads captured.'}\n\n### Scout Rule\n\nThese are leads for learning, not automatic decisions. CEO/Critic review is required before changing company direction.\n`;
  fs.appendFileSync(SCROLLING_STATE_PATH, stateEntry);

  const transcript = {
    date: new Date().toISOString(),
    mode: 'internet-scout',
    query,
    results,
    report: path.relative(process.cwd(), reportPath),
  };
  ensureDir(CONVERSATIONS_DIR);
  const outPath = path.join(CONVERSATIONS_DIR, `${slugTime()}-research.json`);
  writeJson(outPath, transcript);

  await storeContextGraphNode({
    sourceType: 'research_report',
    sourceId: transcript.date,
    title: `Scout research: ${query}`,
    content: report,
    metadata: {
      query,
      reportPath: path.relative(path.join(__dirname, '..'), reportPath),
      conversationPath: path.relative(path.join(__dirname, '..'), outPath),
    },
  });

  console.log(report);
  console.log(`Wrote ${path.relative(process.cwd(), reportPath)}`);
  console.log(`Appended ${path.relative(process.cwd(), SCROLLING_STATE_PATH)}`);
}

const command = process.argv[2] || 'help';
const value = process.argv.slice(3).reduce((parts, arg) => {
  if (arg.startsWith('--')) parts.stop = true;
  if (!parts.stop) parts.values.push(arg);
  return parts;
}, { stop: false, values: [] }).values.join(' ');

switch (command) {
  case 'brief':
    commandBrief();
    break;
  case 'tasks':
    commandTasks();
    break;
  case 'remember':
    commandRemember(value).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
    break;
  case 'add-task':
    commandAddTask(value);
    break;
  case 'daily':
    commandDaily();
    break;
  case 'ask':
    commandAsk(value).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
    break;
  case 'loop':
    commandLoop(value).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
    break;
  case 'research':
    commandResearch(value).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
    break;
  case 'help':
  default:
    printHelp();
}
