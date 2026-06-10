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
   CONSTANTS
══════════════════════════════════════════════ */
const PLATFORMS  = ['Netflix', 'Prime', 'Disney+', 'Hotstar', 'Sony', 'Zee5', 'Jio', 'Apple TV+', 'HBO', 'Theater', 'Other'];
const GENRES     = ['Crime Thriller', 'Crime Drama', 'Action Thriller', 'Action Drama', 'Comedy Drama', 'Drama', 'Horror Comedy', 'Sci-Fi Horror', 'Romance', 'Documentary', 'Other'];
const TYPES      = ['Series', 'Movie'];
const STATUSES   = ['watchlist', 'watching', 'watched', 'upcoming'];
const EMOJIS     = ['🎬','🔫','⚔️','🕵️','📈','👻','🚔','💥','🐅','❤️','😂','👑','🔥','🎭'];

const PLATFORM_CLASS = {
  Netflix: 'badgeNetflix', Prime: 'badgePrime', 'Disney+': 'badgeDisney',
  Hotstar: 'badgeHotstar', Sony: 'badgeSony', Zee5: 'badgeZee5',
  Jio: 'badgeJio', 'Apple TV+': 'badgeApple', HBO: 'badgeHBO', Theater: 'badgeTheater',
};

const EMPTY_FORM = {
  title: '', type: 'Series', emoji: '🎬', posterUrl: '', platform: 'Netflix',
  genre: 'Drama', year: '2026',
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
  return <div className={styles.spinner}><div className={styles.spinnerInner} /></div>;
}

/* ══════════════════════════════════════════════
   MEDIA CARD (ENHANCED LAYOUT)
══════════════════════════════════════════════ */
function MediaCard({ item, onClick, onEdit, onDelete }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={styles.mediaCard}>
      <div className={styles.cardPosterPlaceholder} onClick={() => onClick(item)}>
        {item.posterUrl && !imgError ? (
          <img 
            src={item.posterUrl} 
            alt={item.title} 
            className={styles.cardPosterImg} 
            loading="lazy" 
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={styles.gradientFallbackContainer}>
            <span className={styles.cardEmojiFallback}>{item.emoji}</span>
          </div>
        )}
        <div className={styles.cardPlatformFloatingTag}>{item.platform}</div>
      </div>
      {item.status === 'watched' && <div className={styles.watchedOverlay}>✓ Completed</div>}
      <div className={styles.cardBody} onClick={() => onClick(item)}>
        <div className={styles.cardTitle}>{item.title}</div>
        <div className={styles.cardMeta}>
          <span className={`${styles.badge} ${styles.badgeType}`}>{item.genre}</span>
          <span className={`${styles.badge} ${styles.badgeYear}`}>{item.year}</span>
        </div>
        
        {item.status === 'watching' && (
          <div className={styles.progressContainerBlock}>
            <div className={styles.progressLabelRow}>
              <span>Progress</span>
              <span>{item.progress || 0}%</span>
            </div>
            <div className={styles.cardProgress}>
              <div className={styles.cardProgressFill} style={{ width: `${item.progress || 0}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className={styles.cardFooterActions}>
        <button className={styles.cardEditBtn} onClick={e => { e.stopPropagation(); onEdit(item); }} title="Edit Entry">✏️ Edit</button>
        <button className={styles.cardDeleteBtn} onClick={e => { e.stopPropagation(); onDelete(item.id); }} title="Delete Entry">🗑</button>
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
          {editItem ? '✏️ Edit Media Log' : '➕ Add To Hub'}
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Poster Image URL</label>
          <input 
            className={styles.formInput} 
            value={form.posterUrl || ''} 
            onChange={e => set('posterUrl', e.target.value)} 
            placeholder="https://images.unsplash.com/photo-example.jpg" 
          />
          {form.posterUrl && (
            <div className={styles.livePreviewContainer}>
              <p className={styles.previewLabel}>Live Stream Engine Preview:</p>
              <img 
                src={form.posterUrl} 
                alt="Live Preview" 
                className={styles.formLivePreview} 
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          )}
        </div>

        {!form.posterUrl && (
          <div className={styles.formField}>
            <label className={styles.formLabel}>Fallback Avatar Emoji</label>
            <div className={styles.emojiGrid}>
              {EMOJIS.map(e => (
                <button
                  key={e}
                  type="button"
                  className={`${styles.emojiBtn} ${form.emoji === e ? styles.emojiActive : ''}`}
                  onClick={() => set('emoji', e)}
                >{e}</button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.formField}>
          <label className={styles.formLabel}>Title *</label>
          <input className={styles.formInput} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Stranger Things" />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Streaming Type</label>
            <select className={styles.formSelect} value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Network Platform</label>
            <select className={styles.formSelect} value={form.platform} onChange={e => set('platform', e.target.value)}>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Genre Spectrum</label>
            <select className={styles.formSelect} value={form.genre} onChange={e => set('genre', e.target.value)}>
              {GENRES.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Launch Year</label>
            <input className={styles.formInput} value={form.year} onChange={e => set('year', e.target.value)} placeholder="2026" />
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Status Matrix</label>
          <div className={styles.statusChips}>
            {STATUSES.map(s => (
              <button type="button" key={s} className={`${styles.statusChip} ${form.status === s ? styles.statusChipActive : ''}`} onClick={() => set('status', s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {form.type === 'Series' && (
          <>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Total Seasons</label>
                <input className={styles.formInput} type="number" value={form.seasons || ''} onChange={e => set('seasons', e.target.value)} placeholder="5" />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Current Season</label>
                <input className={styles.formInput} type="number" value={form.currentSeason || ''} onChange={e => set('currentSeason', e.target.value)} placeholder="1" />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Current Episode</label>
                <input className={styles.formInput} type="number" value={form.currentEp || ''} onChange={e => set('currentEp', e.target.value)} placeholder="3" />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Episodes Inside Season</label>
                <input className={styles.formInput} type="number" value={form.totalEp || ''} onChange={e => set('totalEp', e.target.value)} placeholder="8" />
              </div>
            </div>
          </>
        )}

        {form.status === 'watching' && (
          <div className={styles.formField}>
            <label className={styles.formLabel}>Timeline Progress Tracker — {form.progress}%</label>
            <input className={styles.formRange} type="range" min="0" max="100" value={form.progress}
              onChange={e => set('progress', Number(e.target.value))} />
          </div>
        )}

        <div className={styles.formActions}>
          <button type="button" className={styles.modalBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={`${styles.modalBtn} ${styles.primary}`} onClick={handleSubmit} disabled={saving}>
            {saving ? <><Spinner /> Storing...</> : (editItem ? '✓ Save Layout' : '🧬 Append Log')}
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
        <div className={styles.modalLayoutHero}>
          {item.posterUrl ? (
            <img src={item.posterUrl} alt={item.title} className={styles.modalHeroImg} />
          ) : (
            <div className={styles.modalEmojiBig}>{item.emoji}</div>
          )}
        </div>
        <div className={styles.modalTitle}>{item.title}</div>
        <div className={styles.modalBadges}>
          <PlatformBadge platform={item.platform} />
          <span className={`${styles.badge} ${styles.badgeType}`}>{item.type}</span>
          {item.genre && <span className={`${styles.badge} ${styles.badgeType}`}>{item.genre}</span>}
          <StatusBadge status={item.status} />
        </div>
        {item.desc && <p className={styles.modalDesc}>{item.desc}</p>}

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
          <button className={styles.modalBtn} onClick={() => { onClose(); onEdit(item); }}>✏️ Edit</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN CONTAINER ENGINE
══════════════════════════════════════════════ */
export default function WatchTrackerPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [searchQ, setSearchQ] = useState('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState('All');
  const [isDark, setIsDark] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) setUid(user.uid);
      else router.push('/login');
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      try {
        const q = query(collection(db, `users/${uid}/watchtracker`), orderBy('createdAt', 'desc'));
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

  // Master Filter Engine (Search + Toolbar Toggle Context)
  const filteredItems = useMemo(() => {
    return items.filter(x => {
      const matchesPlatform = selectedPlatformFilter === 'All' || x.platform === selectedPlatformFilter;
      const matchesSearch = !searchQ.trim() || 
        x.title.toLowerCase().includes(searchQ.toLowerCase()) ||
        (x.genre || '').toLowerCase().includes(searchQ.toLowerCase());
      return matchesPlatform && matchesSearch;
    });
  }, [items, selectedPlatformFilter, searchQ]);

  const watchlist = filteredItems.filter(x => x.status === 'watchlist');
  const watching  = filteredItems.filter(x => x.status === 'watching');
  const watched   = filteredItems.filter(x => x.status === 'watched');
  const upcoming  = filteredItems.filter(x => x.status === 'upcoming');

  const saveItem = async (form) => {
    if (!uid) return;
    setSaving(true);
    try {
      const data = {
        title: form.title.trim(),
        type: form.type,
        emoji: form.emoji || '🎬',
        posterUrl: form.posterUrl?.trim() || '',
        platform: form.platform,
        genre: form.genre,
        year: form.year,
        desc: form.desc || '',
        seasons: form.seasons ? Number(form.seasons) : null,
        currentSeason: form.currentSeason ? Number(form.currentSeason) : 0,
        currentEp: form.currentEp ? Number(form.currentEp) : 0,
        totalEp: form.totalEp ? Number(form.totalEp) : null,
        status: form.status,
        progress: Number(form.progress) || 0,
        updatedAt: serverTimestamp(),
      };

      if (editItem) {
        await updateDoc(doc(db, `users/${uid}/watchtracker`, editItem.id), data);
        setItems(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data, id: editItem.id } : x));
      } else {
        const ref = await addDoc(collection(db, `users/${uid}/watchtracker`), { ...data, createdAt: serverTimestamp() });
        setItems(prev => [{ id: ref.id, ...data }, ...prev]);
      }
      setShowForm(false);
      setEditItem(null);
    } catch (e) {
      console.error(e);
      alert('Error updating core tracking nodes.');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id) => {
    if (!uid || !confirm('Permanently wipe this media logs asset?')) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/watchtracker`, id));
      setItems(prev => prev.filter(x => x.id !== id));
      if (detailItem?.id === id) setDetailItem(null);
    } catch (e) { console.error(e); }
  };

  const changeStatus = async (id, newStatus) => {
    if (!uid) return;
    try {
      const extra = newStatus === 'watched' ? { progress: 100 } : {};
      await updateDoc(doc(db, `users/${uid}/watchtracker`, id), { status: newStatus, ...extra, updatedAt: serverTimestamp() });
      setItems(prev => prev.map(x => x.id === id ? { ...x, status: newStatus, ...extra } : x));
      setDetailItem(prev => prev?.id === id ? { ...prev, status: newStatus, ...extra } : prev);
    } catch (e) { console.error(e); }
  };

  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const openAdd  = () => { setEditItem(null); setShowForm(true); };

  const HomeTab = () => {
    return (
      <>
        {/* Dynamic Matrix Filter Strip */}
        <div className={styles.platformQuickRowContainer}>
          <p className={styles.toolbarLabel}>Filter Engine Engine:</p>
          <div className={styles.platformToolbarPillsScroll}>
            {['All', ...PLATFORMS].map(plat => (
              <button 
                key={plat}
                className={`${styles.toolbarFilterPillBtn} ${selectedPlatformFilter === plat ? styles.activeToolbarPill : ''}`}
                onClick={() => setSelectedPlatformFilter(plat)}
              >
                {plat}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.statsRow}>
          {[{ num: watching.length, label: 'Active Streams' },
            { num: watchlist.length, label: 'Unopened Vault' },
            { num: watched.length, label: 'Binge Completed' },
            { num: upcoming.length, label: 'Radar Pipeline' }].map(s => (
            <div key={s.label} className={styles.statChip}>
              <div className={styles.statNum}>{s.num}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {watching.length > 0 && (
          <>
            <div className={styles.sectionHeader}><div className={styles.sectionTitle}>▶ In Midst of Streaming</div></div>
            <div className={styles.cardsGrid}>
              {watching.map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}
            </div>
          </>
        )}

        {watchlist.length > 0 && (
          <>
            <div className={styles.sectionHeader}><div className={styles.sectionTitle}>📋 Primary Watchlist Vault</div></div>
            <div className={styles.cardsGrid}>
              {watchlist.slice(0, 12).map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}
            </div>
          </>
        )}
      </>
    );
  };

  if (loading) return <div className={styles.loadingScreen}><Spinner /><p>Initializing Advanced Sync Engine...</p></div>;

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Portal</button>
        <div className={styles.brand}><div className={styles.brandIcon}>🚀</div>WatchTracker Apex</div>
        <div className={styles.searchWrap}>
          <input className={styles.searchInput} placeholder="Query dynamic title, genre, attributes..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </div>
        <button className={styles.addNewBtn} onClick={openAdd}>+ Mount Asset</button>
        <button className={styles.themeBtn} onClick={() => setIsDark(!isDark)}>{isDark ? '☀️' : '🌙'}</button>
      </div>

      <div className={styles.tabs}>
        {[['home', '📊 System Hub'], ['watchlist', '📋 Queue List'], ['upcoming', '🗓 Pipeline Radar'], ['watched', '✅ Ledger Vault']].map(([id, label]) => (
          <button key={id} className={`${styles.tabBtn} ${activeTab === id ? styles.active : ''}`} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'home' && <HomeTab />}
        {activeTab !== 'home' && (
          <div className={styles.cardsGrid}>
            {activeTab === 'watchlist' && watchlist.map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}
            {activeTab === 'upcoming' && upcoming.map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}
            {activeTab === 'watched' && watched.map(item => <MediaCard key={item.id} item={item} onClick={setDetailItem} onEdit={openEdit} onDelete={deleteItem} />)}
          </div>
        )}
      </div>

      {detailItem && <DetailModal item={detailItem} onClose={() => setDetailItem(null)} onStatusChange={changeStatus} onEdit={openEdit} saving={saving} />}
      {showForm && <FormModal editItem={editItem} onClose={() => setShowForm(false)} onSave={saveItem} saving={saving} />}
    </div>
  );
}
