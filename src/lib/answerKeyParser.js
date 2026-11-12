// Server-side only (used by /api/answer-key). Requires: npm i cheerio
import * as cheerio from 'cheerio';

const clean = (s = '') => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const normLabel = (s = '') =>
  clean(s).toLowerCase().replace(/[:.\-]+$/g, '').trim();

const CANDIDATE_FIELDS = {
  'roll no': 'rollNo',
  'roll number': 'rollNo',
  'participant id': 'rollNo',
  'candidate name': 'name',
  'participant name': 'name',
  'exam date': 'examDate',
  'test date': 'examDate',
  'exam time': 'examTime',
  'test time': 'examTime',
  'venue name': 'venue',
  'test center name': 'venue',
  subject: 'subject',
  'exam name': 'subject',
};

function readCandidate($) {
  const out = { name: '', rollNo: '', examDate: '', examTime: '', venue: '', subject: '' };
  const scope = $('.main-info-pnl').length ? $('.main-info-pnl tr') : $('tr').slice(0, 50);

  scope.each((_, tr) => {
    const cells = $(tr).children('td');
    if (cells.length < 2) return;
    const field = CANDIDATE_FIELDS[normLabel($(cells[0]).text())];
    if (field && !out[field]) {
      out[field] = clean($(cells[1]).text()).slice(0, 120);
    }
  });
  return out;
}

export function parseAnswerKeyHtml(html) {
  const $ = cheerio.load(html);
  const candidate = readCandidate($);
  const sections = [];
  const questions = [];
  let sectionIdx = -1;

  $('.section-lbl, .question-pnl').each((_, el) => {
    const $el = $(el);

    if ($el.hasClass('section-lbl')) {
      const rawName = clean($el.text()).replace(/^section\s*:\s*/i, '');
      const name = rawName || `Section ${sections.length + 1}`;
      sections.push(name);
      sectionIdx = sections.length - 1;
      return;
    }

    if (sectionIdx === -1) {
      sections.push(candidate.subject || 'All Questions');
      sectionIdx = 0;
    }

    // Question number ("Q.12" or "Q 12")
    const qText = clean($el.find('.questionRowTbl td.bold').first().text());
    const qMatch = qText.match(/Q\.?\s*(\d+)/i);
    const n = qMatch ? Number(qMatch[1]) : questions.length + 1;

    // Metadata rows inside .menu-tbl
    const meta = {};
    $el.find('.menu-tbl tr').each((__, tr) => {
      const tds = $(tr).children('td');
      if (tds.length >= 2) {
        meta[normLabel($(tds[0]).text())] = clean($(tds[1]).text());
      }
    });

    // Chosen option: can be "1", "2", "3", "4" or "--" / "Not Answered"
    const chosenRaw = meta['chosen option'] || '';
    const chosen = /^[1-9]\d*$/.test(chosenRaw) ? Number(chosenRaw) : 0;

    // Correct option: usually "3. <option text>" inside td.rightAns
    let answer = 0;
    const $rightCell = $el.find('td.rightAns').first();
    if ($rightCell.length) {
      const rightText = clean($rightCell.text());
      const rMatch = rightText.match(/^([1-9]\d*)\s*\.?/);
      if (rMatch) {
        answer = Number(rMatch[1]);
      } else {
        // Fallback: check option row index if rightAns class has no leading number
        $el.find('.questionRowTbl tr').each((rowIdx, row) => {
          if ($(row).find('td.rightAns').length) {
            const rowText = clean($(row).text());
            const m = rowText.match(/^([1-9]\d*)\s*\./);
            if (m) answer = Number(m[1]);
          }
        });
      }
    }

    const type = (meta['question type'] || 'MCQ').toUpperCase();
    if (type !== 'MCQ' && type !== 'COMPREHENSION') {
      answer = 0;
    }

    questions.push({
      id: `${sectionIdx}-${n}-${questions.length}`,
      n,
      s: sectionIdx,
      chosen,
      answer,
      type,
    });
  });

  if (questions.length === 0) {
    const err = new Error('NO_QUESTIONS');
    err.code = 'NO_QUESTIONS';
    throw err;
  }
  if (!questions.some((q) => q.answer > 0)) {
    const err = new Error('NO_ANSWERS');
    err.code = 'NO_ANSWERS';
    throw err;
  }

  return { candidate, sections, questions };
}
