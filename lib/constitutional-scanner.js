const PRINCIPLES = [
  {
    id: 'approval_boundary',
    severity: 'high',
    question: 'Does this require Spencer approval before action?',
    signals: ['spend', 'payment', 'refund', 'contract', 'partnership', 'external message', 'customer email', 'public announcement'],
  },
  {
    id: 'legal_compliance',
    severity: 'high',
    question: 'Could this create legal, tax, compliance, or regulatory risk?',
    signals: ['legal', 'compliance', 'regulatory', 'tax', 'lawsuit', 'terms of service', 'privacy policy'],
  },
  {
    id: 'data_security',
    severity: 'high',
    question: 'Could this expose private data, credentials, user data, or internal metrics?',
    signals: ['secret', 'api key', 'password', 'credential', 'user data', 'private data', 'internal metrics', 'financials'],
  },
  {
    id: 'irreversibility',
    severity: 'high',
    question: 'Is the action hard to reverse or destructive?',
    signals: ['delete', 'drop table', 'wipe', 'erase', 'terminate', 'fire ', 'shutdown', 'production deploy'],
  },
  {
    id: 'strategy_drift',
    severity: 'medium',
    question: 'Does this change Understudy strategy, positioning, pricing, or vision?',
    signals: ['pivot', 'vision', 'strategy', 'positioning', 'pricing', 'business model', 'brand shift'],
  },
  {
    id: 'trust_quality',
    severity: 'medium',
    question: 'Does this risk trust, quality, or durability for speed/noise?',
    signals: ['growth hack', 'viral', 'scrape', 'spam', 'mass email', 'auto-post', 'fake', 'shortcut'],
  },
  {
    id: 'confidence_gap',
    severity: 'medium',
    question: 'Does the recommendation make claims without naming uncertainty or missing information?',
    signals: ['guaranteed', 'definitely', 'no risk', 'always', 'never fails', 'certainly'],
  },
];

function normalize(text) {
  return String(text || '').toLowerCase();
}

function scanAgainstPrinciples(text) {
  const haystack = normalize(text);
  return PRINCIPLES.map((principle) => {
    const matchedSignals = principle.signals.filter((signal) => haystack.includes(signal));
    return {
      id: principle.id,
      question: principle.question,
      severity: principle.severity,
      matchedSignals,
      status: matchedSignals.length ? 'flagged' : 'clear',
    };
  });
}

function decide(flags) {
  const high = flags.filter((flag) => flag.status === 'flagged' && flag.severity === 'high');
  const medium = flags.filter((flag) => flag.status === 'flagged' && flag.severity === 'medium');

  if (high.length) {
    return {
      verdict: 'REJECT',
      riskLevel: 'high',
      reason: 'High-risk approval, legal, security, or irreversible-action signal detected.',
    };
  }

  if (medium.length) {
    return {
      verdict: 'REVIEW',
      riskLevel: 'medium',
      reason: 'Medium-risk strategy, trust, or confidence signal detected.',
    };
  }

  return {
    verdict: 'APPROVED',
    riskLevel: 'low',
    reason: 'No constitutional risk signals detected.',
  };
}

function runConstitutionalScanner(input) {
  const decisionText = [
    input?.decision,
    input?.context,
    input?.ceo,
    input?.synthesis,
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!decisionText.trim()) {
    return {
      ok: false,
      reason: 'missing_decision_text',
      details: {},
    };
  }

  const flags = scanAgainstPrinciples(decisionText);
  const result = decide(flags);

  return {
    ok: true,
    data: {
      ...result,
      flags,
      principles: PRINCIPLES.map(({ id, question, severity }) => ({ id, question, severity })),
    },
  };
}

module.exports = { PRINCIPLES, runConstitutionalScanner };
