'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
// Adjust this import if your Firebase init lives elsewhere.
// It must export the initialized `auth` and `db` instances.
import { auth, db } from '@/lib/firebase';
import {
  EXAM_PRESETS,
  computeResult,
  fmt,
  formatMarks,
  parseMarks,
} from '@/lib/answerKeyScoring';
import styles from './answerkey.module.css';

const COLLECTION = 'answerKeyAnalyses';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'C', label: 'Correct' },
  { id: 'W', label: 'Incorrect' },
  { id: 'U', label: 'Unattempted' },
];

export default function AnswerKeyAnalyzerPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [mode, setMode] = useState('url'); // 'url' | 'html'
  const [urlText, setUrlText] = useState('');
  const [htmlText, setHtmlText] = useState('');
  const [presetId, setPresetId] = useState('rrb');
  const [correctTxt, setCorrectTxt] = useState('1');
  const [negativeTxt, setNegativeTxt] = useState('1/3');
  const [cutoffTxt, setCutoffTxt] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('all');
  const [activeQ, setActiveQ] = useState(null);

  const resultsRef = useRef(null);
  const skipSave = useRef(false);

  /* ── auth ── */
  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return off;
  }, []);

  /* ── history ── */
  const loadHistory = useCallback(async (uid) => {
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTION), where('userId', '==', uid))
      );
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort(
        (a, b) => (b.analyzedAt?.toMillis?.() ?? 0) - (a.analyzedAt?.toMillis?.() ?? 0)
      );
      setHistory(rows.slice(0, 12));
    } catch (err) {
      console.error('history load failed', err);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (user) loadHistory(user.uid);
    else setHistory([]);
  }, [user, loadHistory]);

  /* ── derived values ── */
  const scheme = useMemo(
    () => ({ correct: parseMarks(correctTxt), negative: parseMarks(negativeTxt) }),
    [correctTxt, negativeTxt]
  );
  const schemeOk = scheme.correct > 0 && scheme.negative >= 0;
  const cutoff = useMemo(() => {
    const n = parseMarks(cutoffTxt);
    return Number.isFinite(n) ? n : null;
  }, [cutoffTxt]);

  const result = useMemo(
    () => (parsed && schemeOk ? computeResult(parsed, scheme) : null),
    [parsed, schemeOk, scheme]
  );

  const preset = EXAM_PRESETS.find((p) => p.id === presetId) || EXAM_PRESETS[0];

  /* ── auto-save (debounced; re-saves when marking scheme or cutoff change) ── */
  useEffect(() => {
    if (!user || !parsed || !result) return undefined;

    if (skipSave.current) {
      // Just opened from history — nothing new to write.
      skipSave.current = false;
      setSaveState('saved');
      return undefined;
    }

    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        const id = `${user.uid}_${parsed.fingerprint}`;
        await setDoc(doc(db, COLLECTION, id), {
          userId: user.uid,
          exam: preset.label,
          presetId: preset.id,
          candidate: parsed.candidate,
          scheme: { correct: scheme.correct, negative: scheme.negative },
          totals: result.totals,
          sections: result.sections,
          questions: result.questions,
          score: result.score,
          maxScore: result.maxScore,
          percentage: result.percentage,
          cutoff,
          source: parsed.source,
          sourceUrl: parsed.sourceUrl || '',
          fingerprint: parsed.fingerprint,
          analyzedAt: serverTimestamp(),
        });
        setSaveState('saved');
        loadHistory(user.uid);
      } catch (err) {
        console.error('save failed', err);
        setSaveState('error');
      }
    }, 900);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, parsed, result, cutoff, preset.id]);

  /* ── handlers ── */
  function choosePreset(id) {
    const p = EXAM_PRESETS.find((x) => x.id === id);
    setPresetId(id);
    if (p && id !== 'custom') {
      setCorrectTxt(p.correct);
      setNegativeTxt(p.negative);
    }
  }

  async function analyze(e) {
    e.preventDefault();
    setError('');

    if (!user) return setError('Sign in to analyze and save your result.');
    if (!schemeOk) return setError('Enter valid marks: correct must be above 0, negative 0 or more.');
    const input = (mode === 'url' ? urlText : htmlText).trim();
    if (!input) {
      return setError(
        mode === 'url' ? 'Paste your answer key link first.' : 'Paste the page source first.'
      );
    }

    setLoading(true);
    setParsed(null);
    setActiveQ(null);
    setFilter('all');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/answer-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(mode === 'url' ? { url: input } : { html: input }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error?.message || 'Could not analyze this answer key.');
      }
      setParsed(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (err) {
      setError(err.message || 'Could not analyze this answer key.');
    } finally {
      setLoading(false);
    }
  }

  function openSaved(row) {
    skipSave.current = true;
    setError('');
    setPresetId(row.presetId || 'custom');
    setCorrectTxt(formatMarks(row.scheme.correct));
    setNegativeTxt(formatMarks(row.scheme.negative));
    setCutoffTxt(row.cutoff == null ? '' : String(row.cutoff));
    setActiveQ(null);
    setFilter('all');
    setParsed({
      candidate: row.candidate,
      sections: row.sections.map((s) => s.name),
      questions: row.questions.map((q) => ({ n: q.n, s: q.s, chosen: q.c, answer: q.a })),
      source: row.source,
      sourceUrl: row.sourceUrl,
      fingerprint: row.fingerprint,
    });
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError('That file is over 4 MB, which is the upload limit here.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setHtmlText(String(reader.result || ''));
      setError('');
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  async function removeSaved(row) {
    try {
      await deleteDoc(doc(db, COLLECTION, row.id));
      setHistory((h) => h.filter((x) => x.id !== row.id));
    } catch (err) {
      console.error('delete failed', err);
    }
  }

  /* ── render helpers ── */
  const t = result?.totals;
  const barPct = (n) => (t?.totalQuestions ? (n / t.totalQuestions) * 100 : 0);
  const activeQuestion = result?.questions.find((q) => q.n === activeQ);
  const visibleQuestions = result
    ? result.questions.filter((q) => filter === 'all' || q.r === filter)
    : [];

  function describe(q) {
    const sec = result.sections[q.s]?.name || '';
    if (q.r === 'N') return `Q${q.n} (${sec}): no correct answer in this sheet, not scored.`;
    if (q.r === 'U') return `Q${q.n} (${sec}): not attempted. Correct option is ${q.a}.`;
    if (q.r === 'C') return `Q${q.n} (${sec}): you chose ${q.c}. Correct.`;
    return `Q${q.n} (${sec}): you chose ${q.c}. Correct option is ${q.a}.`;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Answer Key Analyzer</h1>
        <p className={styles.subtitle}>
          Paste your RRB or SSC answer key link to see your score, accuracy and subject-wise
          breakdown. Results save to your account automatically.
        </p>
      </header>

      {/* ── input form ── */}
      <form className={styles.form} onSubmit={analyze}>
        <div className={styles.modeSwitch} role="group" aria-label="Answer key source">
          <button
            type="button"
            className={mode === 'url' ? styles.modeOn : styles.modeOff}
            aria-pressed={mode === 'url'}
            onClick={() => setMode('url')}
          >
            Answer key link
          </button>
          <button
            type="button"
            className={mode === 'html' ? styles.modeOn : styles.modeOff}
            aria-pressed={mode === 'html'}
            onClick={() => setMode('html')}
          >
            Paste page source
          </button>
        </div>

        {mode === 'url' ? (
          <label className={styles.field}>
            <span className={styles.label}>Answer key link</span>
            <input
              className={styles.input}
              type="url"
              inputMode="url"
              placeholder="https://rrb.digialm.com/…  or  https://ssc.digialm.com/…"
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              autoComplete="off"
            />
            <span className={styles.hint}>
              Use the address of your response sheet page (the one that shows your questions), not
              the login page. If it won&apos;t load here, save that page with Ctrl+S and upload it
              under &ldquo;Paste page source&rdquo;.
            </span>
          </label>
        ) : (
          <label className={styles.field}>
            <span className={styles.label}>Page source (HTML)</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              rows={6}
              placeholder="Paste the full page source of your response sheet here"
              value={htmlText}
              onChange={(e) => setHtmlText(e.target.value)}
              spellCheck={false}
            />
            <span className={styles.hint}>
              Easiest way: open your response sheet, press Ctrl+S to save the page as HTML, then
              choose that file here.
            </span>
            <input
              className={styles.input}
              type="file"
              accept=".html,.htm,text/html"
              onChange={onPickFile}
            />
          </label>
        )}

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Exam</span>
            <select
              className={styles.input}
              value={presetId}
              onChange={(e) => choosePreset(e.target.value)}
            >
              {EXAM_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Marks per correct answer</span>
            <input
              className={styles.input}
              inputMode="decimal"
              value={correctTxt}
              onChange={(e) => {
                setCorrectTxt(e.target.value);
                setPresetId('custom');
              }}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Marks cut per wrong answer</span>
            <input
              className={styles.input}
              inputMode="decimal"
              placeholder="0.25 or 1/3"
              value={negativeTxt}
              onChange={(e) => {
                setNegativeTxt(e.target.value);
                setPresetId('custom');
              }}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Expected cutoff (optional)</span>
            <input
              className={styles.input}
              inputMode="decimal"
              placeholder="e.g. 72.5"
              value={cutoffTxt}
              onChange={(e) => setCutoffTxt(e.target.value)}
            />
          </label>
        </div>

        <p className={styles.hint}>
          Marking differs by exam, year and shift. Check your notification and edit the numbers if
          they don&apos;t match.
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {authReady && !user && (
          <p className={styles.error} role="alert">
            Sign in to analyze and save your result.
          </p>
        )}

        <button className={styles.submit} type="submit" disabled={loading || !authReady || !user}>
          {loading ? 'Analyzing…' : 'Analyze answer key'}
        </button>
      </form>

      {/* ── results ── */}
      <div ref={resultsRef}>
        {parsed && !result && (
          <p className={styles.error}>Fix the marking scheme above to see your score.</p>
        )}

        {result && (
          <section className={styles.results} aria-label="Result">
            <div className={styles.scoreBlock}>
              <div>
                <p className={styles.scoreLabel}>Your score</p>
                <p className={styles.score}>
                  {fmt(result.score)}
                  <span className={styles.scoreMax}> / {fmt(result.maxScore)}</span>
                </p>
                <p className={styles.pct}>{fmt(result.percentage)}% overall</p>
                {cutoff != null && (
                  <p className={styles.cutoff}>
                    {result.score >= cutoff
                      ? `${fmt(result.score - cutoff)} marks above your expected cutoff of ${fmt(cutoff)}`
                      : `${fmt(cutoff - result.score)} marks below your expected cutoff of ${fmt(cutoff)}`}
                  </p>
                )}
              </div>

              <dl className={styles.candidate}>
                {parsed.candidate.name && (
                  <>
                    <dt>Candidate</dt>
                    <dd>{parsed.candidate.name}</dd>
                  </>
                )}
                {parsed.candidate.rollNo && (
                  <>
                    <dt>Roll no.</dt>
                    <dd>{parsed.candidate.rollNo}</dd>
                  </>
                )}
                {parsed.candidate.examDate && (
                  <>
                    <dt>Exam date</dt>
                    <dd>
                      {parsed.candidate.examDate}
                      {parsed.candidate.examTime ? `, ${parsed.candidate.examTime}` : ''}
                    </dd>
                  </>
                )}
              </dl>
            </div>

            {/* outcome bar */}
            <div
              className={styles.bar}
              role="img"
              aria-label={`${t.correct} correct, ${t.incorrect} incorrect, ${t.unattempted} unattempted`}
            >
              <span className={styles.barC} style={{ width: `${barPct(t.correct)}%` }} />
              <span className={styles.barW} style={{ width: `${barPct(t.incorrect)}%` }} />
              <span className={styles.barU} style={{ width: `${barPct(t.unattempted)}%` }} />
            </div>

            <dl className={styles.stats}>
              <div className={styles.stat}>
                <dt>Total questions</dt>
                <dd>{t.totalQuestions}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Attempted</dt>
                <dd>{t.attempted}</dd>
              </div>
              <div className={`${styles.stat} ${styles.statC}`}>
                <dt>Correct</dt>
                <dd>{t.correct}</dd>
              </div>
              <div className={`${styles.stat} ${styles.statW}`}>
                <dt>Incorrect</dt>
                <dd>{t.incorrect}</dd>
              </div>
              <div className={`${styles.stat} ${styles.statU}`}>
                <dt>Unattempted</dt>
                <dd>{t.unattempted}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Accuracy</dt>
                <dd>{fmt(result.accuracy)}%</dd>
              </div>
            </dl>

            {t.unscored > 0 && (
              <p className={styles.note}>
                {t.unscored} question{t.unscored > 1 ? 's have' : ' has'} no correct answer in this
                sheet (for example dropped or non-multiple-choice) and {t.unscored > 1 ? 'are' : 'is'}{' '}
                not scored.
              </p>
            )}

            {/* subject-wise */}
            <h2 className={styles.h2}>Subject-wise breakdown</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col">Questions</th>
                    <th scope="col">Attempted</th>
                    <th scope="col">Correct</th>
                    <th scope="col">Incorrect</th>
                    <th scope="col">Score</th>
                    <th scope="col">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sections.map((s) => (
                    <tr key={s.name}>
                      <th scope="row">{s.name}</th>
                      <td>{s.total}</td>
                      <td>{s.attempted}</td>
                      <td>{s.correct}</td>
                      <td>{s.incorrect}</td>
                      <td>
                        {fmt(s.score)} / {fmt(s.maxScore)}
                      </td>
                      <td>
                        <span className={styles.acc}>
                          <span className={styles.accTrack}>
                            <span className={styles.accFill} style={{ width: `${s.accuracy}%` }} />
                          </span>
                          {fmt(s.accuracy)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* question map */}
            <h2 className={styles.h2}>Question review</h2>
            <div className={styles.chips} role="group" aria-label="Filter questions">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={filter === f.id ? styles.chipOn : styles.chip}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <ul className={styles.qGrid}>
              {visibleQuestions.map((q) => (
                <li key={q.n}>
                  <button
                    type="button"
                    className={`${styles.q} ${styles[`q${q.r}`]} ${
                      activeQ === q.n ? styles.qActive : ''
                    }`}
                    onClick={() => setActiveQ(q.n)}
                    aria-label={describe(q)}
                  >
                    {q.n}
                  </button>
                </li>
              ))}
            </ul>
            <p className={styles.qDetail} aria-live="polite">
              {activeQuestion
                ? describe(activeQuestion)
                : 'Select a question number to see what you chose and the correct option.'}
            </p>

            <p className={styles.saveLine} aria-live="polite">
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'Saved to your account'}
              {saveState === 'error' && 'Could not save this result. Check your connection and change any field to retry.'}
            </p>
            <p className={styles.note}>
              This is an estimate from the answer key in your sheet. Official results can differ
              because of normalisation or revised keys.
            </p>
          </section>
        )}
      </div>

      {/* ── history ── */}
      {history.length > 0 && (
        <section className={styles.history} aria-label="Saved analyses">
          <h2 className={styles.h2}>Saved analyses</h2>
          <ul className={styles.historyList}>
            {history.map((row) => (
              <li key={row.id} className={styles.historyItem}>
                <button type="button" className={styles.historyOpen} onClick={() => openSaved(row)}>
                  <span className={styles.historyExam}>{row.exam}</span>
                  <span className={styles.historyMeta}>
                    {row.candidate?.examDate || 'Date not found'}
                  </span>
                  <span className={styles.historyScore}>
                    {fmt(row.score)} / {fmt(row.maxScore)} ({fmt(row.percentage)}%)
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.historyDelete}
                  onClick={() => removeSaved(row)}
                  aria-label={`Delete saved analysis for ${row.exam}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
