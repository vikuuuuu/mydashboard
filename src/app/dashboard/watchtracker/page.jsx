'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './watchtracker.module.css';

/* ─── STATIC DATA (replace with Firestore later) ─── */
const TRENDING = [
  { id: 1,  title: 'Sacred Games',    type: 'Series', emoji: '🔫', platform: 'Netflix', status: 'watching', progress: 60, seasons: 2, currentSeason: 1, currentEp: 4, totalEp: 8,  year: '2018', genre: 'Crime Thriller',  desc: 'Mumbai cop Sartaj Singh gets an anonymous tip from a gangster, setting off a chain of events involving politics, crime & religion.',  nextEp: 'Season 1, Ep 5', nextDate: null },
  { id: 2,  title: 'Mirzapur',        type: 'Series', emoji: '⚔️', platform: 'Prime',   status: 'watchlist', progress: 0, seasons: 3, currentSeason: 0, currentEp: 0, totalEp: 10, year: '2018', genre: 'Crime Drama',     desc: 'Power, crime and guns rule the badlands of Purvanchal. The Tripathi family controls Mirzapur with an iron fist.',               nextEp: 'Season 3 released', nextDate: '2024' },
  { id: 3,  title: 'The Family Man',  type: 'Series', emoji: '🕵️', platform: 'Prime',   status: 'watched',   progress: 100, seasons: 2, currentSeason: 2, currentEp: 9, totalEp: 9, year: '2021', genre: 'Action Thriller', desc: 'A middle-class man who works as a senior analyst for a special cell of the National Investigation Agency.',                     nextEp: 'Season 3', nextDate: '2025' },
  { id: 4,  title: 'Scam 1992',       type: 'Series', emoji: '📈', platform: 'Sony',    status: 'watched',   progress: 100, seasons: 1, currentSeason: 1, currentEp: 10, totalEp: 10, year: '2020', genre: 'Drama',          desc: 'The story of Harshad Mehta, a stockbroker who single-handedly took the stock exchange to dizzying heights.',                    nextEp: null, nextDate: null },
  { id: 5,  title: 'Panchayat',       type: 'Series', emoji: '🌾', platform: 'Prime',   status: 'watching',  progress: 45, seasons: 3, currentSeason: 3, currentEp: 2, totalEp: 8,  year: '2024', genre: 'Comedy Drama',    desc: 'An engineering graduate reluctantly takes up the post of secretary at a panchayat office in a remote UP village.',              nextEp: 'Season 3, Ep 3', nextDate: null },
  { id: 6,  title: 'Stree 2',         type: 'Movie',  emoji: '👻', platform: 'Theater', status: 'upcoming',  progress: 0,  seasons: null, year: '2024',   genre: 'Horror Comedy',   desc: 'The sequel to the hit horror-comedy where a small town faces a supernatural phenomenon once again.',                            nextEp: null, nextDate: 'Aug 15, 2024' },
  { id: 7,  title: 'Kota Factory',    type: 'Series', emoji: '📚', platform: 'Netflix', status: 'watchlist', progress: 0, seasons: 3, currentSeason: 0, currentEp: 0, totalEp: 5,  year: '2024', genre: 'Drama',           desc: 'Life of students preparing for IIT-JEE in Kota. A realistic portrayal of student pressure and aspirations.',                   nextEp: 'Season 3 out', nextDate: '2024' },
  { id: 8,  title: 'Delhi Crime',     type: 'Series', emoji: '🚔', platform: 'Netflix', status: 'watched',   progress: 100, seasons: 2, currentSeason: 2, currentEp: 6, totalEp: 6, year: '2022', genre: 'Crime Drama',     desc: 'Based on the 2012 Delhi gang rape case, following the Delhi Police as they investigate.',                                        nextEp: 'Season 3', nextDate: '2025' },
];

const UPCOMING = [
  { id: 101, title: 'The Family Man S3', type: 'Series', emoji: '🕵️', platform: 'Prime',   day: '15', month: 'Jan', year: '2025', genre: 'Action Thriller', desc: 'Srikant Tiwari returns for another high-stakes mission balancing family & national security.' },
  { id: 102, title: 'Delhi Crime S3',    type: 'Series', emoji: '🚔', platform: 'Netflix', day: '20', month: 'Feb', year: '2025', genre: 'Crime Drama',     desc: 'DCP Vartika Chaturvedi investigates a new disturbing case in Delhi.' },
  { id: 103, title: 'Pushpa 2',          type: 'Movie',  emoji: '🌿', platform: 'Theater', day: '5',  month: 'Dec', year: '2024', genre: 'Action Drama',    desc: 'Allu Arjun returns as Pushpa Raj in the highly anticipated sequel.' },
  { id: 104, title: 'Kota Factory S4',   type: 'Series', emoji: '📚', platform: 'Netflix', day: '10', month: 'Mar', year: '2025', genre: 'Drama',           desc: 'More students, more pressure, more life lessons from Jeetu Bhaiya.' },
  { id: 105, title: 'Aspirants S2',      type: 'Series', emoji: '🎯', platform: 'Prime',   day: '1',  month: 'Apr', year: '2025', genre: 'Drama',           desc: 'The beloved UPSC drama returns with the next chapter of Abhilash and friends.' },
];

const SEARCH_DB = [
  { id: 201, title: 'Stranger Things S5', type: 'Series', emoji: '👁',  platform: 'Netflix', status: 'upcoming',  seasons: 5, year: '2025', genre: 'Sci-Fi Horror',  desc: 'The final season of the Duffer Brothers supernatural phenomenon.',           nextEp: 'Season 5', nextDate: '2025' },
  { id: 202, title: 'Jawan',              type: 'Movie',  emoji: '💥', platform: 'Netflix', status: 'watchlist', year: '2023', genre: 'Action Thriller', desc: 'A high-octane action thriller featuring Shah Rukh Khan in a dual role.',      nextEp: null, nextDate: null },
  { id: 203, title: 'Animal',             type: 'Movie',  emoji: '🐅', platform: 'Netflix', status: 'watchlist', year: '2023', genre: 'Action Drama',    desc: 'Ranbir Kapoor intense portrayal of a son\'s complicated love for his father.', nextEp: null, nextDate: null },
  { id: 204, title: 'Farzi',              type: 'Series', emoji: '🖨', platform: 'Prime',   status: 'watchlist', seasons: 1, year: '2023', genre: 'Crime Thriller', desc: 'A small-time con artist gets embroiled in a high-stakes game of counterfeiting.', nextEp: 'Season 2 TBA', nextDate: null },
];

const ALL_ITEMS = [...TRENDING, ...SEARCH_DB];

/* ─── HELPERS ─── */
const PLATFORM_CLASS = { Netflix: 'badgeNetflix', Prime: 'badgePrime', Disney: 'badgeDisney', Sony: 'badgeSony', Zee5: 'badgeZee5', Theater: 'badgeTheater', Apple: 'badgeApple', Jio: 'badgeJio', HBO: 'badgeHBO' };

function PlatformBadge({ platform }) {
  const cls = PLATFORM_CLASS[platform] || 'badgeType';
  return <span className={`${styles.badge} ${styles[cls]}`}>{platform}</span>;
}

function StatusBadge({ status }) {
  if (status === 'watching') return <span className={`${styles.badge} ${styles.badgeWatching}`}>Watching</span>;
  if (status === 'watched')  return <span className={`${styles.badge} ${styles.badgeWatched}`}>Watched</span>;
  if (status === 'upcoming') return <span className={`${styles.badge} ${styles.badgeUpcoming}`}>Upcoming</span>;
  return <span className={`${styles.badge} ${styles.badgeType}`}>Watchlist</span>;
}

/* ─── MEDIA CARD ─── */
function MediaCard({ item, onClick }) {
  return (
    <div className={styles.mediaCard} onClick={() => onClick(item)}>
      <div className={styles.cardPosterPlaceholder}>{item.emoji}</div>
      {item.status === 'watched' && <div className={styles.watchedOverlay}>✓</div>}
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>{item.title}</div>
        <div className={styles.cardMeta}>
          <PlatformBadge platform={item.platform} />
          <span className={`${styles.badge} ${styles.badgeType}`}>{item.type}</span>
          {(item.status === 'watching' || item.status === 'watched') && <StatusBadge status={item.status} />}
        </div>
        {item.nextDate && <div className={styles.cardDate}>🗓 {item.nextDate}</div>}
        {item.status === 'watching' && (
          <div className={styles.cardProgress}>
            <div className={styles.cardProgressFill} style={{ width: `${item.progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── MODAL ─── */
function Modal({ item, onClose, onAddWatchlist, onMarkWatching, onMarkWatched, watchlist, watched, watching }) {
  if (!item) return null;
  const inWatchlist  = watchlist.some(x => x.id === item.id);
  const isWatched    = watched.some(x => x.id === item.id);
  const isWatching   = watching.some(x => x.id === item.id);

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
        </div>
        <p className={styles.modalDesc}>{item.desc}</p>

        {item.seasons && (
          <div className={styles.modalSeasonInfo}>
            📺 <strong>{item.seasons} Season{item.seasons > 1 ? 's' : ''}</strong>
            {item.currentSeason > 0 && ` · Currently on S${item.currentSeason}E${item.currentEp}`}
            {item.nextEp   && <> · Next: <strong>{item.nextEp}</strong></>}
            {item.nextDate && <> · Coming: <strong>{item.nextDate}</strong></>}
          </div>
        )}
        {item.nextDate && !item.seasons && (
          <div className={styles.modalSeasonInfo}>🗓 Release Date: <strong>{item.nextDate}</strong></div>
        )}

        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 14 }}>
          📍 Available on: <strong>{item.platform}</strong>
        </div>

        <div className={styles.modalActions}>
          {!isWatched && !isWatching && !inWatchlist && (
            <button className={`${styles.modalBtn} ${styles.primary}`} onClick={() => { onAddWatchlist(item); onClose(); }}>
              + Add to Watchlist
            </button>
          )}
          {isWatching && (
            <button className={`${styles.modalBtn} ${styles.greenBtn}`} onClick={() => { onMarkWatched(item.id); onClose(); }}>
              ✓ Mark Watched
            </button>
          )}
          {inWatchlist && !isWatching && (
            <button className={styles.modalBtn} onClick={() => { onMarkWatching(item.id); onClose(); }}>
              ▶ Start Watching
            </button>
          )}
          {isWatched && (
            <span className={`${styles.modalBtn} ${styles.greenBtn}`} style={{ cursor: 'default' }}>✓ Completed</span>
          )}
          <button className={styles.modalBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ─── UPCOMING MODAL ─── */
function UpcomingModal({ item, onClose, onRemind }) {
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
          <span className={`${styles.badge} ${styles.badgeUpcoming}`}>Upcoming</span>
        </div>
        <p className={styles.modalDesc}>{item.desc}</p>
        <div className={styles.modalSeasonInfo}>
          🗓 Expected: <strong>{item.day} {item.month} {item.year}</strong> · Platform: <strong>{item.platform}</strong>
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.modalBtn} ${styles.primary}`} onClick={() => { onRemind(item); onClose(); }}>
            🔔 Set Reminder
          </button>
          <button className={styles.modalBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE COMPONENT
═══════════════════════════════════════════════ */
export default function WatchTrackerPage() {
  const [activeTab,    setActiveTab]    = useState('home');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [filter,       setFilter]       = useState('all');
  const [isDark,       setIsDark]       = useState(false);
  const [watchlist,    setWatchlist]    = useState(TRENDING.filter(x => x.status === 'watchlist'));
  const [watched,      setWatched]      = useState(TRENDING.filter(x => x.status === 'watched'));
  const [watching,     setWatching]     = useState(TRENDING.filter(x => x.status === 'watching'));
  const [modalItem,    setModalItem]    = useState(null);
  const [upModal,      setUpModal]      = useState(null);

  /* Search results */
  const searchResults = useCallback(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return [...TRENDING, ...UPCOMING, ...SEARCH_DB].filter(
      x => x.title.toLowerCase().includes(q) || (x.genre || '').toLowerCase().includes(q)
    );
  }, [searchQuery]);

  /* Actions */
  const addToWatchlist = item => {
    if (watchlist.some(x => x.id === item.id) || watched.some(x => x.id === item.id) || watching.some(x => x.id === item.id)) return;
    setWatchlist(prev => [...prev, { ...item, status: 'watchlist' }]);
  };
  const removeFromWatchlist = id => setWatchlist(prev => prev.filter(x => x.id !== id));
  const markWatching = id => {
    const item = watchlist.find(x => x.id === id) || TRENDING.find(x => x.id === id);
    if (!item) return;
    setWatchlist(prev => prev.filter(x => x.id !== id));
    setWatching(prev => prev.some(x => x.id === id) ? prev : [...prev, { ...item, status: 'watching', progress: 5 }]);
  };
  const markWatched = id => {
    const item = watching.find(x => x.id === id) || watchlist.find(x => x.id === id) || TRENDING.find(x => x.id === id);
    setWatching(prev => prev.filter(x => x.id !== id));
    setWatchlist(prev => prev.filter(x => x.id !== id));
    setWatched(prev => prev.some(x => x.id === id) ? prev : [...prev, { ...item, status: 'watched', progress: 100 }]);
  };

  /* ── HOME ── */
  const HomeTab = () => {
    const results = searchResults();
    return (
      <>
        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statChip}><div className={styles.statNum}>{watching.length}</div><div className={styles.statLabel}>Currently Watching</div></div>
          <div className={styles.statChip}><div className={styles.statNum}>{watchlist.length}</div><div className={styles.statLabel}>In Watchlist</div></div>
          <div className={styles.statChip}><div className={styles.statNum}>{watched.length}</div><div className={styles.statLabel}>Completed</div></div>
          <div className={styles.statChip}><div className={styles.statNum}>{UPCOMING.length}</div><div className={styles.statLabel}>Upcoming</div></div>
        </div>

        {/* Search results */}
        {searchQuery && (
          <div className={styles.searchResults}>
            <div className={styles.searchHeader}>
              Search: &quot;{searchQuery}&quot; — {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
            {results.length === 0 ? (
              <div className={styles.noResults}>No results found</div>
            ) : results.map(r => (
              <div key={r.id} className={styles.searchResultItem} onClick={() => setModalItem(r)}>
                <div className={styles.srEmoji}>{r.emoji}</div>
                <div className={styles.srInfo}>
                  <div className={styles.srTitle}>{r.title}</div>
                  <div className={styles.srDesc}>{r.type} · {r.genre} · {r.year}</div>
                </div>
                <div className={styles.srRight}>
                  <PlatformBadge platform={r.platform} />
                  <button className={styles.addBtn} onClick={e => { e.stopPropagation(); addToWatchlist(r); }}>
                    + Watchlist
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Continue watching */}
        {watching.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>▶ Continue Watching</div>
            </div>
            <div className={styles.cardsGrid}>
              {watching.map(item => <MediaCard key={item.id} item={item} onClick={setModalItem} />)}
            </div>
          </>
        )}

        {/* Trending */}
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>🔥 Trending Picks</div>
          <button className={styles.seeAll} onClick={() => setActiveTab('watchlist')}>See All</button>
        </div>
        <div className={styles.cardsGrid} style={{ marginBottom: 32 }}>
          {TRENDING.filter(x => x.status !== 'watching').map(item => (
            <MediaCard key={item.id} item={item} onClick={setModalItem} />
          ))}
        </div>

        {/* Coming soon */}
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>🗓 Coming Soon</div>
          <button className={styles.seeAll} onClick={() => setActiveTab('upcoming')}>See All</button>
        </div>
        <div className={styles.upcomingList}>
          {UPCOMING.slice(0, 4).map(u => (
            <div key={u.id} className={styles.upcomingItem} onClick={() => setUpModal(u)}>
              <div className={styles.upcomingDateBox}>
                <div className={styles.upcomingDay}>{u.day}</div>
                <div className={styles.upcomingMon}>{u.month}</div>
              </div>
              <div className={styles.upcomingInfo}>
                <div className={styles.upcomingTitle}>{u.emoji} {u.title}</div>
                <div className={styles.upcomingDesc}>{u.type} · {u.genre}</div>
              </div>
              <div className={styles.upcomingRight}>
                <PlatformBadge platform={u.platform} />
                <span className={`${styles.badge} ${styles.badgeType}`}>{u.year}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  /* ── WATCHLIST ── */
  const WatchlistTab = () => {
    const FILTERS = ['all', 'Series', 'Movie', 'Netflix', 'Prime', 'Sony'];
    const filtered = watchlist.filter(x => filter === 'all' || x.type === filter || x.platform === filter);
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
            <div className={styles.emptySub}>Search for movies & series to add</div>
          </div>
        ) : filtered.map(item => (
          <div key={item.id} className={styles.watchlistItem}>
            <div className={styles.watchlistEmoji}>{item.emoji}</div>
            <div className={styles.watchlistInfo}>
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
              <button className={styles.actionBtn} onClick={() => markWatching(item.id)}>▶ Start</button>
              <button className={`${styles.actionBtn} ${styles.done}`} onClick={() => markWatched(item.id)}>✓ Done</button>
              <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => removeFromWatchlist(item.id)}>✕</button>
            </div>
          </div>
        ))}
      </>
    );
  };

  /* ── UPCOMING ── */
  const UpcomingTab = () => (
    <>
      <div className={styles.sectionHeader} style={{ marginBottom: 20 }}>
        <div>
          <div className={styles.sectionTitle}>🗓 Upcoming Releases</div>
          <div className={styles.sectionSub}>New seasons & movies releasing soon</div>
        </div>
      </div>
      <div className={styles.upcomingList}>
        {UPCOMING.map(u => (
          <div key={u.id} className={styles.upcomingItem} onClick={() => setUpModal(u)}>
            <div className={styles.upcomingDateBox}>
              <div className={styles.upcomingDay}>{u.day}</div>
              <div className={styles.upcomingMon}>{u.month}</div>
            </div>
            <div className={styles.upcomingInfo}>
              <div className={styles.upcomingTitle}>{u.emoji} {u.title}</div>
              <div className={styles.upcomingDesc}>{u.desc}</div>
            </div>
            <div className={styles.upcomingRight}>
              <PlatformBadge platform={u.platform} />
              <span className={`${styles.badge} ${styles.badgeType}`}>{u.type}</span>
              <button className={styles.addBtn} onClick={e => { e.stopPropagation(); addToWatchlist({ ...u, status: 'watchlist', id: u.id }); }}>
                🔔 Remind
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  /* ── WATCHED ── */
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
          <div className={styles.emptySub}>Mark items as watched from your watchlist</div>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {watched.map(item => <MediaCard key={item.id} item={item} onClick={setModalItem} />)}
        </div>
      )}
    </>
  );

  const TABS = [
    { id: 'home',      label: '🏠 Home' },
    { id: 'watchlist', label: '📋 Watchlist' },
    { id: 'upcoming',  label: '🗓 Upcoming' },
    { id: 'watched',   label: '✅ Watched' },
  ];

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>

      {/* TOP BAR */}
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🎬</div>
          WatchTracker
        </div>
        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            placeholder="Search movie or series..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setActiveTab('home'); }}
          />
          <span className={styles.searchIcon}>🔍</span>
        </div>
        <button className={styles.themeBtn} onClick={() => setIsDark(d => !d)}>
          {isDark ? '☀️' : '🌙'} Theme
        </button>
      </div>

      {/* TABS */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tabBtn} ${activeTab === t.id ? styles.active : ''}`}
            onClick={() => { setActiveTab(t.id); setSearchQuery(''); }}
          >
            {t.label}
            {t.id === 'upcoming' && <span className={styles.notifDot} />}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className={styles.content}>
        {activeTab === 'home'      && <HomeTab />}
        {activeTab === 'watchlist' && <WatchlistTab />}
        {activeTab === 'upcoming'  && <UpcomingTab />}
        {activeTab === 'watched'   && <WatchedTab />}
      </div>

      {/* MODALS */}
      {modalItem && (
        <Modal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onAddWatchlist={addToWatchlist}
          onMarkWatching={markWatching}
          onMarkWatched={markWatched}
          watchlist={watchlist}
          watched={watched}
          watching={watching}
        />
      )}
      {upModal && (
        <UpcomingModal
          item={upModal}
          onClose={() => setUpModal(null)}
          onRemind={item => addToWatchlist({ ...item, status: 'watchlist' })}
        />
      )}
    </div>
  );
}
