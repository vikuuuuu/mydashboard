// Server-side only (used by /api/answer-key). Requires: npm i cheerio
//
// Parses the TCS iON / digialm "candidate response sheet" page that RRB and
// SSC publish with the answer key. Each question lives in a `.question-pnl`
// block, grouped under a `.section-lbl` heading. The correct option is the
// `td.rightAns` cell; the candidate's pick is the "Chosen Option" row.
import * as cheerio from 'cheerio';

const clean = (s = '') => s.replace(/\s+/g, ' ').trim();
const normLabel = (s = '') =>
  clean(s).toLowerCase().replace(/[:.]+$/g, '').trim();

const CANDIDATE_FIELDS = {
  'roll no': 'rollNo',
  'participant id': 'rollNo',
  'candidate name': 'name',
  'participant name': 'name',
  'exam date': 'examDate',
  'test date': 'examDate',
  'exam time': 'examTime',
  'test time': 'examTime',
  'venue name': 'venue',
  subject: 'subject',
};

function readCandidate($) {
  const out = { name: '', rollNo: '', examDate: '', examTime: '', venue: '', subject: '' };
  const scope = $('.main-info-pnl').length ? $('.main-info-pnl tr') : $('tr').slice(0, 40);

  scope.each((_, tr) => {
    const cells = $(tr).children('td');
    if (cells.length < 2) return;
    const field = CANDIDATE_FIELDS[normLabel($(cells[0]).text())];
    if (field && !out[field]) out[field] = clean($(cells[1]).text()).slice(0, 120);
  });
  return out;
}

export function parseAnswerKeyHtml(html) {
  const $ = cheerio.load(html);
  const candidate = readCandidate($);
  const sections = [];
  const questions = [];
  let sectionIdx = -1;

  // Selector list returns elements in document order, so section headings
  // naturally come before the questions that belong to them.
  $('.section-lbl, .question-pnl').each((_, el) => {
    const $el = $(el);

    if ($el.hasClass('section-lbl')) {
      const name = clean($el.text()).replace(/^section\s*:\s*/i, '');
      sections.push(name || `Section ${sections.length + 1}`);
      sectionIdx = sections.length - 1;
      return;
    }

    if (sectionIdx === -1) {
      sections.push('All questions');
      sectionIdx = 0;
    }

    // Question number ("Q.12")
    const qText = clean($el.find('.questionRowTbl td.bold').first().text());
    const qMatch = qText.match(/Q\.?\s*(\d+)/i);
    const n = qMatch ? Number(qMatch[1]) : questions.length + 1;

    // Metadata rows: Question Type, Question ID, Status, Chosen Option…
    const meta = {};
    $el.find('.menu-tbl tr').each((__, tr) => {
      const tds = $(tr).children('td');
      if (tds.length >= 2) meta[normLabel($(tds[0]).text())] = clean($(tds[1]).text());
    });

    const chosenRaw = meta['chosen option'] || '';
    const chosen = /^\d+$/.test(chosenRaw) ? Number(chosenRaw) : 0;

    // Correct option: the cell marked rightAns reads "3. <option text>"
    const rightText = clean($el.find('td.rightAns').first().text());
    const rMatch = rightText.match(/^(\d+)\s*\./);
    let answer = rMatch ? Number(rMatch[1]) : 0;

    // Only multiple-choice questions can be scored from option numbers.
    const type = (meta['question type'] || 'MCQ').toUpperCase();
    if (type !== 'MCQ') answer = 0;

    questions.push({ n, s: sectionIdx, chosen, answer, type });
  });

  if (questions.length === 0) {
    const err = new Error('NO_QUESTIONS');
    err.code = 'NO_QUESTIONS';
    throw err;
  }
  if (!questions.some((q) => q.answer)) {
    const err = new Error('NO_ANSWERS');
    err.code = 'NO_ANSWERS';
    throw err;
  }

  return { candidate, sections, questions };
}
