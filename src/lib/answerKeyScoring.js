// Pure functions — no Firebase, no cheerio. Safe to import in client code.

export const EXAM_PRESETS = [
  { id: 'rrb', label: 'RRB (NTPC / Group D / ALP / JE)', correct: '1', negative: '1/3' },
  { id: 'ssc-cgl', label: 'SSC CGL / CHSL Tier 1', correct: '2', negative: '0.5' },
  { id: 'ssc-mains', label: 'SSC CGL / CHSL Tier 2', correct: '3', negative: '1' },
  { id: 'ssc-std', label: 'SSC GD / CPO / Steno / JE', correct: '1', negative: '0.25' },
  { id: 'custom', label: 'Custom', correct: '1', negative: '0' },
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseMarks(text) {
  const t = String(text ?? '').trim();
  if (!t) return NaN;
  if (t.includes('/')) {
    const parts = t.split('/');
    if (parts.length !== 2) return NaN;
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    return b ? a / b : NaN;
  }
  return Number(t);
}

export function formatMarks(n) {
  if (Math.abs(n - 1 / 3) < 1e-9) return '1/3';
  if (Math.abs(n - 2 / 3) < 1e-9) return '2/3';
  return String(Number(n.toFixed(4)));
}

export function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * Result codes per question:
 * C = Correct
 * W = Wrong (Incorrect)
 * U = Unattempted
 * N = No answer key / Dropped question (not scored)
 */
export function computeResult(parsed, scheme, { bonusForDropped = false } = {}) {
  const cm = scheme.correct;
  const nm = scheme.negative;

  const sections = parsed.sections.map((name) => ({
    name,
    total: 0,
    attempted: 0,
    correct: 0,
    incorrect: 0,
    unattempted: 0,
    unscored: 0,
  }));

  const questions = parsed.questions.map((q, idx) => {
    const sec = sections[q.s] || sections[0];
    sec.total += 1;

    let r;
    if (!q.answer) {
      // Dropped / Unscored question: do NOT count in attempted/unattempted
      r = 'N';
      sec.unscored += 1;
    } else if (!q.chosen) {
      r = 'U';
      sec.unattempted += 1;
    } else if (q.chosen === q.answer) {
      r = 'C';
      sec.attempted += 1;
      sec.correct += 1;
    } else {
      r = 'W';
      sec.attempted += 1;
      sec.incorrect += 1;
    }

    return {
      id: q.id || `${q.s}-${q.n}-${idx}`,
      n: q.n,
      s: q.s,
      c: q.chosen,
      a: q.answer,
      r,
    };
  });

  sections.forEach((sec) => {
    const judged = sec.correct + sec.incorrect;
    const scorableCount = sec.total - sec.unscored;
    const bonus = bonusForDropped ? sec.unscored * cm : 0;

    sec.score = round2(sec.correct * cm - sec.incorrect * nm + bonus);
    sec.maxScore = round2((bonusForDropped ? sec.total : scorableCount) * cm);
    sec.accuracy = judged ? round2((sec.correct / judged) * 100) : 0;
  });

  const sum = (key) => sections.reduce((acc, s) => acc + s[key], 0);
  const totals = {
    totalQuestions: sum('total'),
    attempted: sum('attempted'),
    correct: sum('correct'),
    incorrect: sum('incorrect'),
    unattempted: sum('unattempted'),
    unscored: sum('unscored'),
  };

  const scorableTotal = totals.totalQuestions - totals.unscored;
  const totalBonus = bonusForDropped ? totals.unscored * cm : 0;

  const score = round2(totals.correct * cm - totals.incorrect * nm + totalBonus);
  const maxScore = round2((bonusForDropped ? totals.totalQuestions : scorableTotal) * cm);
  const percentage = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  const judged = totals.correct + totals.incorrect;
  const accuracy = judged ? round2((totals.correct / judged) * 100) : 0;

  return { totals, sections, questions, score, maxScore, percentage, accuracy };
}
