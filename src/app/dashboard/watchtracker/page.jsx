'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import styles from './watchtracker.module.css';

/* ══════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════ */
const PLATFORMS  = ['Netflix', 'Prime', 'Disney+', 'Hotstar', 'Sony', 'Zee5', 'Jio', 'Apple TV+', 'HBO', 'Theater', 'Other'];
const GENRES     = ['Crime Thriller', 'Crime Drama', 'Action Thriller', 'Action Drama', 'Comedy Drama', 'Drama', 'Horror Comedy', 'Sci-Fi Horror', 'Romance', 'Documentary', 'Other'];
const TYPES      = ['Series', 'Movie'];
const STATUSES   = ['watchlist', 'watching', 'watched', 'upcoming'];
const EMOJIS     = ['🎬','🔫','⚔️','🕵️','📈','🌾','👻','📚','🚔','💥','🐅','🖨','👁','🎯','🌿','❤️','😂','👑','🧠','🔥','🎭','🎪'];

const PLATFORM_CLASS = {
  Netflix: 'badgeNetflix', Prime: 'badgePrime', 'Disney+': 'badgeDisney',
  Hotstar: 'badgeHotstar', Sony: 'badgeSony', Zee5: 'badgeZee5',
  Jio: 'badgeJio', 'Apple TV+': 'badgeApple', HBO: 'badgeHBO', Theater: 'badgeTheater',
};

const EMPTY_FORM = {
  title: '', type: 'Series', emoji: '🎬', platform: 'Netflix',
  genre: 'Drama', year: new Date().getFullYear().toString(),
  desc: '', seasons: '', currentSeason: '', currentEp: '',
  totalEp: '', nextEp: '', nextDate: '', status: 'watchlist', progress: 0,
};

/* ══════════════════════════════════════════════
   SMALL SHARED COMPONENTS
══════════════════════════════════════════════ */
function PlatformBadge({ platform }) {
  const cls = PLATFORM_CLASS[platform] || 'badgeType';
  return <span className={`${styles.badge} ${styles[cls]}`}>{platform}</span>;
}

function StatusBadge({ status }) {
  const map = {
    watching: ['badgeWatching', 'Watching'],
    watched:  ['badgeWatched',  'Watched'],
    upcoming: ['badgeUpcoming', 'Upcoming'],
    watchlist:['badgeType',     'Watchlist'],
  };
  const [cls, label] = map[status] || map.watchlist;
  return <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>;
}

function Spinner() {
  return <div className={styles.spinner}><div className={styles.spinnerInner}/></div>;
}

/* ══════════════════════════════════════════════
   MEDIA CARD
══════════════════════════════════════════════ */
function MediaCard({ item, onClick, onEdit, onDelete }) {
  return (
    <div className={styles.mediaCard}>
      <div className={styles.cardPosterPlaceholder} onClick={() => onClick(item)}>
        {item.emoji}
      </div>
      {item.status === 'watched' && <div className={styles.watchedOverlay}>✓</div>}
      <div className={styles.cardBody} onClick={() => onClick(item)}>
        <div className={styles.cardTitle}>{item.title}</div>
        <div className={styles.cardMeta}>
          <PlatformBadge platform={item.platform} />
          <span className={`${styles.badge} ${styles.badgeType}`}>{item.type}</span>
        </div>
        <StatusBadge status={item.status} />
        {item.nextDate && <div className={styles.cardDate}>🗓 {item.nextDate}</div>}
        {item.status === 'watching' && (
          <div className={styles.cardProgress}>
            <div className={styles.cardProgressFill} style={{ width: `${item.progress || 0}%` }} />
          </div>
        )}
      </div>
      <div className={styles.cardFooterActions}>
        <button className={styles.cardEditBtn} onClick={e => { e.stopPropagation(); onEdit(item); }} title="Edit">✏️</button>
        <button className={styles.cardDeleteBtn} onClick={e => { e.stopPropagation(); onDelete(item.id); }} title="Delete">🗑</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ADD / EDIT FORM MODAL
══════════════════════════════════════════════ */
function FormModal({ editItem, onClose, onSave, saving }) {
  const [form, setForm] = useState(editItem ? { ...editItem } : { ...EMPTY_FORM });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = () => {
    if (!form.title.trim()) return alert('Title required!');
    onSave(form);
  };

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.modal} ${styles.formModal}`}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <div className={styles.formModalTitle}>
          {editItem ? '✏️ Edit Entry' : '➕ Add New'}
        </div>

        {/* EMOJI PICKER */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Emoji / Icon</label>
          <div className={styles.emojiGrid}>
            {EMOJIS.map(e => (
              <button
                key={e}
                className={`${styles.emojiBtn} ${form.emoji === e ? styles.emojiActive : ''}`}
                onClick={() => set('emoji', e)}
              >{e}</button>
            ))}
          </div>
        </div>

        {/* TITLE */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Title *</label>
          <input className={styles.formInput} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Sacred Games" />
        </div>

        {/* TYPE + PLATFORM */}
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Type</label>
            <select className={styles.formSelect} value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Platform</label>
            <select className={styles.formSelect} value={form.platform} onChange={e => set('platform', e.target.value)}>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* GENRE + YEAR */}
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Genre</label>
            <select className={styles.formSelect} value={form.genre} onChange={e => set('genre', e.target.value)}>
              {GENRES.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Year</label>
            <input className={styles.formInput} value={form.year} onChange={e => set('year', e.target.value)} placeholder="2024" />
          </div>
        </div>

        {/* STATUS */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Status</label>
          <div className={styles.statusChips}>
            {STATUSES.map(s => (
              <button key={s} className={`${styles.statusChip} ${form.status === s ? styles.statusChipActive : ''}`} onClick={() => set('status', s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* SERIES ONLY FIELDS */}
        {form.type === 'Series' && (
          <>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Total Seasons</label>
                <input className={styles.formInput} type="number" value={form.seasons} onChange={e => set('seasons', e.target.value)} placeholder="2" />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Current Season</label>
                <input className={styles.formInput} type="number" value={form.currentSeason} onChange={e => set('currentSeason', e.target.value)} placeholder="1" />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Current Ep</label>
                <input className={styles.formInput} type="number" value={form.currentEp} onChange={e => set('currentEp', e.target.value)} placeholder="4" />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Total Ep / Season</label>
                <input className={styles.formInput} type="number" value={form.totalEp} onChange={e => set('totalEp', e.target.value)} placeholder="8" />
              </div>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Next Episode Info</label>
              <input className={styles.formInput} value={form.nextEp} onChange={e => set('nextEp', e.target.value)} placeholder="Season 2, Ep 1" />
            </div>
          </>
        )}

        {/* PROGRESS (watching only) */}
        {form.status === 'watching' && (
          <div className={styles.formField}>
            <label className={styles.formLabel}>Progress — {form.progress}%</label>
            <input className={styles.formRange} type="range" min="0" max="100" value={form.progress}
              onChange={e => set('progress', Number(e.target.value))} />
          </div>
        )}

        {/* NEXT DATE */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Next Release / Release Date</label>
          <input className={styles.formInput} value={form.nextDate} onChange={e => set('nextDate', e.target.value)} placeholder="e.g. Jan 2025 or Aug 15, 2024" />
        </div>

        {/* DESCRIPTION */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Description</label>
          <textarea className={styles.formTextarea} value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="Short description..." rows={3} />
        </div>

        {/* ACTIONS */}
        <div className={styles.formActions}>
          <button className={styles.modalBtn} onClick={onClose}>Cancel</button>
          <button className={`${styles.modalBtn} ${styles.primary}`} onClick={handleSubmit} disabled={saving}>
            {saving ? <><Spinner /> Saving...</> : (editItem ? '✓ Update' : '+ Add')}
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
  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>{item.emoji}</div>
        <div className={styles.modalTitle}>{item.title}</div>
        <div className={styles.modalBadges}>
          <PlatformBadge platform={item.platform} />
          <span className={`${styles.badge} ${styles.badgeType}`}>{item.type}</span>
          {item.year  && <span className={`${styles.badge} ${styles.badgeType}`}>{item.year}</span>}
          {item.genre && <span className={`${styles.badge} ${styles.badgeType}`}>{item.genre}</span>}
          <StatusBadge status={item.status} />
        </div>
        {item.desc && <p className={styles.modalDesc}>{item.desc}</p>}

        {item.type === 'Series' && item.seasons && (
          <div className={styles.modalSeasonInfo}>
            📺 <strong>{item.seasons} Season{item.seasons > 1 ? 's' : ''}</strong>
            {item.currentSeason > 0 && ` · S${item.currentSeason}E${item.currentEp}`}
            {item.nextEp   && <> · Next: <strong>{item.nextEp}</strong></>}
            {item.nextDate && <> · Coming: <strong>{item.nextDate}</strong></>}
          </div>
        )}
        {item.status === 'watching' && (
          <div className={styles.modalSeasonInfo}>
            ▶ Progress: <strong>{item.progress || 0}%</strong>
            <div className={styles.cardProgress} style={{ marginTop: 8 }}>
              <div className={styles.cardProgressFill} style={{ width: `${item.progress || 0}%` }} />
            </div>
          </div>
        )}
        {item.nextDate && item.type === 'Movie' && (
          <div className={styles.modalSeasonInfo}>🗓 Release: <strong>{item.nextDate}</strong></div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
          📍 Available on: <strong>{item.platform}</strong>
        </div>

        <div className={styles.modalActions}>
          {item.status === 'watchlist' && (
            <button className={`${styles.modalBtn} ${styles.primary}`} onClick={() => onStatusChange(item.id, 'watching')} disabled={saving}>
              ▶ Start Watching
            </button>
          )}
          {item.status === 'watching' && (
            <button className={`${styles.modalBtn} ${styles.greenBtn}`} onClick={() => onStatusChange(item.id, 'watched')} disabled={saving}>
              ✓ Mark Watched
            </button>
          )}
          {item.status === 'upcoming' && (
            <button className={`${styles.modalBtn} ${styles.primary}`} onClick={() => onStatusChange(item.id, 'watchlist')} disabled={saving}>
              + Add to Watchlist
            </button>
          )}
          <button className={styles.modalBtn} onClick={() => { onClose(); onEdit(item); }}>✏️ Edit</button>
          <button className={styles.modalBtn} onClick={onClose}>Close</button>
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

  const [uid,        setUid]        = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [items,      setItems]      = useState([]);    // all Firestore docs
  const [activeTab,  setActiveTab]  = useState('home');
  const [searchQ,    setSearchQ]    = useState('');
  const [filter,     setFilter]     = useState('all');
  const [isDark,     setIsDark]     = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [editItem,   setEditItem]   = useState(null);  // null = add mode

  /* ── AUTH ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { setUid(user.uid); }
      else       { router.push('/login'); }
    });
    return unsub;
  }, [router]);

  /* ── FIRESTORE LOAD ── */
  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      setLoading(true);
      try {
        const q    = query(collection(db, `users/${uid}/watchtracker`), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  /* ── DERIVED LISTS ── */
  const watchlist = items.filter(x => x.status === 'watchlist');
  const watching  = items.filter(x => x.status === 'watching');
  const watched   = items.filter(x => x.status === 'watched');
  const upcoming  = items.filter(x => x.status === 'upcoming');

  /* ── SEARCH ── */
  const searchResults = useCallback(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.toLowerCase();
    return items.filter(x =>
      x.title.toLowerCase().includes(q) ||
      (x.genre  || '').toLowerCase().includes(q) ||
      (x.platform || '').toLowerCase().includes(q)
    );
  }, [searchQ, items]);

  /* ── CRUD ── */
  const saveItem = async (form) => {
    if (!uid) return;
    setSaving(true);
    try {
      const data = {
        title:         form.title.trim(),
        type:          form.type,
        emoji:         form.emoji,
        platform:      form.platform,
        genre:         form.genre,
        year:          form.year,
        desc:          form.desc,
        seasons:       form.seasons        ? Number(form.seasons)        : null,
        currentSeason: form.currentSeason  ? Number(form.currentSeason)  : 0,
        currentEp:     form.currentEp      ? Number(form.currentEp)      : 0,
        totalEp:       form.totalEp        ? Number(form.totalEp)        : null,
        nextEp:        form.nextEp   || null,
        nextDate:      form.nextDate || null,
        status:        form.status,
        progress:      Number(form.progress) || 0,
        updatedAt:     serverTimestamp(),
      };

      if (editItem) {
        // UPDATE
        await updateDoc(doc(db, `users/${uid}/watchtracker`, editItem.id), data);
        setItems(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data, id: editItem.id } : x));
      } else {
        // CREATE
        const ref = await addDoc(collection(db, `users/${uid}/watchtracker`), {
          ...data, createdAt: serverTimestamp(),
        });
        setItems(prev => [{ id: ref.id, ...data }, ...prev]);
      }
      setShowForm(false);
      setEditItem(null);
    } catch (e) {
      console.error(e);
      alert('Error saving. Check console.');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id) => {
    if (!uid || !confirm('Delete this entry?')) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/watchtracker`, id));
      setItems(prev => prev.filter(x => x.id !== id));
      if (detailItem?.id === id) setDetailItem(null);
    } catch (e) { console.error(e); }
  };

  const changeStatus = async (id, newStatus) => {
    if (!uid) return;
    setSaving(true);
    try {
      const extra = newStatus === 'watched' ? { progress: 100 } : newStatus === 'watching' ? { progress: 5 } : {};
      await updateDoc(doc(db, `users/${uid}/watchtracker`, id), { status: newStatus, ...extra, updatedAt: serverTimestamp() });
      setItems(prev => prev.map(x => x.id === id ? { ...x, status: newStatus, ...extra } : x));
      setDetailItem(prev => prev?.id === id ? { ...prev, status: newStatus, ...extra } : prev);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const openAdd  = ()     => { setEditItem(null);  setShowForm(true); };

  /* ════════════════════════════════════════════
     TAB: HOME
  ════════════════════════════════════════════ */
  const HomeTab = () => {
    const results = searchResults();
    return (
      <>
        {/* Stats */}
        <div className={styles.statsRow}>
          {[
            { num: watching.length,  label: 'Watching' },
            { num: watchlist.length, label: 'Watchlist' },
            { num: watched.length,   label: 'Completed' },
            { num: upcoming.length,  label: 'Upcoming' },
          ].map(s => (
            <div key={s.label} className={styles.statChip}>
              <div className={styles.statNum}>{s.num}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search results */}
        {searchQ && (
          <div className={styles.searchResults}>
            <div className={styles.searchHeader}>
              &ldquo;{searchQ}&rdquo; — {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
            {results.length === 0
              ? <div className={styles.noResults}>No results found</div>
              : results.map(r => (
                  <div key={r.id} className={styles.searchResultItem} onClick={() => setDetailItem(r)}>
                    <div className={styles.srEmoji}>{r.emoji}</div>
                    <div className={styles.srInfo}>
                      <div className={styles.srTitle}>{r.title}</div>
                      <div className={styles.srDesc}>{r.type} · {r.genre} · {r.year}</div>
                    </div>
                    <div className={styles.srRight}>
                      <PlatformBadge platform={r.platform} />
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))
            }
          </div>
        )}

        {/* Continue watching */}
        {watching.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>▶ Continue Watching</div>
            </div>
            <div className={styles.cardsGrid}>
              {watching.map(item => (
                <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
              ))}
            </div>
          </>
        )}

        {/* Watchlist preview */}
        {watchlist.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>📋 Watchlist</div>
              <button className={styles.seeAll} onClick={() => setActiveTab('watchlist')}>See All</button>
            </div>
            <div className={styles.cardsGrid} style={{ marginBottom: 28 }}>
              {watchlist.slice(0, 6).map(item => (
                <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
              ))}
            </div>
          </>
        )}

        {/* Upcoming preview */}
        {upcoming.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>🗓 Upcoming</div>
              <button className={styles.seeAll} onClick={() => setActiveTab('upcoming')}>See All</button>
            </div>
            <div className={styles.cardsGrid} style={{ marginBottom: 28 }}>
              {upcoming.slice(0, 4).map(item => (
                <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
              ))}
            </div>
          </>
        )}

        {/* Empty dashboard */}
        {items.length === 0 && !loading && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎬</div>
            <div className={styles.emptyText}>Nothing added yet</div>
            <div className={styles.emptySub}>Click <strong>+ Add New</strong> to start tracking</div>
          </div>
        )}
      </>
    );
  };

  /* ════════════════════════════════════════════
     TAB: WATCHLIST
  ════════════════════════════════════════════ */
  const WatchlistTab = () => {
    const FILTERS = ['all', 'Series', 'Movie', 'Netflix', 'Prime', 'Sony', 'Zee5'];
    const filtered = watchlist.filter(x =>
      filter === 'all' || x.type === filter || x.platform === filter
    );
    return (
      <>
        <div className={styles.filterRow}>
          {FILTERS.map(f => (
            <button key={f} className={`${styles.filterChip} ${filter === f ? styles.active : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📋</div>
            <div className={styles.emptyText}>Watchlist is empty</div>
            <div className={styles.emptySub}>Add entries using the + Add New button</div>
          </div>
        ) : filtered.map(item => (
          <div key={item.id} className={styles.watchlistItem}>
            <div className={styles.watchlistEmoji} onClick={() => setDetailItem(item)}>{item.emoji}</div>
            <div className={styles.watchlistInfo} onClick={() => setDetailItem(item)}>
              <div className={styles.watchlistTitle}>{item.title}</div>
              <div className={styles.watchlistMeta}>
                {item.type} · <PlatformBadge platform={item.platform} /> · {item.genre}
              </div>
              {item.seasons && (
                <div className={styles.watchlistNext}>
                  📺 {item.seasons} Season{item.seasons > 1 ? 's' : ''} · Next: <strong>{item.nextEp || 'TBA'}</strong>
                </div>
              )}
            </div>
            <div className={styles.watchlistActions}>
              <button className={styles.actionBtn} onClick={() => changeStatus(item.id, 'watching')} disabled={saving}>▶ Start</button>
              <button className={`${styles.actionBtn} ${styles.done}`} onClick={() => changeStatus(item.id, 'watched')} disabled={saving}>✓ Done</button>
              <button className={styles.actionBtn} onClick={() => openEdit(item)}>✏️</button>
              <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => deleteItem(item.id)}>🗑</button>
            </div>
          </div>
        ))}
      </>
    );
  };

  /* ════════════════════════════════════════════
     TAB: UPCOMING
  ════════════════════════════════════════════ */
  const UpcomingTab = () => (
    <>
      <div className={styles.sectionHeader} style={{ marginBottom: 20 }}>
        <div>
          <div className={styles.sectionTitle}>🗓 Upcoming Releases</div>
          <div className={styles.sectionSub}>Movies & series you are waiting for</div>
        </div>
      </div>
      {upcoming.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🗓</div>
          <div className={styles.emptyText}>No upcoming entries</div>
          <div className={styles.emptySub}>Add entries with status &quot;upcoming&quot;</div>
        </div>
      ) : upcoming.map(item => (
        <div key={item.id} className={styles.upcomingItem} onClick={() => setDetailItem(item)}>
          <div className={styles.upcomingDateBox}>
            <div className={styles.upcomingDay}>{item.nextDate?.split(' ')[0] || '?'}</div>
            <div className={styles.upcomingMon}>{item.nextDate?.split(' ')[1]?.replace(',','') || item.year || '—'}</div>
          </div>
          <div className={styles.upcomingInfo}>
            <div className={styles.upcomingTitle}>{item.emoji} {item.title}</div>
            <div className={styles.upcomingDesc}>{item.desc || `${item.type} · ${item.genre}`}</div>
          </div>
          <div className={styles.upcomingRight}>
            <PlatformBadge platform={item.platform} />
            <span className={`${styles.badge} ${styles.badgeType}`}>{item.type}</span>
            <div className={styles.upcomingRowBtns}>
              <button className={styles.addBtn} onClick={e => { e.stopPropagation(); changeStatus(item.id, 'watchlist'); }}>+ Watchlist</button>
              <button className={styles.iconBtn} onClick={e => { e.stopPropagation(); openEdit(item); }}>✏️</button>
              <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={e => { e.stopPropagation(); deleteItem(item.id); }}>🗑</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );

  /* ════════════════════════════════════════════
     TAB: WATCHED
  ════════════════════════════════════════════ */
  const WatchedTab = () => (
    <>
      <div className={styles.sectionHeader} style={{ marginBottom: 16 }}>
        <div>
          <div className={styles.sectionTitle}>✅ Completed</div>
          <div className={styles.sectionSub}>{watched.length} titles finished</div>
        </div>
      </div>
      {watched.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <div className={styles.emptyText}>Nothing watched yet</div>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {watched.map(item => (
            <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />
          ))}
        </div>
      )}
    </>
  );

  /* ════════════════════════════════════════════
     TABS CONFIG
  ════════════════════════════════════════════ */
  const TABS = [
    { id: 'home',      label: '🏠 Home' },
    { id: 'watchlist', label: `📋 Watchlist${watchlist.length ? ` (${watchlist.length})` : ''}` },
    { id: 'upcoming',  label: '🗓 Upcoming', dot: upcoming.length > 0 },
    { id: 'watched',   label: '✅ Watched' },
  ];

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  if (loading) return (
    <div className={styles.loadingScreen}>
      <Spinner />
      <p>Loading your tracker...</p>
    </div>
  );

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>

        {/* Back to Dashboard */}
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>
          ← Dashboard
        </button>

        <div className={styles.brand}>
          <div className={styles.brandIcon}>🎬</div>
          WatchTracker
        </div>

        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            placeholder="Search title, genre, platform..."
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setActiveTab('home'); }}
          />
          <span className={styles.searchIcon}>🔍</span>
        </div>

        {/* Add New Button */}
        <button className={styles.addNewBtn} onClick={openAdd}>
          + Add New
        </button>

        <button className={styles.themeBtn} onClick={() => setIsDark(d => !d)}>
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tabBtn} ${activeTab === t.id ? styles.active : ''}`}
            onClick={() => { setActiveTab(t.id); setSearchQ(''); }}
          >
            {t.label}
            {t.dot && <span className={styles.notifDot} />}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className={styles.content}>
        {activeTab === 'home'      && <HomeTab />}
        {activeTab === 'watchlist' && <WatchlistTab />}
        {activeTab === 'upcoming'  && <UpcomingTab />}
        {activeTab === 'watched'   && <WatchedTab />}
      </div>

      {/* ── DETAIL MODAL ── */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onStatusChange={changeStatus}
          onEdit={openEdit}
          saving={saving}
        />
      )}

      {/* ── FORM MODAL (ADD / EDIT) ── */}
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
