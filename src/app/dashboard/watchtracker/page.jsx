'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import styles from './watchtracker.module.css';

/* ══════════════════════════════════════════════
   CONSTANTS — Latest OTT Platforms 2025-26
══════════════════════════════════════════════ */
const PLATFORMS = [
  'Netflix', 'Prime Video', 'Disney+ Hotstar', 'JioCinema',
  'SonyLIV', 'Zee5', 'Apple TV+', 'HBO Max', 'Hulu',
  'Peacock', 'Paramount+', 'MX Player', 'YouTube Premium',
  'Aha', 'ShemarooMe', 'Sun NXT', 'Theaters', 'Other',
];

const GENRES = [
  'Action', 'Thriller', 'Crime Drama', 'Comedy', 'Romance',
  'Horror', 'Sci-Fi', 'Fantasy', 'Drama', 'Documentary',
  'Anime', 'Reality TV', 'Mystery', 'Biographical', 'Other',
];

const TYPES    = ['Series', 'Movie', 'Mini-Series', 'Documentary', 'Anime'];
const STATUSES = ['watchlist', 'watching', 'watched', 'upcoming'];

const EMOJIS = [
  '🎬','🔫','⚔️','🕵️','📈','👻','🚔','💥','🐅','❤️',
  '😂','👑','🔥','🎭','🧠','🌙','🦸','🎵','🏆','🌊',
  '🎪','⚡','🎯','🦋',
];

const PLATFORM_COLORS = {
  'Netflix':          { bg:'#e50914', text:'#fff' },
  'Prime Video':      { bg:'#00a8e1', text:'#fff' },
  'Disney+ Hotstar':  { bg:'#0063e5', text:'#fff' },
  'JioCinema':        { bg:'#003d99', text:'#fff' },
  'SonyLIV':          { bg:'#0066cc', text:'#fff' },
  'Zee5':             { bg:'#7b2fe4', text:'#fff' },
  'Apple TV+':        { bg:'#1c1c1e', text:'#fff' },
  'HBO Max':          { bg:'#5822b4', text:'#fff' },
  'Hulu':             { bg:'#1ce783', text:'#111' },
  'Peacock':          { bg:'#e07000', text:'#fff' },
  'Paramount+':       { bg:'#0064ff', text:'#fff' },
  'MX Player':        { bg:'#ed1e24', text:'#fff' },
  'YouTube Premium':  { bg:'#ff0000', text:'#fff' },
  'Aha':              { bg:'#fccc00', text:'#111' },
  'Theaters':         { bg:'#b45309', text:'#fff' },
};

const EMPTY_FORM = {
  title: '', type: 'Series', emoji: '🎬', posterUrl: '',
  platform: 'Netflix', genre: 'Drama', year: String(new Date().getFullYear()),
  desc: '', seasons: '', currentSeason: '', currentEp: '',
  totalEp: '', nextEp: '', nextDate: '', status: 'watchlist', progress: 0,
};

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function getCountdown(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target)) return null;
  const now    = new Date();
  const diff   = target - now;
  if (diff <= 0) return { days: 0, label: 'Released!', past: true };
  const days   = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 1) return { days: 1, label: '1 day left', past: false };
  return { days, label: `${days} days left`, past: false };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ══════════════════════════════════════════════
   SMALL COMPONENTS
══════════════════════════════════════════════ */
function PlatformBadge({ platform }) {
  const c = PLATFORM_COLORS[platform];
  if (c) return (
    <span className={styles.badge} style={{ background: c.bg, color: c.text }}>
      {platform}
    </span>
  );
  return <span className={`${styles.badge} ${styles.badgeType}`}>{platform}</span>;
}

function StatusBadge({ status }) {
  const map = {
    watching:  [styles.badgeWatching, 'Watching'],
    watched:   [styles.badgeWatched,  'Watched'],
    upcoming:  [styles.badgeUpcoming, 'Upcoming'],
    watchlist: [styles.badgeType,     'Watchlist'],
  };
  const [cls, label] = map[status] || map.watchlist;
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

function Spinner() {
  return (
    <span className={styles.spinner}>
      <span className={styles.spinnerInner} />
    </span>
  );
}

/* ══════════════════════════════════════════════
   COUNTDOWN CHIP
══════════════════════════════════════════════ */
function CountdownChip({ dateStr, compact = false }) {
  const cd = getCountdown(dateStr);
  if (!cd) return null;
  if (cd.past) return <span className={styles.cdReleased}>✓ Out Now</span>;
  const urgency = cd.days <= 3 ? styles.cdUrgent : cd.days <= 14 ? styles.cdSoon : styles.cdFar;
  if (compact) return <span className={`${styles.cdChip} ${urgency}`}>⏳ {cd.label}</span>;
  return (
    <div className={styles.cdBlock}>
      <div className={styles.cdNum}>{cd.days}</div>
      <div className={styles.cdUnit}>days left</div>
      <div className={styles.cdDate}>{formatDate(dateStr)}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MEDIA CARD
══════════════════════════════════════════════ */
function MediaCard({ item, onClick, onEdit, onDelete }) {
  const [imgErr, setImgErr] = useState(false);
  const cd = item.status === 'upcoming' ? getCountdown(item.nextDate) : null;

  return (
    <div className={styles.card} onClick={() => onClick(item)}>
      {/* Poster */}
      <div className={styles.cardPoster}>
        {item.posterUrl && !imgErr ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className={styles.cardImg}
            loading="lazy"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className={styles.cardFallback}>
            <span className={styles.cardEmoji}>{item.emoji}</span>
          </div>
        )}

        {/* Platform tag */}
        <div
          className={styles.cardPlatTag}
          style={PLATFORM_COLORS[item.platform]
            ? { background: PLATFORM_COLORS[item.platform].bg, color: PLATFORM_COLORS[item.platform].text }
            : {}}
        >
          {item.platform}
        </div>

        {/* Status overlay */}
        {item.status === 'watched' && (
          <div className={styles.cardWatchedBadge}>✓ Done</div>
        )}

        {/* Upcoming countdown on poster */}
        {cd && !cd.past && (
          <div className={`${styles.cardCdOverlay} ${cd.days <= 3 ? styles.cardCdUrgent : ''}`}>
            ⏳ {cd.days}d
          </div>
        )}
      </div>

      {/* Body */}
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>{item.title}</div>
        <div className={styles.cardSub}>{item.year} · {item.genre}</div>

        {item.status === 'watching' && (
          <div className={styles.cardProg}>
            <div className={styles.cardProgBar}>
              <div className={styles.cardProgFill} style={{ width: `${item.progress || 0}%` }} />
            </div>
            <span className={styles.cardProgPct}>{item.progress || 0}%</span>
          </div>
        )}

        {item.status === 'upcoming' && item.nextDate && (
          <div className={styles.cardNextDate}>📅 {formatDate(item.nextDate)}</div>
        )}
      </div>

      {/* Footer actions */}
      <div className={styles.cardFoot} onClick={e => e.stopPropagation()}>
        <button className={styles.cardEdit} onClick={() => onEdit(item)}>✏️ Edit</button>
        <button className={styles.cardDel}  onClick={() => onDelete(item.id)}>🗑</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   UPCOMING ROW (for Upcoming tab)
══════════════════════════════════════════════ */
function UpcomingRow({ item, onClick, onEdit, onDelete }) {
  const cd = getCountdown(item.nextDate);
  return (
    <div className={styles.upRow} onClick={() => onClick(item)}>
      {/* Countdown block */}
      <div className={`${styles.upCd} ${cd && cd.days <= 3 ? styles.upCdUrgent : ''}`}>
        {cd && !cd.past ? (
          <>
            <div className={styles.upCdNum}>{cd.days}</div>
            <div className={styles.upCdLbl}>days</div>
          </>
        ) : cd?.past ? (
          <div className={styles.upCdOut}>Out!</div>
        ) : (
          <div className={styles.upCdTbd}>TBD</div>
        )}
      </div>

      {/* Mini poster */}
      <div className={styles.upThumb}>
        {item.posterUrl
          ? <img src={item.posterUrl} alt={item.title} className={styles.upThumbImg} />
          : <span className={styles.upThumbEmoji}>{item.emoji}</span>
        }
      </div>

      {/* Info */}
      <div className={styles.upInfo}>
        <div className={styles.upTitle}>{item.title}</div>
        <div className={styles.upMeta}>
          <PlatformBadge platform={item.platform} />
          <span className={`${styles.badge} ${styles.badgeType}`}>{item.type}</span>
        </div>
        {item.nextDate && (
          <div className={styles.upDate}>📅 {formatDate(item.nextDate)}</div>
        )}
        {item.desc && (
          <div className={styles.upDesc}>{item.desc.slice(0, 80)}{item.desc.length > 80 ? '…' : ''}</div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.upActs} onClick={e => e.stopPropagation()}>
        <button className={styles.cardEdit} onClick={() => onEdit(item)}>✏️</button>
        <button className={styles.cardDel}  onClick={() => onDelete(item.id)}>🗑</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   FORM MODAL (Add / Edit)
══════════════════════════════════════════════ */
function FormModal({ editItem, onClose, onSave, saving }) {
  const [form, setForm] = useState(editItem ? { ...editItem } : { ...EMPTY_FORM });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = () => {
    if (!form.title.trim()) return alert('Title is required!');
    onSave(form);
  };

  const isUpcoming = form.status === 'upcoming';
  const isWatching = form.status === 'watching';
  const isSeries   = form.type === 'Series' || form.type === 'Mini-Series' || form.type === 'Anime';

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.formPanel}>
        <div className={styles.formHead}>
          <div className={styles.formTitle}>{editItem ? '✏️ Edit Entry' : '➕ Add New'}</div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.formScroll}>
          {/* Poster URL */}
          <div className={styles.fField}>
            <label className={styles.fLabel}>Poster Image URL</label>
            <input
              className={styles.fInput}
              value={form.posterUrl || ''}
              onChange={e => set('posterUrl', e.target.value)}
              placeholder="https://image.tmdb.org/t/p/w500/..."
            />
            {form.posterUrl && (
              <div className={styles.posterPreview}>
                <img
                  src={form.posterUrl}
                  alt="Preview"
                  className={styles.posterPreviewImg}
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <span className={styles.posterPreviewLabel}>Preview</span>
              </div>
            )}
          </div>

          {/* Emoji fallback */}
          {!form.posterUrl && (
            <div className={styles.fField}>
              <label className={styles.fLabel}>Emoji Icon (used when no poster)</label>
              <div className={styles.emojiPicker}>
                {EMOJIS.map(e => (
                  <button
                    key={e} type="button"
                    className={`${styles.emojiBtn} ${form.emoji === e ? styles.emojiSel : ''}`}
                    onClick={() => set('emoji', e)}
                  >{e}</button>
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <div className={styles.fField}>
            <label className={styles.fLabel}>Title *</label>
            <input
              className={styles.fInput}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Mirzapur Season 4"
              autoFocus
            />
          </div>

          {/* Type + Platform */}
          <div className={styles.fRow}>
            <div className={styles.fField}>
              <label className={styles.fLabel}>Type</label>
              <select className={styles.fSelect} value={form.type} onChange={e => set('type', e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.fField}>
              <label className={styles.fLabel}>Platform</label>
              <select className={styles.fSelect} value={form.platform} onChange={e => set('platform', e.target.value)}>
                {PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Genre + Year */}
          <div className={styles.fRow}>
            <div className={styles.fField}>
              <label className={styles.fLabel}>Genre</label>
              <select className={styles.fSelect} value={form.genre} onChange={e => set('genre', e.target.value)}>
                {GENRES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className={styles.fField}>
              <label className={styles.fLabel}>Year</label>
              <input className={styles.fInput} value={form.year} onChange={e => set('year', e.target.value)} placeholder="2025" />
            </div>
          </div>

          {/* Status */}
          <div className={styles.fField}>
            <label className={styles.fLabel}>Status</label>
            <div className={styles.statusPills}>
              {STATUSES.map(s => (
                <button
                  key={s} type="button"
                  className={`${styles.statusPill} ${form.status === s ? styles.statusPillOn : ''}`}
                  onClick={() => set('status', s)}
                >
                  {s === 'watchlist' ? '📋 Watchlist'
                    : s === 'watching'  ? '▶️ Watching'
                    : s === 'watched'   ? '✅ Watched'
                    : '🗓 Upcoming'}
                </button>
              ))}
            </div>
          </div>

          {/* Description — always shown */}
          <div className={styles.fField}>
            <label className={styles.fLabel}>Description</label>
            <textarea
              className={styles.fTextarea}
              value={form.desc || ''}
              onChange={e => set('desc', e.target.value)}
              placeholder="Short description about this title…"
              rows={3}
            />
          </div>

          {/* Series-only fields */}
          {isSeries && (
            <div className={styles.fRow}>
              <div className={styles.fField}>
                <label className={styles.fLabel}>Total Seasons</label>
                <input className={styles.fInput} type="number" min="1" value={form.seasons || ''} onChange={e => set('seasons', e.target.value)} placeholder="3" />
              </div>
              <div className={styles.fField}>
                <label className={styles.fLabel}>Current Season</label>
                <input className={styles.fInput} type="number" min="0" value={form.currentSeason || ''} onChange={e => set('currentSeason', e.target.value)} placeholder="1" />
              </div>
            </div>
          )}

          {isSeries && (
            <div className={styles.fRow}>
              <div className={styles.fField}>
                <label className={styles.fLabel}>Current Episode</label>
                <input className={styles.fInput} type="number" min="0" value={form.currentEp || ''} onChange={e => set('currentEp', e.target.value)} placeholder="4" />
              </div>
              <div className={styles.fField}>
                <label className={styles.fLabel}>Episodes per Season</label>
                <input className={styles.fInput} type="number" min="0" value={form.totalEp || ''} onChange={e => set('totalEp', e.target.value)} placeholder="8" />
              </div>
            </div>
          )}

          {/* Progress slider — watching only */}
          {isWatching && (
            <div className={styles.fField}>
              <label className={styles.fLabel}>
                Progress — <span className={styles.fLabelVal}>{form.progress}%</span>
              </label>
              <input
                type="range" min="0" max="100"
                value={form.progress}
                onChange={e => set('progress', Number(e.target.value))}
                className={styles.fRange}
              />
            </div>
          )}

          {/* Release date — upcoming + next season */}
          <div className={styles.fField}>
            <label className={styles.fLabel}>
              {isUpcoming ? 'Release Date' : 'Next Release Date (optional)'}
            </label>
            <input
              type="date"
              className={styles.fInput}
              value={form.nextDate || ''}
              onChange={e => set('nextDate', e.target.value)}
            />
            {form.nextDate && <CountdownChip dateStr={form.nextDate} compact />}
          </div>

        </div>{/* end formScroll */}

        {/* Footer */}
        <div className={styles.formFoot}>
          <button className={styles.btnOutline} onClick={onClose}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={submit}
            disabled={saving}
          >
            {saving ? <><Spinner /> Saving…</> : editItem ? '✓ Update' : '+ Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   DETAIL MODAL
══════════════════════════════════════════════ */
function DetailModal({ item, onClose, onStatusChange, onEdit, saving }) {
  if (!item) return null;
  const cd = item.status === 'upcoming' ? getCountdown(item.nextDate) : null;

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.detailPanel}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        {/* Hero */}
        {item.posterUrl ? (
          <img src={item.posterUrl} alt={item.title} className={styles.detailHero} />
        ) : (
          <div className={styles.detailHeroFallback}>{item.emoji}</div>
        )}

        <div className={styles.detailBody}>
          <div className={styles.detailTitle}>{item.title}</div>

          <div className={styles.detailBadges}>
            <PlatformBadge platform={item.platform} />
            <span className={`${styles.badge} ${styles.badgeType}`}>{item.type}</span>
            <span className={`${styles.badge} ${styles.badgeType}`}>{item.year}</span>
            {item.genre && <span className={`${styles.badge} ${styles.badgeType}`}>{item.genre}</span>}
            <StatusBadge status={item.status} />
          </div>

          {/* Description */}
          {item.desc && <p className={styles.detailDesc}>{item.desc}</p>}

          {/* Series info */}
          {item.seasons && (
            <div className={styles.detailInfo}>
              📺 <strong>{item.seasons}</strong> Season{item.seasons > 1 ? 's' : ''}
              {item.currentSeason > 0 && <> · S{item.currentSeason}E{item.currentEp || 0}</>}
              {item.nextEp && <> · Next: <strong>{item.nextEp}</strong></>}
            </div>
          )}

          {/* Progress */}
          {item.status === 'watching' && (
            <div className={styles.detailProg}>
              <div className={styles.detailProgRow}>
                <span>Progress</span><span>{item.progress || 0}%</span>
              </div>
              <div className={styles.detailProgBar}>
                <div className={styles.detailProgFill} style={{ width: `${item.progress || 0}%` }} />
              </div>
            </div>
          )}

          {/* Countdown */}
          {cd && (
            <div className={styles.detailCd}>
              {cd.past ? (
                <span className={styles.cdReleased}>✓ Already Released!</span>
              ) : (
                <CountdownChip dateStr={item.nextDate} />
              )}
            </div>
          )}

          {item.nextDate && item.status !== 'upcoming' && (
            <div className={styles.detailInfo}>📅 Next: {formatDate(item.nextDate)}</div>
          )}

          {/* Platform */}
          <div className={styles.detailPlatform}>
            Available on <strong>{item.platform}</strong>
          </div>

          {/* Actions */}
          <div className={styles.detailActions}>
            {item.status === 'watchlist' && (
              <button className={styles.btnPrimary} onClick={() => onStatusChange(item.id, 'watching')} disabled={saving}>
                ▶ Start Watching
              </button>
            )}
            {item.status === 'watching' && (
              <button className={styles.btnGreen} onClick={() => onStatusChange(item.id, 'watched')} disabled={saving}>
                ✓ Mark as Watched
              </button>
            )}
            {item.status === 'upcoming' && (
              <button className={styles.btnPrimary} onClick={() => onStatusChange(item.id, 'watchlist')} disabled={saving}>
                + Add to Watchlist
              </button>
            )}
            <button className={styles.btnOutline} onClick={() => { onClose(); onEdit(item); }}>
              ✏️ Edit
            </button>
            <button className={styles.btnOutline} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function WatchTrackerPage() {
  const router = useRouter();

  const [uid,         setUid]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [items,       setItems]       = useState([]);
  const [activeTab,   setActiveTab]   = useState('home');
  const [searchQ,     setSearchQ]     = useState('');
  const [platFilter,  setPlatFilter]  = useState('All');
  const [isDark,      setIsDark]      = useState(false);
  const [detailItem,  setDetailItem]  = useState(null);
  const [showForm,    setShowForm]    = useState(false);
  const [editItem,    setEditItem]    = useState(null);

  /* Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { setUid(user.uid); setAuthLoading(false); }
      else      { router.push('/login'); }
    });
    return unsub;
  }, [router]);

  /* Load from Firestore */
  useEffect(() => {
    if (!uid) return;
    (async () => {
      setLoading(true);
      try {
        const q    = query(collection(db, `users/${uid}/watchtracker`), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [uid]);

  /* Filtered items */
  const filtered = useMemo(() => items.filter(x => {
    const okPlat   = platFilter === 'All' || x.platform === platFilter;
    const q        = searchQ.trim().toLowerCase();
    const okSearch = !q || x.title.toLowerCase().includes(q) || (x.genre || '').toLowerCase().includes(q);
    return okPlat && okSearch;
  }), [items, platFilter, searchQ]);

  const watching  = filtered.filter(x => x.status === 'watching');
  const watchlist = filtered.filter(x => x.status === 'watchlist');
  const watched   = filtered.filter(x => x.status === 'watched');
  const upcoming  = filtered.filter(x => x.status === 'upcoming');

  /* Save (add / edit) */
  const saveItem = async form => {
    if (!uid) return;
    setSaving(true);
    try {
      const data = {
        title:         form.title.trim(),
        type:          form.type,
        emoji:         form.emoji || '🎬',
        posterUrl:     form.posterUrl?.trim() || '',
        platform:      form.platform,
        genre:         form.genre,
        year:          form.year,
        desc:          form.desc?.trim() || '',
        seasons:       form.seasons       ? Number(form.seasons)       : null,
        currentSeason: form.currentSeason ? Number(form.currentSeason) : 0,
        currentEp:     form.currentEp     ? Number(form.currentEp)     : 0,
        totalEp:       form.totalEp       ? Number(form.totalEp)       : null,
        nextEp:        form.nextEp  || null,
        nextDate:      form.nextDate || null,
        status:        form.status,
        progress:      Number(form.progress) || 0,
        updatedAt:     serverTimestamp(),
      };

      if (editItem) {
        await updateDoc(doc(db, `users/${uid}/watchtracker`, editItem.id), data);
        setItems(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data, id: editItem.id } : x));
      } else {
        const ref = await addDoc(collection(db, `users/${uid}/watchtracker`), {
          ...data, createdAt: serverTimestamp(),
        });
        setItems(prev => [{ id: ref.id, ...data }, ...prev]);
      }
      setShowForm(false); setEditItem(null);
    } catch (e) {
      console.error(e); alert('Save failed: ' + e.message);
    }
    setSaving(false);
  };

  /* Delete */
  const deleteItem = async id => {
    if (!uid || !confirm('Delete this entry?')) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/watchtracker`, id));
      setItems(prev => prev.filter(x => x.id !== id));
      if (detailItem?.id === id) setDetailItem(null);
    } catch (e) { console.error(e); }
  };

  /* Change status */
  const changeStatus = async (id, newStatus) => {
    if (!uid) return;
    setSaving(true);
    try {
      const extra = newStatus === 'watched' ? { progress: 100 } : {};
      await updateDoc(doc(db, `users/${uid}/watchtracker`, id), {
        status: newStatus, ...extra, updatedAt: serverTimestamp(),
      });
      setItems(prev  => prev.map(x => x.id === id ? { ...x, status: newStatus, ...extra } : x));
      setDetailItem(p => p?.id === id ? { ...p, status: newStatus, ...extra } : p);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const openEdit = item => { setEditItem(item); setShowForm(true); };
  const openAdd  = ()   => { setEditItem(null);  setShowForm(true); };

  /* Loading */
  if (authLoading || loading) return (
    <div className={styles.loadScreen}>
      <Spinner />
      <p>{authLoading ? 'Checking login…' : 'Loading your tracker…'}</p>
    </div>
  );

  const TABS = [
    { id: 'home',      label: '🏠 Home' },
    { id: 'watching',  label: `▶️ Watching${watching.length  ? ` (${watching.length})`  : ''}` },
    { id: 'watchlist', label: `📋 Watchlist${watchlist.length ? ` (${watchlist.length})` : ''}` },
    { id: 'upcoming',  label: `🗓 Upcoming${upcoming.length  ? ` (${upcoming.length})`  : ''}` },
    { id: 'watched',   label: `✅ Watched${watched.length    ? ` (${watched.length})`   : ''}` },
  ];

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Dashboard</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🎬</div>
          <span>WatchTracker</span>
        </div>
        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            placeholder="Search title or genre…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          {searchQ && (
            <button className={styles.searchClear} onClick={() => setSearchQ('')}>✕</button>
          )}
        </div>
        <button className={styles.addBtn} onClick={openAdd}>+ Add</button>
        <button className={styles.themeBtn} onClick={() => setIsDark(d => !d)}>
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabOn : ''}`}
            onClick={() => setActiveTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className={styles.content}>

        {/* Platform filter strip */}
        <div className={styles.filterStrip}>
          {['All', ...PLATFORMS].map(p => (
            <button
              key={p}
              className={`${styles.filterPill} ${platFilter === p ? styles.filterPillOn : ''}`}
              onClick={() => setPlatFilter(p)}
            >{p}</button>
          ))}
        </div>

        {/* ── HOME ── */}
        {activeTab === 'home' && (
          <>
            {/* Stats */}
            <div className={styles.stats}>
              {[
                { n: watching.length,  l: 'Watching',  ico: '▶️' },
                { n: watchlist.length, l: 'Watchlist', ico: '📋' },
                { n: upcoming.length,  l: 'Upcoming',  ico: '🗓' },
                { n: watched.length,   l: 'Watched',   ico: '✅' },
              ].map(s => (
                <div key={s.l} className={styles.stat} onClick={() => setActiveTab(s.l.toLowerCase())}>
                  <div className={styles.statIco}>{s.ico}</div>
                  <div className={styles.statNum}>{s.n}</div>
                  <div className={styles.statLbl}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Continue watching */}
            {watching.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>▶️ Continue Watching</h2>
                </div>
                <div className={styles.grid}>
                  {watching.map(item => (
                    <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming with countdown */}
            {upcoming.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>🗓 Coming Soon</h2>
                </div>
                <div className={styles.upcomingList}>
                  {upcoming.map(item => (
                    <UpcomingRow key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
                  ))}
                </div>
              </section>
            )}

            {/* Watchlist preview */}
            {watchlist.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>📋 Watchlist</h2>
                  <button className={styles.seeAll} onClick={() => setActiveTab('watchlist')}>
                    See all {watchlist.length} →
                  </button>
                </div>
                <div className={styles.grid}>
                  {watchlist.slice(0, 8).map(item => (
                    <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
                  ))}
                </div>
              </section>
            )}

            {/* Empty */}
            {items.length === 0 && (
              <div className={styles.empty}>
                <div className={styles.emptyIco}>🎬</div>
                <div className={styles.emptyTitle}>Nothing added yet</div>
                <p className={styles.emptySub}>Press <strong>+ Add</strong> to start tracking movies and shows.</p>
                <button className={styles.btnPrimary} onClick={openAdd}>+ Add First Entry</button>
              </div>
            )}
          </>
        )}

        {/* ── WATCHING ── */}
        {activeTab === 'watching' && (
          <section className={styles.section}>
            {watching.length === 0
              ? <div className={styles.empty}><div className={styles.emptyIco}>▶️</div><div className={styles.emptyTitle}>Nothing being watched</div><p className={styles.emptySub}>Move something from Watchlist to start watching.</p></div>
              : <div className={styles.grid}>{watching.map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}</div>
            }
          </section>
        )}

        {/* ── WATCHLIST ── */}
        {activeTab === 'watchlist' && (
          <section className={styles.section}>
            {watchlist.length === 0
              ? <div className={styles.empty}><div className={styles.emptyIco}>📋</div><div className={styles.emptyTitle}>Watchlist is empty</div><p className={styles.emptySub}>Add movies and shows you want to watch.</p></div>
              : <div className={styles.grid}>{watchlist.map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}</div>
            }
          </section>
        )}

        {/* ── UPCOMING ── */}
        {activeTab === 'upcoming' && (
          <section className={styles.section}>
            {upcoming.length === 0
              ? <div className={styles.empty}><div className={styles.emptyIco}>🗓</div><div className={styles.emptyTitle}>No upcoming entries</div><p className={styles.emptySub}>Add entries with status "Upcoming" and a release date to see countdowns.</p></div>
              : (
                <div className={styles.upcomingList}>
                  {upcoming
                    .sort((a, b) => {
                      if (!a.nextDate) return 1;
                      if (!b.nextDate) return -1;
                      return new Date(a.nextDate) - new Date(b.nextDate);
                    })
                    .map(item => (
                      <UpcomingRow key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
                    ))
                  }
                </div>
              )
            }
          </section>
        )}

        {/* ── WATCHED ── */}
        {activeTab === 'watched' && (
          <section className={styles.section}>
            {watched.length === 0
              ? <div className={styles.empty}><div className={styles.emptyIco}>✅</div><div className={styles.emptyTitle}>Nothing completed</div><p className={styles.emptySub}>Mark items as watched to see them here.</p></div>
              : <div className={styles.grid}>{watched.map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}</div>
            }
          </section>
        )}

      </div>{/* end content */}

      {/* ── MODALS ── */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onStatusChange={changeStatus}
          onEdit={openEdit}
          saving={saving}
        />
      )}
      {showForm && (
        <FormModal
          editItem={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={saveItem}
          saving={saving}
        />
      )}
    </div>
  );
}
