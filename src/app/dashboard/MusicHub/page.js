'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, getDocs, addDoc, updateDoc,
  doc, serverTimestamp, query, where, orderBy
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { logToolUsage } from '@/lib/firestore';
import styles from './musichub.module.css';

const extractYoutubeId = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export default function MusicHubPage() {
  const router = useRouter();
  
  // Auth Vector Matrix
  const [uid, setUid] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Data Vectors
  const [playlists, setPlaylists] = useState([]);
  const [sharedPlaylists, setSharedPlaylists] = useState([]);
  const [quickSongs, setQuickSongs] = useState([]);
  const [allUsers, setAllUsers] = useState([]); 

  // Viewport Engine Controls
  const [activeTab, setActiveTab] = useState('hub');
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [currentTrackTitle, setCurrentTrackTitle] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [isDark, setIsDark] = useState(false);
  
  // Overlay Modals
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  // Structural Form Binders
  const [playlistForm, setPlaylistForm] = useState({ name: '', desc: '' });
  const [songForm, setFormSong] = useState({ title: '', url: '', targetPlaylist: 'quick' });
  const [shareForm, setShareForm] = useState({ targetEmail: '', permission: 'view' });

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

  const fetchCoreHubData = useCallback(async () => {
    if (!uid || !currentUserData?.email) return;
    try {
      const playlistsRef = collection(db, 'playlists');
      
      // 1. Own Playlists
      const qOwned = query(playlistsRef, where('ownerId', '==', uid));
      const ownedSnap = await getDocs(qOwned);
      const ownedList = ownedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlaylists(ownedList);

      // 2. Cross Shared Playlists Vector Query Fix
      const qShared = query(playlistsRef, where('sharedWithEmails', 'array-contains', currentUserData.email));
      const sharedSnap = await getDocs(qShared);
      const sharedList = sharedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSharedPlaylists(sharedList);

      // 3. Isolated Single Quick Tracks
      const quickRef = collection(db, `users/${uid}/quicksongs`);
      const qSnap = await getDocs(query(quickRef, orderBy('createdAt', 'desc')));
      setQuickSongs(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 4. Client Core Users Database Vector
      const usersSnap = await getDocs(collection(db, 'users'));
      setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== uid));

    } catch (err) {
      console.error('System synchronization pipeline anomaly:', err);
    } finally {
      setLoading(false);
    }
  }, [uid, currentUserData]);

  useEffect(() => {
    if (uid && currentUserData?.email) {
      fetchCoreHubData();
    }
  }, [uid, currentUserData, fetchCoreHubData]);

  const mountTrackToPlayer = (url, title) => {
    const vId = extractYoutubeId(url);
    if (!vId) return alert('Invalid Link Layout Asset.');
    setActiveVideoId(vId);
    setCurrentTrackTitle(title);
    logToolUsage({ userId: uid, tool: 'MusicHub', action: 'Play_Track', resourceName: title });
  };

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
        sharedWith: [], 
        sharedWithEmails: [],
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'playlists'), payload);
      await fetchCoreHubData();
      setShowPlaylistModal(false);
      setPlaylistForm({ name: '', desc: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSong = async () => {
    if (!songForm.title.trim() || !songForm.url.trim()) return alert('Parameters missing.');
    const targetVideoId = extractYoutubeId(songForm.url);
    if (!targetVideoId) return alert('Bad parsing pattern.');

    setSaving(true);
    try {
      const trackPayload = {
        title: songForm.title.trim(),
        url: songForm.url.trim(),
        videoId: targetVideoId,
        createdAt: new Date().toISOString()
      };

      if (songForm.targetPlaylist === 'quick') {
        await addDoc(collection(db, `users/${uid}/quicksongs`), {
          ...trackPayload,
          createdAt: serverTimestamp()
        });
      } else {
        const playlistId = songForm.targetPlaylist;
        const combinedPlaylists = [...playlists, ...sharedPlaylists];
        const currentP = combinedPlaylists.find(p => p.id === playlistId);
        
        // Privilege evaluation mapping matrix
        if (currentP.ownerId !== uid) {
          const collabToken = currentP.sharedWith?.find(s => s.email === currentUserData.email);
          if (collabToken?.permission !== 'edit') {
            alert('Access Denied. Owner has configured Read-Only privileges.');
            setSaving(false);
            return;
          }
        }

        const updatedTracks = [...(currentP.tracks || []), trackPayload];
        await updateDoc(doc(db, 'playlists', playlistId), { tracks: updatedTracks });
      }

      await fetchCoreHubData();
      setFormSong({ title: '', url: '', targetPlaylist: 'quick' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleApplySharePermission = async () => {
    if (!shareForm.targetEmail) return alert('Select routing profile.');
    
    // Unique share check matrix logic validation node
    const isAlreadyShared = selectedPlaylist.sharedWithEmails?.includes(shareForm.targetEmail);
    if (isAlreadyShared) {
      alert('Constraint Triggered: This specific user already possesses an operational link token for this playlist.');
      return;
    }

    setSaving(true);
    try {
      const targetUser = allUsers.find(u => u.email === shareForm.targetEmail);
      const shareObject = {
        email: shareForm.targetEmail,
        name: targetUser?.displayName || targetUser?.name || 'Workspace Asset',
        permission: shareForm.permission
      };

      const updatedShareList = [...(selectedPlaylist.sharedWith || []), shareObject];
      const updatedEmailsList = [...(selectedPlaylist.sharedWithEmails || []), shareForm.targetEmail];

      await updateDoc(doc(db, 'playlists', selectedPlaylist.id), { 
        sharedWith: updatedShareList,
        sharedWithEmails: updatedEmailsList
      });
      
      await fetchCoreHubData();
      setShowShareModal(false);
      setShareForm({ targetEmail: '', permission: 'view' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const searchedQuickSongs = useMemo(() => {
    return quickSongs.filter(s => s.title.toLowerCase().includes(searchQ.toLowerCase()));
  }, [quickSongs, searchQ]);

  const allAvailablePlaylists = useMemo(() => {
    return [...playlists, ...sharedPlaylists];
  }, [playlists, sharedPlaylists]);

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinnerInner} /><p>Initializing Studio Core Routing...</p></div>;

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>
      
      {/* ── TOP BAR ENGINE ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Portal</button>
        <div className={styles.brand}><div className={styles.brandIcon}>🎵</div>Music Hub</div>
        <div className={styles.searchWrap}>
          <input 
            className={styles.searchInput} 
            placeholder="Search your localized audio streams..." 
            value={searchQ} 
            onChange={e => setSearchQ(e.target.value)} 
          />
        </div>
        <button className={styles.addNewBtn} onClick={() => setShowPlaylistModal(true)}>+ New Playlist</button>
        <button className={styles.themeBtn} onClick={() => setIsDark(!isDark)}>{isDark ? '☀️' : '🌙'}</button>
      </div>

      {/* ── MAIN CONTENT DUAL SPLIT SYSTEM ── */}
      <div className={styles.contentLayout}>
        
        <div className={styles.mainFeedSection}>
          
          {/* TRACK INGESTION HUB MODULE */}
          <div className={styles.ingestContainer}>
            <h3 className={styles.blockTitle}>🧬 Load Direct Audio Stream Target</h3>
            <div className={styles.formRow}>
              <input 
                className={styles.formInput} 
                placeholder="Track Title Reference..." 
                value={songForm.title} 
                onChange={e => setFormSong({...songForm, title: e.target.value})}
              />
              <input 
                className={styles.formInput} 
                placeholder="YouTube / YouTube Music URL..." 
                value={songForm.url} 
                onChange={e => setFormSong({...songForm, url: e.target.value})}
              />
              <select 
                className={styles.formSelect}
                value={songForm.targetPlaylist}
                onChange={e => setFormSong({...songForm, targetPlaylist: e.target.value})}
              >
                <option value="quick">⚡ No Playlist (Isolated Track)</option>
                {allAvailablePlaylists.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.ownerId === uid ? '📁 Owned: ' : '🌐 Shared: '} {p.name}
                  </option>
                ))}
              </select>
              <button className={styles.mountButton} onClick={handleAddSong} disabled={saving}>Mount</button>
            </div>
          </div>

          {/* TABS CONTROLLER BAR */}
          <div className={styles.tabRow}>
            <button className={`${styles.tabLink} ${activeTab === 'hub' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('hub')}>🎛️ Streams Base</button>
            <button className={`${styles.tabLink} ${activeTab === 'playlists' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('playlists')}>📁 Vault Storage ({playlists.length})</button>
            <button className={`${styles.tabLink} ${activeTab === 'shared' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('shared')}>🌐 Shared Ecosystem ({sharedPlaylists.length})</button>
          </div>

          {/* VIEWPORTS CORE ENGINE */}
          {activeTab === 'hub' && (
            <div className={styles.viewPortContainer}>
              <h4 className={styles.sectionHeading}>⚡ Single Stream Engine (No Playlist Records)</h4>
              {searchedQuickSongs.length === 0 ? <p className={styles.emptyText}>No single track matrix vectors loaded.</p> : (
                <div className={styles.trackListList}>
                  {searchedQuickSongs.map(song => (
                    <div key={song.id} className={styles.trackRowItem} onClick={() => mountTrackToPlayer(song.url, song.title)}>
                      <div className={styles.rowPlayIndicator}>▶</div>
                      <div className={styles.rowDetails}>
                        <p className={styles.trackName}>{song.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OWN PLAYLISTS VIEWPORT */}
          {activeTab === 'playlists' && (
            <div className={styles.playlistsVerticalGrid}>
              {playlists.length === 0 ? <p className={styles.emptyText}>Vault is currently clean of containers.</p> : playlists.map(p => (
                <div key={p.id} className={styles.playlistMegaBlock}>
                  <div className={styles.playlistBlockHeader}>
                    <div>
                      <h4 className={styles.pNameDisplay}>📁 {p.name}</h4>
                      <p className={styles.pDescDisplay}>{p.desc || 'No descriptor metadata assigned.'}</p>
                    </div>
                    <button className={styles.shareActionTrigger} onClick={() => { setSelectedPlaylist(p); setShowShareModal(true); }}>🌐 Route Permissions</button>
                  </div>

                  {/* SHARED SUBSCRIBERS TRANSPARENCY TRACK CHIPS */}
                  {p.sharedWith && p.sharedWith.length > 0 && (
                    <div className={styles.sharedUsersTransparencyTrack}>
                      <span className={styles.transparencyLabel}>Shared Workspace Nodes:</span>
                      {p.sharedWith.map((user, idx) => (
                        <span key={idx} className={styles.sharedUserChipBadge} title={user.email}>
                          👤 {user.name} <strong>({user.permission})</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={styles.playlistTracksInternalWrap}>
                    {!p.tracks || p.tracks.length === 0 ? <p className={styles.emptyTextSub}>No active streaming items linked to this array container node.</p> : p.tracks.map((t, idx) => (
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

          {/* SHARED VIEWPORT HUB MODULE */}
          {activeTab === 'shared' && (
            <div className={styles.playlistsVerticalGrid}>
              {sharedPlaylists.length === 0 ? <p className={styles.emptyText}>No cross-platform shared streams targeting your configuration yet.</p> : sharedPlaylists.map(p => (
                <div key={p.id} className={styles.playlistMegaBlockShared}>
                  <div className={styles.playlistBlockHeader}>
                    <div>
                      <h4 className={styles.pNameDisplay}>🌐 {p.name}</h4>
                      <p className={styles.pDescDisplay}>Author Node: <strong>{p.ownerName}</strong> ({p.ownerEmail})</p>
                    </div>
                    <span className={styles.privilegeRoleLabelBadge}>
                      Role: {p.sharedWith?.find(s => s.email === currentUserData.email)?.permission?.toUpperCase() || 'VIEW'}
                    </span>
                  </div>

                  <div className={styles.playlistTracksInternalWrap}>
                    {!p.tracks || p.tracks.length === 0 ? <p className={styles.emptyTextSub}>Shared pipeline buffer empty.</p> : p.tracks.map((t, idx) => (
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

        {/* RIGHT HARDWARE BACKBONE RECEPTOR EMBED PLAYER */}
        <div className={styles.sidePlaybackSection}>
          <div className={styles.stickyHardwarePlayer}>
            <h3 className={styles.blockTitle}>⚡ Core Hardware Terminal</h3>
            {activeVideoId ? (
              <div className={styles.playerWrapperContainer}>
                <div className={styles.videoEmbedContainer}>
                  <iframe
                    className={styles.youtubeIframeHardware}
                    src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&modestbranding=1&rel=0`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Active Stream Frame Node"
                  />
                </div>
                <div className={styles.activeTrackConsoleDisplayMetadata}>
                  <p className={styles.livePulseHeading}>⚡ ACTIVE RECEIVING PULSE:</p>
                  <p className={styles.liveTrackTitleText}>{currentTrackTitle}</p>
                </div>
              </div>
            ) : (
              <div className={styles.playerStandbyScreen}>
                <div className={styles.standbyRadarPulse}>🎵</div>
                <p>Hardware Stack Unmounted.</p>
                <span>Select any cross-platform media element node target.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CONFIG COMPILATION */}
      {showPlaylistModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPlaylistModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalHeadline}>📁 Compile Storage Vault Node</h3>
            <div className={styles.modalFormStack}>
              <input 
                className={styles.formInput} 
                placeholder="Playlist Unique Alias..." 
                value={playlistForm.name}
                onChange={e => setPlaylistForm({...playlistForm, name: e.target.value})}
              />
              <textarea 
                className={styles.formTextarea} 
                placeholder="Meta Context Allocation Description..." 
                value={playlistForm.desc}
                onChange={e => setPlaylistForm({...playlistForm, desc: e.target.value})}
              />
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowPlaylistModal(false)}>Terminate</button>
                <button className={styles.confirmBtn} onClick={handleCreatePlaylist}>Deploy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ROUTING CONTROLLER MAP */}
      {showShareModal && (
        <div className={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalHeadline}>🌐 Target Distribution Router</h3>
            <div className={styles.modalFormStack}>
              <select 
                className={styles.formSelect}
                value={shareForm.targetEmail}
                onChange={e => setShareForm({...shareForm, targetEmail: e.target.value})}
              >
                <option value="">-- Select Destination User Entity --</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.email}>
                    👤 {u.displayName || u.name || 'Workspace Account'} ({u.email})
                  </option>
                ))}
              </select>

              <select 
                className={styles.formSelect}
                value={shareForm.permission}
                onChange={e => setShareForm({...shareForm, permission: e.target.value})}
              >
                <option value="view">👀 View Privilege Node Only</option>
                <option value="edit">⚡ Full Read/Write Collaborator Link</option>
              </select>

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowShareModal(false)}>Wipe</button>
                <button className={styles.confirmBtn} onClick={handleApplySharePermission}>Bind Connection</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
