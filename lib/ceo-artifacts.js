const fs = require('fs');
const path = require('path');

const BRAIN_DIR = path.join(__dirname, '..', 'brain');
const ARTIFACTS_DIR = path.join(BRAIN_DIR, 'artifacts');
const REPORTS_DIR = path.join(BRAIN_DIR, 'reports');
const STATE_DIR = path.join(BRAIN_DIR, 'state');
const TASKS_PATH = path.join(STATE_DIR, 'tasks.json');

function ok(data) {
  return { ok: true, data };
}

function err(reason, details = {}) {
  return { ok: false, reason, details };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function slugTime(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/[#*_`>[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirstSentence(text, fallback) {
  const clean = stripMarkdown(text);
  const match = clean.match(/^(.{20,180}?[.!?])(\s|$)/);
  return (match ? match[1] : clean.slice(0, 160)) || fallback;
}

function nextDayNumber() {
  const files = fs.existsSync(REPORTS_DIR) ? fs.readdirSync(REPORTS_DIR) : [];
  const highest = files.reduce((max, file) => {
    const match = file.match(/day-(\d+)-summary/i) || file.match(/Day (\d+) Summary/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return highest + 1;
}

function saveOwnerEmailDraft(transcript, dayNumber) {
  const headline = extractFirstSentence(transcript.synthesis, 'Understudy brain update.');
  const next = extractFirstSentence(transcript.synthesis.split(/next action/i).pop(), headline);
  const subject = `Day ${dayNumber}: ${headline.replace(/\.$/, '')}`.slice(0, 120);
  const body = [
    `**CEO procedure** - ${headline}`,
    '',
    `Current status: ${extractFirstSentence(transcript.critic || transcript.ceo, 'The brain produced a reviewed operating update.')}`,
    '',
    `Tomorrow: ${next.replace(/\.$/, '')}.`,
  ].join('\n');

  if (!subject.trim()) return err('subject_missing');
  if (!body.trim()) return err('body_missing');
  if (!body.includes('Tomorrow:')) return err('tomorrow_missing');
  if (wordCount(body) > 200) return err('body_too_long', { words: wordCount(body) });

  const filePath = path.join(ARTIFACTS_DIR, `${slugTime(new Date(transcript.date))}-owner-email.md`);
  ensureDir(ARTIFACTS_DIR);
  fs.writeFileSync(filePath, `Subject: ${subject}\n\n${body}\n`);
  return ok({ subject, body, path: path.relative(BRAIN_DIR, filePath) });
}

function saveInboxMessage(transcript) {
  const body = extractFirstSentence(transcript.synthesis, 'CEO procedure complete. Next action recorded.');
  if (!body) return err('body_missing');
  if (wordCount(body) > 80) return err('token_count_exceeded', { tokens: wordCount(body) });
  if (body.length > 400) return err('char_count_exceeded', { chars: body.length });

  const filePath = path.join(ARTIFACTS_DIR, `${slugTime(new Date(transcript.date))}-inbox-message.txt`);
  ensureDir(ARTIFACTS_DIR);
  fs.writeFileSync(filePath, `${body}\n`);
  return ok({ body, path: path.relative(BRAIN_DIR, filePath) });
}

function saveCeoReport(transcript, dayNumber) {
  const name = `Day ${dayNumber} Summary`;
  const sections = {
    what_i_did: extractFirstSentence(transcript.ceo, 'Ran the CEO procedure and produced a recommendation.'),
    key_findings: extractFirstSentence(transcript.scout, 'Scout reviewed the message for new angles.'),
    system_health: transcript.mode ? `Procedure completed with mode: ${transcript.mode}.` : 'Procedure completed.',
    owner_requests: transcript.type === 'request' ? extractFirstSentence(transcript.question, 'Owner request processed.') : 'None today.',
    plan_for_tomorrow: extractFirstSentence(transcript.synthesis, 'Continue the highest-leverage next action.'),
  };

  const missing = Object.entries(sections).filter(([, value]) => !String(value || '').trim());
  if (missing.length) return err('invalid_sections', { missing: missing.map(([key]) => key) });
  if (!/^Day \d+ Summary$/.test(name)) return err('report_name_invalid', { name });
  if (!sections.plan_for_tomorrow.trim()) return err('missing_plan');

  const report = `# ${name}

## What I Did

${sections.what_i_did}

## Key Findings

${sections.key_findings}

## System Health

${sections.system_health}

## Owner Requests

${sections.owner_requests}

## Plan For Tomorrow

${sections.plan_for_tomorrow}
`;

  ensureDir(REPORTS_DIR);
  const filePath = path.join(REPORTS_DIR, `${new Date(transcript.date).toISOString().slice(0, 10)}-day-${dayNumber}-summary.md`);
  fs.writeFileSync(filePath, report);
  return ok({ name, sections, path: path.relative(BRAIN_DIR, filePath) });
}

function similarity(a, b) {
  const left = new Set(String(a || '').toLowerCase().match(/[a-z0-9]+/g) || []);
  const right = new Set(String(b || '').toLowerCase().match(/[a-z0-9]+/g) || []);
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / Math.max(left.size, right.size);
}

function proposeTasks(transcript) {
  const tasks = readJson(TASKS_PATH, []);
  const open = tasks.filter((task) => task.status !== 'done');
  const needed = Math.max(0, 3 - open.length);
  if (!needed) return ok({ created: [], skipped: 'queue_already_has_3_tasks' });

  const candidates = [
    {
      title: 'Review latest CEO procedure output',
      description: extractFirstSentence(transcript.synthesis, 'Review latest CEO procedure output and convert it into one concrete next action.'),
      owner: 'operator',
      risk: 'low',
      tag: 'data',
      complexity: 2,
      task_type: 'reporting',
      estimated_hours: 1,
      reasoning: 'Keep the operating loop grounded in reviewed output.',
    },
    {
      title: 'Improve Understudy memory retrieval',
      description: 'Review recent context graph notes and identify one memory retrieval improvement for the next brain run.',
      owner: 'operator',
      risk: 'low',
      tag: 'engineering',
      complexity: 3,
      task_type: 'feature',
      estimated_hours: 2,
      reasoning: 'Memory quality is the highest-leverage compounding layer.',
    },
    {
      title: 'Draft next owner briefing',
      description: 'Draft a short owner briefing from the latest CEO report and open task queue.',
      owner: 'ceo',
      risk: 'low',
      tag: 'growth',
      complexity: 2,
      task_type: 'reporting',
      estimated_hours: 1,
      reasoning: 'The owner should see concise progress without extra prompting.',
    },
  ];

  const created = [];
  let maxId = tasks.reduce((max, task) => Math.max(max, task.id || 0), 0);

  for (const candidate of candidates) {
    if (created.length >= needed) break;
    const duplicate = tasks.find((task) => similarity(candidate.description, task.description || task.title) >= 0.85);
    if (duplicate) continue;
    if (!['engineering', 'research', 'growth', 'browser', 'support', 'data', 'meta_ads'].includes(candidate.tag)) {
      return err('invalid_tag', { title: candidate.title, tag: candidate.tag });
    }
    if (candidate.complexity < 1 || candidate.complexity > 10) {
      return err('invalid_complexity', { title: candidate.title, complexity: candidate.complexity });
    }
    if (candidate.estimated_hours > 4) {
      return err('invalid_estimated_hours', { title: candidate.title, estimated_hours: candidate.estimated_hours });
    }

    const task = {
      id: ++maxId,
      title: candidate.title,
      description: candidate.description,
      owner: candidate.owner,
      risk: candidate.risk,
      status: 'open',
      requiresApproval: false,
      createdAt: new Date(transcript.date).toISOString().slice(0, 10),
      tag: candidate.tag,
      complexity: candidate.complexity,
      task_type: candidate.task_type,
      estimated_hours: candidate.estimated_hours,
      reasoning: candidate.reasoning,
    };
    tasks.push(task);
    created.push(task);
  }

  writeJson(TASKS_PATH, tasks);
  return ok({ created });
}

function runCeoArtifacts(transcript) {
  if (!transcript || !transcript.date) return err('missing_transcript');
  const dayNumber = nextDayNumber();
  const results = {
    send_owner_email: saveOwnerEmailDraft(transcript, dayNumber),
    post_inbox_message: saveInboxMessage(transcript),
    save_ceo_report: saveCeoReport(transcript, dayNumber),
    propose_tasks: proposeTasks(transcript),
  };

  const indexPath = path.join(ARTIFACTS_DIR, `${slugTime(new Date(transcript.date))}-artifact-results.json`);
  writeJson(indexPath, {
    date: transcript.date,
    dayNumber,
    results,
  });

  return ok({ dayNumber, results, path: path.relative(BRAIN_DIR, indexPath) });
}

module.exports = { runCeoArtifacts };
