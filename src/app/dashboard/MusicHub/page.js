'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, query, where, orderBy
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { logToolUsage } from '@/lib/firestore';
import styles from './musichub.module.css';

/* ══════════════════════════════════════════════
   UTILITY ENGINES
══════════════════════════════════════════════ */
// Extract YouTube/YouTube Music video ID safely
const extractYoutubeId = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export default function MusicHubPage() {
  const router = useRouter();
  
  // Core Auth & State Matrix
  const [uid, setUid] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Data Vectors
  const [playlists, setPlaylists] = useState([]);
  const [quickSongs, setQuickSongs] = useState([]);
  const [allUsers, setAllUsers] = useState([]); // Registered users bucket for share access

  // UI Control States
  const [activeTab, setActiveTab] = useState('hub');
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [isDark, setIsDark] = useState(false);
  
  // Modals Toggles
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  // Form Inputs Bound
  const [playlistForm, setPlaylistForm] = useState({ name: '', desc: '' });
  const [songForm, setFormSong] = useState({ title: '', url: '', targetPlaylist: 'quick' });
  const [shareForm, setShareForm] = useState({ targetEmail: '', permission: 'view' });

  /* ── AUTH PROTOCOL & INBOX USERS LOADING ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setCurrentUserData({ uid: user.uid, email: user.email, displayName: user.displayName || 'Viku User' });
        logToolUsage({ userId: user.uid, tool: 'MusicHub', action: 'PAGE_VISIT' });
      } else {
        router.push('/login');
      }
    });
    return unsub;
  }, [router]);

  /* ── DATABASE VECTOR ACCESS ── */
  useEffect(() => {
    if (!uid) return;
    const fetchCoreHubData = async () => {
      try {
        // 1. Fetch System Playlists (Created or Shared with User)
        const playlistsRef = collection(db, 'playlists');
        const qPlaylists = query(playlistsRef, where('ownerId', '==', uid));
        const pSnap = await getDocs(qPlaylists);
        const pList = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPlaylists(pList);

        // 2. Fetch Isolated Quick Tracks (Bina playlist wale songs)
        const quickRef = collection(db, `users/${uid}/quicksongs`);
        const qSnap = await getDocs(query(quickRef, orderBy('createdAt', 'desc')));
        setQuickSongs(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. Fetch Registered Cross-Platform Users Profiles for Sharing
        const usersSnap = await getDocs(collection(db, 'users'));
        setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== uid));

      } catch (err) {
        console.error('Core loading matrix failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCoreHubData();
  }, [uid]);

  /* ── PLAYER CONTROLLER ENGINE ── */
  const mountTrackToPlayer = (url, title) => {
    const vId = extractYoutubeId(url);
    if (!vId) return alert('Invalid Link Asset. Please drop a clean YouTube/YT Music Link.');
    setActiveVideoId(vId);
    logToolUsage({ userId: uid, tool: 'MusicHub', action: 'Play_Track', resourceName: title });
  };

  /* ── MUTATION NODE HANDLERS (CRUD) ── */
  const handleCreatePlaylist = async () => {
    if (!playlistForm.name.trim()) return alert('Playlist Name mandatory.');
    setSaving(true);
    try {
      const payload = {
        name: playlistForm.name.trim(),
        desc: playlistForm.desc.trim(),
        ownerId: uid,
        ownerName: currentUserData.displayName,
        ownerEmail: currentUserData.email,
        tracks: [],
        sharedWith: [], // Array of objects: {email, name, permission}
        createdAt: serverTimestamp()
      };
      const ref = await addDoc(collection(db, 'playlists'), payload);
      setPlaylists(prev => [{ id: ref.id, ...payload }, ...prev]);
      setShowPlaylistModal(false);
      setPlaylistForm({ name: '', desc: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSong = async () => {
    if (!songForm.title.trim() || !songForm.url.trim()) return alert('Fill required track vectors.');
    const targetVideoId = extractYoutubeId(songForm.url);
    if (!targetVideoId) return alert('Bad source url pattern.');

    setSaving(true);
    try {
      const trackPayload = {
        title: songForm.title.trim(),
        url: songForm.url.trim(),
        videoId: targetVideoId,
        createdAt: new Date().toISOString()
      };

      if (songForm.targetPlaylist === 'quick') {
        // Save as Quick Isolated Track
        const ref = await addDoc(collection(db, `users/${uid}/quicksongs`), {
          ...trackPayload,
          createdAt: serverTimestamp()
        });
        setQuickSongs(prev => [{ id: ref.id, ...trackPayload }, ...prev]);
      } else {
        // Append into Target Playlist Array Structure
        const playlistId = songForm.targetPlaylist;
        const currentP = playlists.find(p => p.id === playlistId);
        const updatedTracks = [...(currentP.tracks || []), trackPayload];
        
        await updateDoc(doc(db, 'playlists', playlistId), { tracks: updatedTracks });
        setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, tracks: updatedTracks } : p));
      }

      setFormSong({ title: '', url: '', targetPlaylist: 'quick' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleApplySharePermission = async () => {
    if (!shareForm.targetEmail) return alert('Select target profile asset.');
    setSaving(true);
    try {
      const targetUser = allUsers.find(u => u.email === shareForm.targetEmail);
      const shareObject = {
        email: shareForm.targetEmail,
        name: targetUser?.displayName || targetUser?.name || 'Collaborator',
        permission: shareForm.permission
      };

      const updatedShareList = [...(selectedPlaylist.sharedWith || []), shareObject];
      await updateDoc(doc(db, 'playlists', selectedPlaylist.id), { sharedWith: updatedShareList });
      
      setPlaylists(prev => prev.map(p => p.id === selectedPlaylist.id ? { ...p, sharedWith: updatedShareList } : p));
      setShowShareModal(false);
      setShareForm({ targetEmail: '', permission: 'view' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  /* ── FILTER MATRIX ── */
  const searchedQuickSongs = useMemo(() => {
    return quickSongs.filter(s => s.title.toLowerCase().includes(searchQ.toLowerCase()));
  }, [quickSongs, searchQ]);

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinnerInner} /><p>Loading Audio Engine Studio...</p></div>;

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>
      
      {/* ── TOP BAR ENGINE ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Portal</button>
        <div className={styles.brand}><div className={styles.brandIcon}>🎵</div>Viku Studio Hub</div>
        
        <div className={styles.searchWrap}>
          <input 
            className={styles.searchInput} 
            placeholder="Search audio streams instantly..." 
            value={searchQ} 
            onChange={e => setSearchQ(e.target.value)} 
          />
        </div>
        
        <button className={styles.addNewBtn} onClick={() => setShowPlaylistModal(true)}>+ Create Playlist</button>
        <button className={styles.themeBtn} onClick={() => setIsDark(!isDark)}>{isDark ? '☀️' : '🌙'}</button>
      </div>

      {/* ── MAIN GRID CONTROL ── */}
      <div className={styles.contentLayout}>
        
        {/* LEFT COLUMN: SOURCE PANEL & RECEPTORS */}
        <div className={styles.mainFeedSection}>
          
          {/* TRACK INGESTION HUB MODULE */}
          <div className={styles.ingestContainer}>
            <h3 className={styles.blockTitle}>🧬 Load Streaming Asset (YouTube / YT Music)</h3>
            <div className={styles.formRow}>
              <input 
                className={styles.formInput} 
                placeholder="Track Title Reference..." 
                value={songForm.title} 
                onChange={e => setFormSong({...songForm, title: e.target.value})}
              />
              <input 
                className={styles.formInput} 
                placeholder="Paste YT Track URL..." 
                value={songForm.url} 
                onChange={e => setFormSong({...songForm, url: e.target.value})}
              />
              <select 
                className={styles.formSelect}
                value={songForm.targetPlaylist}
                onChange={e => setFormSong({...songForm, targetPlaylist: e.target.value})}
              >
                <option value="quick">⚡ No Playlist (Isolated Play)</option>
                {playlists.map(p => <option key={p.id} value={p.id}>📁 Inside: {p.name}</option>)}
              </select>
              <button className={styles.mountButton} onClick={handleAddSong} disabled={saving}>Mount Asset</button>
            </div>
          </div>

          {/* ── TAB SELECTOR ── */}
          <div className={styles.tabRow}>
            <button className={`${styles.tabLink} ${activeTab === 'hub' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('hub')}>🎛️ Streams Hub Dashboard</button>
            <button className={`${styles.tabLink} ${activeTab === 'playlists' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('playlists')}>📁 My Storage Playlists ({playlists.length})</button>
          </div>

          {/* TAB VIEWPORTS */}
          {activeTab === 'hub' && (
            <div className={styles.viewPortContainer}>
              <h4 className={styles.sectionHeading}>⚡ Isolated Quick Stream Tracks (Bina Playlist ke Load Huye)</h4>
              {searchedQuickSongs.length === 0 ? <p className={styles.emptyText}>No isolated track assets loaded inside this matrix node.</p> : (
                <div className={styles.trackListList}>
                  {searchedQuickSongs.map(song => (
                    <div key={song.id} className={styles.trackRowItem} onClick={() => mountTrackToPlayer(song.url, song.title)}>
                      <div className={styles.rowPlayIndicator}>▶</div>
                      <div className={styles.rowDetails}>
                        <p className={styles.trackName}>{song.title}</p>
                        <p className={styles.trackSub}>Direct Engine Resource Node</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'playlists' && (
            <div className={styles.playlistsVerticalGrid}>
              {playlists.length === 0 ? <p className={styles.emptyText}>No encrypted playlists compiled yet.</p> : playlists.map(p => (
                <div key={p.id} className={styles.playlistMegaBlock}>
                  <div className={styles.playlistBlockHeader}>
                    <div>
                      <h4 className={styles.pNameDisplay}>📁 {p.name}</h4>
                      <p className={styles.pDescDisplay}>{p.desc || 'No descriptive tag configured.'}</p>
                    </div>
                    <button className={styles.shareActionTrigger} onClick={() => { setSelectedPlaylist(p); setShowShareModal(true); }}>🌐 Share Matrix</button>
                  </div>

                  <div className={styles.playlistTracksInternalWrap}>
                    {!p.tracks || p.tracks.length === 0 ? <p className={styles.emptyTextSub}>Playlist container completely hollow.</p> : p.tracks.map((t, idx) => (
                      <div key={idx} className={styles.trackRowItem} onClick={() => mountTrackToPlayer(t.url, t.title)}>
                        <span className={styles.trackIdx}>{(idx + 1).toString().padStart(2, '0')}</span>
                        <div className={styles.rowDetails}><p className={styles.trackName}>{t.title}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CORE YOUTUBE HARDWARE STREAM PLAYER ENGINE */}
        <div className={styles.sidePlaybackSection}>
          <div className={styles.stickyHardwarePlayer}>
            <h3 className={styles.blockTitle}>⚡ Core Audio Hardware Terminal</h3>
            {activeVideoId ? (
              <div className={styles.videoEmbedContainer}>
                <iframe
                  className={styles.youtubeIframeHardware}
                  src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&modestbranding=1&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Dynamic Audio Node Stream"
                />
              </div>
            ) : (
              <div className={styles.playerStandbyScreen}>
                <div className={styles.standbyRadarPulse}>🎵</div>
                <p>Hardware Core Idle.</p>
                <span>Select any track stream node to initialize active loop pipeline.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PLAYLIST GENERATOR CREATION MODAL ── */}
      {showPlaylistModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPlaylistModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalHeadline}>📁 Structural Playlist Node</h3>
            <div className={styles.modalFormStack}>
              <input 
                className={styles.formInput} 
                placeholder="Playlist Unique Alias..." 
                value={playlistForm.name}
                onChange={e => setPlaylistForm({...playlistForm, name: e.target.value})}
              />
              <textarea 
                className={styles.formTextarea} 
                placeholder="Description/MetaData context..." 
                value={playlistForm.desc}
                onChange={e => setPlaylistForm({...playlistForm, desc: e.target.value})}
              />
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowPlaylistModal(false)}>Terminate</button>
                <button className={styles.confirmBtn} onClick={handleCreatePlaylist}>Compile Node</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECURITY ENCRYPTED SHARE ROUTING MODAL ── */}
      {showShareModal && (
        <div className={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalHeadline}>🌐 Access Node Share Router</h3>
            <p className={styles.shareSubtitleSub}>Select verified operational identity inside current workspace: </p>
            
            <div className={styles.modalFormStack}>
              <select 
                className={styles.formSelect}
                value={shareForm.targetEmail}
                onChange={e => setShareForm({...shareForm, targetEmail: e.target.value})}
              >
                <option value="">-- Choose Registered Workspace Profile --</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.email}>
                    {u.displayName || u.name || 'Anonymous Asset'} ({u.email})
                  </option>
                ))}
              </select>

              <select 
                className={styles.formSelect}
                value={shareForm.permission}
                onChange={e => setShareForm({...shareForm, permission: e.target.value})}
              >
                <option value="view">👀 View Access Privilege Only</option>
                <option value="edit">⚡ Full Read/Write Collaboration Access</option>
              </select>

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowShareModal(false)}>Revoke</button>
                <button className={styles.confirmBtn} onClick={handleApplySharePermission}>Deploy Stream Routing</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
