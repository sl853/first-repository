const fs = require('fs');
const path = require('path');

const ROUTING_LOG_PATH = path.join(__dirname, '..', 'brain', 'state', 'routing-decisions.json');

const STRATEGIC_SIGNALS = [
  'strategy',
  'strategic',
  'vision',
  'pivot',
  'business model',
  'pricing',
  'positioning',
  'partnership',
  'investment',
  'legal',
  'compliance',
  'contract',
  'financial',
  'public announcement',
  'external message',
  'customer email',
  'production',
  'security',
  'delete',
  'spend',
  'payment',
  'refund',
];

const ROUTINE_SIGNALS = [
  'summarize',
  'draft',
  'organize',
  'format',
  'classify',
  'tag',
  'list',
  'status',
  'brief',
  'memory note',
  'local',
];

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function messagesText(messages) {
  return messages.map((message) => message.content || '').join('\n').toLowerCase();
}

function routeDecision(role, messages) {
  const text = messagesText(messages);
  const strategicHits = STRATEGIC_SIGNALS.filter((signal) => text.includes(signal));
  const routineHits = ROUTINE_SIGNALS.filter((signal) => text.includes(signal));
  const longContext = text.length > 8000;
  const isCritic = role === 'critic';

  let decisionType = 'routine';
  if (isCritic) decisionType = 'validation';
  if (strategicHits.length || longContext) decisionType = 'strategic';

  let confidence = 0.86;
  confidence -= Math.min(strategicHits.length * 0.08, 0.32);
  confidence -= longContext ? 0.18 : 0;
  confidence -= isCritic ? 0.1 : 0;
  confidence += Math.min(routineHits.length * 0.03, 0.09);
  confidence = Math.max(0.35, Math.min(0.95, Number(confidence.toFixed(2))));

  const useHeavyModel = decisionType === 'strategic' || confidence < 0.75;
  const reason = useHeavyModel
    ? 'strategic_or_low_confidence'
    : 'routine_high_confidence';

  return {
    decisionType,
    confidence,
    useHeavyModel,
    reason,
    signals: {
      strategic: strategicHits,
      routine: routineHits,
      longContext,
      role,
    },
  };
}

function logRoutingDecision(entry) {
  const log = readJson(ROUTING_LOG_PATH, { decisions: [] });
  log.decisions = log.decisions || [];
  log.decisions.push({
    date: new Date().toISOString(),
    ...entry,
  });
  log.decisions = log.decisions.slice(-250);
  writeJson(ROUTING_LOG_PATH, log);
}

module.exports = { routeDecision, logRoutingDecision, ROUTING_LOG_PATH };
