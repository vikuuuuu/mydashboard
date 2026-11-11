// Pure functions — no Firebase, no cheerio. Safe to import in client code.

// Marking schemes differ by exam, year and shift. Treat these as starting
// points and edit the numbers to match your notification.
export const EXAM_PRESETS = [
  { id: 'rrb', label: 'RRB (NTPC / Group D / ALP / JE)', correct: '1', negative: '1/3' },
  { id: 'ssc-cgl', label: 'SSC CGL / CHSL Tier 1', correct: '2', negative: '0.5' },
  { id: 'ssc-std', label: 'SSC GD / CPO / Steno / JE', correct: '1', negative: '0.25' },
  { id: 'custom', label: 'Custom', correct: '1', negative: '0' },
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Accepts "2", "0.25" or a fraction like "1/3". Returns NaN when invalid.
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
  return String(Number(n.toFixed(4)));
}

export function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * parsed:  { sections: string[], questions: [{ n, s, chosen, answer }] }
 * scheme:  { correct: number, negative: number }
 *
 * Result codes per question: C correct, W wrong, U unattempted,
 * N no answer key in the sheet (not scored).
 */
export function computeResult(parsed, scheme) {
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

  const questions = parsed.questions.map((q) => {
    const sec = sections[q.s];
    sec.total += 1;
    if (q.chosen) sec.attempted += 1;
    else sec.unattempted += 1;

    let r;
    if (!q.answer) {
      r = 'N';
      sec.unscored += 1;
    } else if (!q.chosen) {
      r = 'U';
    } else if (q.chosen === q.answer) {
      r = 'C';
      sec.correct += 1;
    } else {
      r = 'W';
      sec.incorrect += 1;
    }
    return { n: q.n, s: q.s, c: q.chosen, a: q.answer, r };
  });

  sections.forEach((sec) => {
    const judged = sec.correct + sec.incorrect;
    sec.score = round2(sec.correct * cm - sec.incorrect * nm);
    sec.maxScore = round2(sec.total * cm);
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

  const score = round2(totals.correct * cm - totals.incorrect * nm);
  const maxScore = round2(totals.totalQuestions * cm);
  const percentage = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  const judged = totals.correct + totals.incorrect;
  const accuracy = judged ? round2((totals.correct / judged) * 100) : 0;

  return { totals, sections, questions, score, maxScore, percentage, accuracy };
}
