'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  updateDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import styles from './panorama.module.css';

/* ══════════════════════════════════════
   IndexedDB helpers
══════════════════════════════════════ */
const IDB_NAME = 'pano360_v3', IDB_STORE = 'panos', IDB_VER = 1;
function openIDB() {
  return new Promise((res, rej) => {
    if (typeof window === 'undefined') return rej(new Error('SSR'));
    const r = indexedDB.open(IDB_NAME, IDB_VER);
    r.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains(IDB_STORE))
        e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });
}
async function idbSave(id, dataUrl) {
  const db = await openIDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ id, dataUrl, ts: Date.now() });
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
  });
  // auto-clean oldest if > 15
  try {
    const db2 = await openIDB();
    const all  = await new Promise(r => {
      const tx = db2.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = e => r(e.target.result || []);
      req.onerror   = () => r([]);
    });
    if (all.length > 15) {
      const del = all.sort((a,b)=>a.ts-b.ts).slice(0, all.length-15);
      const db3 = await openIDB();
      for (const x of del) {
        await new Promise(r => {
          const tx = db3.transaction(IDB_STORE,'readwrite');
          tx.objectStore(IDB_STORE).delete(x.id);
          tx.oncomplete = r; tx.onerror = r;
        });
      }
    }
  } catch { /* silent */ }
}
async function idbGet(id) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(IDB_STORE,'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = e => res(e.target.result?.dataUrl || null);
    req.onerror   = e => rej(e.target.error);
  });
}
async function idbDel(id) {
  const db = await openIDB();
  return new Promise(res => {
    const tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = res; tx.onerror = res;
  });
}
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(new Error('FileReader error'));
    r.readAsDataURL(blob);
  });
}

/* ══════════════════════════════════════
   SHOT GRID  8 cols × 3 rows = 24 shots
══════════════════════════════════════ */
const H = 8;
const LEVELS = [
  { label:'Sky',    pitch:55,  icon:'⬆️' },
  { label:'Level',  pitch:0,   icon:'➡️' },
  { label:'Ground', pitch:-40, icon:'⬇️' },
];
const SHOTS = [];
LEVELS.forEach((v,vi) => {
  for (let h=0; h<H; h++) {
    SHOTS.push({ idx: vi*H+h, row:vi, col:h, yaw:Math.round(h*(360/H)), pitch:v.pitch, label:v.label, icon:v.icon });
  }
});
const TOTAL = SHOTS.length; // 24
const FW=640, FH=480, PW=FW*H, PH=FH*LEVELS.length;

/* ══════════════════════════════════════
   WEBGL 360 VIEWER HOOK
══════════════════════════════════════ */
function use360(canvasRef, src, active) {
  const S = useRef({ yaw:0,pitch:0,fov:75,drag:false,lx:0,ly:0,vx:0,vy:0,auto:false,gyro:false,_gh:null,animId:null });

  useEffect(() => {
    if (!active || !canvasRef.current || !src) return;
    const cv = canvasRef.current;
    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) return;

    const vs=`attribute vec2 p;varying vec2 u;void main(){u=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
    const fs=`precision highp float;
uniform sampler2D t;uniform float Y,P,F;uniform vec2 R;varying vec2 u;
const float PI=3.14159265;
void main(){
  vec2 n=(u*2.-1.)*vec2(R.x/R.y,1.);
  float f=1./tan(F*.5*PI/180.);
  vec3 r=normalize(vec3(n,f));
  float cy=cos(Y),sy=sin(Y),cp=cos(P),sp=sin(P);
  vec3 q;q.x=cy*r.x+sy*r.z;q.z=-sy*r.x+cy*r.z;
  q.y=sp*q.z+cp*r.y;q.z=cp*q.z-sp*r.y;
  float lo=atan(q.x,q.z),la=asin(clamp(q.y/length(q),-1.,1.));
  gl_FragColor=texture2D(t,vec2(lo/(2.*PI)+.5,la/PI+.5));
}`;
    const mk=(type,code)=>{ const s=gl.createShader(type); gl.shaderSource(s,code); gl.compileShader(s); return s; };
    const pg=gl.createProgram();
    gl.attachShader(pg,mk(gl.VERTEX_SHADER,vs));
    gl.attachShader(pg,mk(gl.FRAGMENT_SHADER,fs));
    gl.linkProgram(pg);
    const buf=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const ap=gl.getAttribLocation(pg,'p');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap,2,gl.FLOAT,false,0,0);
    const tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([10,10,25,255]));
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    };
    img.src=src;
    const ul=n=>gl.getUniformLocation(pg,n);
    let aid;
    const loop=()=>{
      const s=S.current, W=cv.clientWidth||640, H2=cv.clientHeight||360;
      if(cv.width!==W||cv.height!==H2){cv.width=W;cv.height=H2;}
      gl.viewport(0,0,W,H2);
      if(s.auto&&!s.gyro) s.yaw+=.003;
      if(!s.drag){s.vx*=.93;s.vy*=.93;s.yaw+=s.vx;s.pitch+=s.vy;}
      s.pitch=Math.max(-1.45,Math.min(1.45,s.pitch));
      gl.useProgram(pg);
      gl.uniform1i(ul('t'),0); gl.uniform1f(ul('Y'),s.yaw);
      gl.uniform1f(ul('P'),s.pitch); gl.uniform1f(ul('F'),s.fov);
      gl.uniform2f(ul('R'),W,H2);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      aid=requestAnimationFrame(loop);
    };
    aid=requestAnimationFrame(loop); S.current.animId=aid;
    return ()=>{ cancelAnimationFrame(aid); try{gl.deleteProgram(pg);gl.deleteTexture(tex);}catch{} };
  },[active,src]); // eslint-disable-line

  const onMD=useCallback(e=>{ const s=S.current; s.drag=true; s.lx=e.clientX; s.ly=e.clientY; s.vx=0; s.vy=0; },[]);
  const onMM=useCallback(e=>{ const s=S.current; if(!s.drag)return; const dx=e.clientX-s.lx,dy=e.clientY-s.ly; s.vx=dx*.003;s.vy=dy*.003;s.yaw-=dx*.005;s.pitch-=dy*.005;s.lx=e.clientX;s.ly=e.clientY; },[]);
  const onMU=useCallback(()=>{ S.current.drag=false; },[]);
  const onW =useCallback(e=>{ e.preventDefault(); S.current.fov=Math.max(20,Math.min(110,S.current.fov+e.deltaY*.05)); },[]);
  const td=useRef({d:0});
  const onTS=useCallback(e=>{ const s=S.current; if(e.touches.length===1){s.drag=true;s.lx=e.touches[0].clientX;s.ly=e.touches[0].clientY;} if(e.touches.length===2) td.current.d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); },[]);
  const onTM=useCallback(e=>{ e.preventDefault();const s=S.current; if(e.touches.length===1&&s.drag){const dx=e.touches[0].clientX-s.lx,dy=e.touches[0].clientY-s.ly;s.vx=dx*.003;s.vy=dy*.003;s.yaw-=dx*.005;s.pitch-=dy*.005;s.lx=e.touches[0].clientX;s.ly=e.touches[0].clientY;} if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);s.fov=Math.max(20,Math.min(110,s.fov-(d-td.current.d)*.15));td.current.d=d;} },[]);
  const onTE=useCallback(()=>{ S.current.drag=false; },[]);
  const toggleAuto=useCallback(()=>{ S.current.auto=!S.current.auto; return S.current.auto; },[]);
  const reset=useCallback(()=>{ Object.assign(S.current,{yaw:0,pitch:0,fov:75,vx:0,vy:0}); },[]);
  const enableGyro=useCallback(async()=>{
    if(typeof window==='undefined'||typeof DeviceOrientationEvent==='undefined') return false;
    try{ if(typeof DeviceOrientationEvent.requestPermission==='function'){ const p=await DeviceOrientationEvent.requestPermission(); if(p!=='granted') return false; } }catch{ return false; }
    const h=e=>{ if(!S.current.gyro)return; S.current.yaw=-(e.alpha||0)*Math.PI/180; S.current.pitch=(e.beta||0)*Math.PI/180*.5; };
    window.addEventListener('deviceorientation',h,true); S.current.gyro=true; S.current._gh=h; return true;
  },[]);
  const disableGyro=useCallback(()=>{ if(S.current._gh)window.removeEventListener('deviceorientation',S.current._gh,true); S.current.gyro=false; S.current._gh=null; },[]);
  return { onMD,onMM,onMU,onW,onTS,onTM,onTE,toggleAuto,reset,enableGyro,disableGyro,S };
}

/* ══════════════════════════════════════
   DIRECTION GUIDE
══════════════════════════════════════ */
function DirGuide({ shotIdx, done, yaw, pitch, hasGyro }) {
  const idx  = Math.min(shotIdx, TOTAL-1);
  const shot = SHOTS[idx];
  const yd   = ((yaw - shot.yaw + 540)%360)-180;
  const pd   = pitch - shot.pitch;
  const ok   = Math.abs(yd)<22 && Math.abs(pd)<18;
  const aY   = yd>15?'← Turn Left':yd<-15?'Turn Right →':'';
  const aP   = pd>12?'↑ Tilt Up':pd<-12?'Tilt Down ↓':'';

  return (
    <div className={styles.dg}>
      {/* Mini sphere top-view */}
      <div className={styles.dgMap}>
        {SHOTS.filter(s=>s.row===1).map(s=>{
          const a=(s.yaw*Math.PI)/180, r=38;
          const cx=50+r*Math.sin(a), cy=50-r*Math.cos(a);
          const isDone=done.has(s.idx);
          const isAct=s.col===shot.col&&!isDone;
          return <div key={s.idx} className={`${styles.dgDot} ${isDone?styles.dgDone:''} ${isAct?styles.dgActive:''}`} style={{left:`${cx}%`,top:`${cy}%`}} />;
        })}
        <div className={styles.dgYou}><span>YOU</span></div>
        {hasGyro && <div className={styles.dgPtr} style={{transform:`rotate(${yaw}deg)`}} />}
      </div>

      {/* Instructions */}
      <div className={styles.dgInfo}>
        <div className={styles.dgRow}>
          <span className={styles.dgIcon}>{shot.icon}</span>
          <span className={styles.dgLabel}>{shot.label} shot</span>
          <span className={styles.dgCount}>{idx+1}/{TOTAL}</span>
        </div>
        <div className={styles.dgTarget}>
          Aim at <b>{shot.yaw}°</b>
          {shot.pitch!==0&&<> · {shot.pitch>0?'tilt up ':'tilt down '}<b>{Math.abs(shot.pitch)}°</b></>}
        </div>
        {hasGyro ? (
          <div className={styles.dgArrows}>
            {aY  && <span className={styles.dgArrow}>{aY}</span>}
            {aP  && <span className={styles.dgArrow}>{aP}</span>}
            {ok  && <span className={styles.dgGreen}>✓ Aligned — tap!</span>}
          </div>
        ) : (
          <div className={styles.dgNoGyro}>Manually point camera → tap shutter</div>
        )}
        <div className={styles.dgLevels}>
          {LEVELS.map((v,vi)=>{
            const c=SHOTS.filter(s=>s.row===vi&&done.has(s.idx)).length;
            return <div key={vi} className={`${styles.dgPill} ${vi===shot.row?styles.dgPillOn:''}`}>{v.icon} {v.label} {c}/{H}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   CAPTURE HOOK
══════════════════════════════════════ */
function useCapture() {
  const vidRef    = useRef(null);
  const streamRef = useRef(null);
  const framesRef = useRef([]); // stable ref for stitch

  const [step,    setStep]    = useState('idle');  // idle|guide|capturing|stitching|done
  const [done,    setDone]    = useState(new Set());
  const [shotIdx, setShotIdx] = useState(0);
  const [devYaw,  setDevYaw]  = useState(0);
  const [devPitch,setDevPitch]= useState(0);
  const [aligned, setAligned] = useState(false);
  const [hasGyro, setHasGyro] = useState(false);
  const [panoBlob,setPanoBlob]= useState(null);
  const [panoUrl, setPanoUrl] = useState(null);
  const [err,     setErr]     = useState('');
  const [thumbs,  setThumbs]  = useState([]);

  /* ── start camera ── */
  const startCam = useCallback(async () => {
    setErr('');
    if (!navigator?.mediaDevices?.getUserMedia) {
      setErr('Camera not supported. Use Chrome or Safari.'); return;
    }
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
      }
      streamRef.current = stream;

      // KEY FIX: set srcObject immediately, then wait for metadata
      const v = vidRef.current;
      if (!v) { stream.getTracks().forEach(t=>t.stop()); return; }
      v.srcObject   = stream;
      v.muted       = true;
      v.playsInline = true;
      v.autoplay    = true;

      // Wait for metadata then play
      await new Promise((res) => {
        if (v.readyState >= 1) { res(); return; }
        v.onloadedmetadata = res;
        setTimeout(res, 4000); // fallback
      });

      try { await v.play(); } catch { /* ignore autoplay policy */ }

      // STEP CHANGE AFTER video is ready
      setStep('guide');
    } catch(e) {
      const msg = e.name==='NotAllowedError'
        ? 'Camera permission denied. Allow it in browser settings → retry.'
        : e.name==='NotFoundError'
          ? 'No camera found on device.'
          : `Camera error: ${e.message}`;
      setErr(msg);
    }
  }, []);

  /* ── gyro ── */
  useEffect(() => {
    if (step !== 'guide' && step !== 'capturing') return;
    let handler;
    const attach = () => {
      handler = e => {
        const y = ((e.alpha||0)+360)%360;
        const p = e.beta||0;
        setDevYaw(Math.round(y));
        setDevPitch(Math.round(p));
        setHasGyro(true);
        if (step==='capturing') {
          const s = SHOTS[shotIdx]||SHOTS[0];
          const yd=((y-s.yaw+540)%360)-180, pd=p-s.pitch;
          setAligned(Math.abs(yd)<22&&Math.abs(pd)<18);
        }
      };
      window.addEventListener('deviceorientation', handler, true);
    };
    if (typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function') {
      DeviceOrientationEvent.requestPermission().then(p=>{ if(p==='granted') attach(); }).catch(()=>{});
    } else {
      attach();
    }
    return () => { if(handler) window.removeEventListener('deviceorientation',handler,true); };
  }, [step, shotIdx]); // eslint-disable-line

  /* ── take shot ── */
  const takeShot = useCallback(() => {
    const v = vidRef.current;
    if (!v || step!=='capturing') return;
    const shot = SHOTS[shotIdx];
    const cv   = document.createElement('canvas');
    cv.width=FW; cv.height=FH;
    try { cv.getContext('2d').drawImage(v,0,0,FW,FH); } catch { return; }
    cv.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      framesRef.current = [...framesRef.current, { blob,url,col:shot.col,row:shot.row,idx:shot.idx }];
      setThumbs(prev=>[...prev,url]);
      setDone(prev=>new Set([...prev,shot.idx]));
      const next=shotIdx+1;
      if (next>=TOTAL) { setShotIdx(next); setStep('stitching'); }
      else             { setShotIdx(next); setAligned(false); }
    },'image/jpeg',0.88);
  }, [step, shotIdx]);

  const startCapturing = useCallback(() => { setStep('capturing'); setShotIdx(0); setAligned(false); }, []);

  /* ── stitch ── */
  useEffect(() => {
    if (step!=='stitching') return;
    const t = setTimeout(async () => {
      try {
        const cv=document.createElement('canvas'); cv.width=PW; cv.height=PH;
        const ctx=cv.getContext('2d');
        ctx.fillStyle='#111'; ctx.fillRect(0,0,PW,PH);
        for (const f of framesRef.current) {
          const im=new window.Image(); im.src=f.url;
          await new Promise(r=>{im.onload=r;im.onerror=r;});
          ctx.drawImage(im, f.col*FW, f.row*FH, FW, FH);
        }
        const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.92));
        if (!blob){setStep('idle');return;}
        setPanoBlob(blob);
        setPanoUrl(URL.createObjectURL(blob));
        setStep('done');
        streamRef.current?.getTracks().forEach(t=>t.stop());
      } catch(e) { console.error(e); setStep('done'); }
    }, 200);
    return ()=>clearTimeout(t);
  }, [step]); // eslint-disable-line

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current=null;
    if(vidRef.current) vidRef.current.srcObject=null;
  }, []);

  const reset = useCallback(() => {
    stopCam();
    framesRef.current.forEach(f=>{try{URL.revokeObjectURL(f.url);}catch{}});
    framesRef.current=[];
    if(panoUrl) try{URL.revokeObjectURL(panoUrl);}catch{}
    setStep('idle'); setDone(new Set()); setShotIdx(0); setAligned(false);
    setPanoBlob(null); setPanoUrl(null); setErr(''); setThumbs([]);
  }, [stopCam, panoUrl]);

  return {
    vidRef, step, done, shotIdx, devYaw, devPitch, aligned, hasGyro,
    panoBlob, panoUrl, err, thumbs,
    progress: Math.round((done.size/TOTAL)*100),
    startCam, startCapturing, takeShot, reset,
  };
}

/* ══════════════════════════════════════
   360 VIEWER
══════════════════════════════════════ */
function Viewer({ src, onClose }) {
  const cvRef  = useRef(null);
  const wRef   = useRef(null);
  const [ar,setAr]=useState(false);
  const [gy,setGy]=useState(false);
  const [cmp,setCmp]=useState(0);
  const { onMD,onMM,onMU,onW,onTS,onTM,onTE,toggleAuto,reset,enableGyro,disableGyro,S }=use360(cvRef,src,true);

  useEffect(()=>{ const id=setInterval(()=>{ if(S.current) setCmp((((S.current.yaw*180/Math.PI)%360)+360)%360); },100); return()=>clearInterval(id); },[S]);
  useEffect(()=>{ const el=wRef.current; if(!el)return; el.addEventListener('wheel',onW,{passive:false}); return()=>el.removeEventListener('wheel',onW); },[onW]);

  const doAuto=()=>{ const v=toggleAuto(); setAr(v); };
  const doGyro=async()=>{ if(gy){disableGyro();setGy(false);}else{const ok=await enableGyro();setGy(ok);if(!ok)alert('Gyroscope unavailable.');} };
  const doFS=()=>{ if(!document.fullscreenElement) wRef.current?.requestFullscreen?.().catch(()=>{}); else document.exitFullscreen?.(); };

  return (
    <div className={styles.vWrap}>
      <div ref={wRef} className={styles.vCv} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
        <canvas ref={cvRef} className={styles.glCv} />
        <div className={styles.vCompass}>
          <div className={styles.vCmpRing} style={{transform:`rotate(${-cmp}deg)`}}>
            <span className={styles.cN}>N</span><span className={styles.cS}>S</span>
            <span className={styles.cE}>E</span><span className={styles.cW}>W</span>
          </div>
          <div className={styles.cDot}/>
        </div>
        <div className={styles.vCtrl}>
          <button className={styles.vcb} onClick={reset} title="Reset">⌖</button>
          <button className={`${styles.vcb} ${ar?styles.vcbOn:''}`} onClick={doAuto} title="Auto-rotate">↻</button>
          <button className={`${styles.vcb} ${gy?styles.vcbOn:''}`} onClick={doGyro} title="Gyro">📡</button>
          <button className={styles.vcb} onClick={doFS} title="Fullscreen">⛶</button>
          {onClose&&<button className={`${styles.vcb} ${styles.vcbX}`} onClick={onClose}>✕</button>}
        </div>
        <div className={styles.vHint}>Drag · Scroll to zoom · 📡 gyro</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   GALLERY CARD
══════════════════════════════════════ */
function Card({ p, onView, onDel, onRen }) {
  const [ed,setEd]=useState(false);
  const [nv,setNv]=useState(p.name);
  const [cf,setCf]=useState(false);
  const save=()=>{ if(nv.trim()) onRen(p.id,nv.trim()); setEd(false); };
  return (
    <div className={styles.gc}>
      <div className={styles.gcThumb} onClick={()=>onView(p)}>
        {p.url ? <img src={p.url} alt={p.name} className={styles.gcImg} loading="lazy"/> : <div className={styles.gcNone}>🌐</div>}
        <div className={styles.gcOvl}><span className={styles.gcViewLbl}>🔭 View 360°</span></div>
      </div>
      <div className={styles.gcBody}>
        {ed ? (
          <div className={styles.rnRow}>
            <input className={styles.rnIn} value={nv} onChange={e=>setNv(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setEd(false);}} autoFocus/>
            <button className={styles.rnOk} onClick={save}>✓</button>
            <button className={styles.rnNo} onClick={()=>setEd(false)}>✕</button>
          </div>
        ):(
          <div className={styles.gcName} onDoubleClick={()=>setEd(true)} title="Double-click to rename">{p.name}</div>
        )}
        <div className={styles.gcMeta}>
          <span className={styles.gcDate}>{p.createdAt?.toDate?.().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})||'—'}</span>
          <span className={styles.gcBadge}>📱 Local</span>
        </div>
        <div className={styles.gcActs}>
          <button className={styles.gBtn} onClick={()=>onView(p)}>🔭 View</button>
          <button className={styles.gBtn} onClick={()=>setEd(true)}>✏️</button>
          {cf
            ? <><button className={styles.gBtnR} onClick={()=>onDel(p)}>Confirm</button><button className={styles.gBtn} onClick={()=>setCf(false)}>Cancel</button></>
            : <button className={styles.gBtnR} onClick={()=>setCf(true)}>🗑</button>
          }
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════ */
export default function PanoramaPage() {
  const router=useRouter();
  const [uid,setUid]=useState(null);
  const [authOk,setAuthOk]=useState(false);
  const [dark,setDark]=useState(false);
  const [tab,setTab]=useState('gallery');
  const [panos,setPanos]=useState([]);
  const [loading,setLoading]=useState(false);
  const [viewing,setViewing]=useState(null);
  const [saving,setSaving]=useState(false);
  const [pName,setPName]=useState('');
  const cap=useCapture();

  useEffect(()=>{
    const u=onAuthStateChanged(auth,user=>{
      if(user){setUid(user.uid);setAuthOk(true);}
      else router.replace('/login');
    });
    return u;
  },[router]);

  const loadPanos=useCallback(async()=>{
    if(!uid)return;
    setLoading(true);
    try{
      const q=query(collection(db,`users/${uid}/panoramas`),orderBy('createdAt','desc'));
      const s=await getDocs(q);
      const list=await Promise.all(s.docs.map(async d=>{
        const data={id:d.id,...d.data()};
        const url=await idbGet(d.id).catch(()=>null);
        return{...data,url};
      }));
      setPanos(list);
    }catch(e){console.error(e);}
    setLoading(false);
  },[uid]);

  useEffect(()=>{if(uid)loadPanos();},[uid,loadPanos]);

  const savePano=async()=>{
    if(!cap.panoBlob||!uid)return;
    const name=pName.trim()||`Panorama ${new Date().toLocaleDateString('en-IN')}`;
    setSaving(true);
    try{
      const ref=await addDoc(collection(db,`users/${uid}/panoramas`),{name,shots:cap.done.size,createdAt:serverTimestamp()});
      const du=await blobToDataUrl(cap.panoBlob);
      await idbSave(ref.id,du);
      await loadPanos();
      cap.reset(); setPName(''); setTab('gallery');
    }catch(e){alert(`Save failed: ${e.message}`);}
    setSaving(false);
  };

  const delPano=async p=>{
    if(!uid)return;
    try{
      await deleteDoc(doc(db,`users/${uid}/panoramas`,p.id));
      await idbDel(p.id);
      setPanos(prev=>prev.filter(x=>x.id!==p.id));
      if(viewing?.id===p.id){setViewing(null);setTab('gallery');}
    }catch(e){console.error(e);}
  };

  const renPano=async(id,name)=>{
    try{
      await updateDoc(doc(db,`users/${uid}/panoramas`,id),{name});
      setPanos(prev=>prev.map(p=>p.id===id?{...p,name}:p));
    }catch(e){console.error(e);}
  };

  const uploadFile=async e=>{
    const f=e.target.files?.[0]; if(!f||!uid)return;
    setSaving(true);
    try{
      const name=f.name.replace(/\.[^.]+$/,'');
      const ref=await addDoc(collection(db,`users/${uid}/panoramas`),{name,shots:0,createdAt:serverTimestamp()});
      const du=await blobToDataUrl(f);
      await idbSave(ref.id,du);
      await loadPanos();
    }catch(e){alert('Upload failed.');}
    setSaving(false); e.target.value='';
  };

  const download=()=>{
    if(!cap.panoUrl)return;
    const a=document.createElement('a'); a.href=cap.panoUrl; a.download=`panorama-${Date.now()}.jpg`; a.click();
  };

  if(!authOk) return (
    <div className={styles.loaderScreen}><div className={styles.loaderRing}/><p>Loading…</p></div>
  );

  const curShot=SHOTS[Math.min(cap.shotIdx,TOTAL-1)];
  const TABS=[{id:'gallery',lbl:'🖼 Gallery'},{id:'capture',lbl:'📷 Capture'},...(viewing?[{id:'viewer',lbl:`🔭 ${viewing.name}`}]:[])];

  return (
    <div className={styles.page} data-theme={dark?'dark':''}>

      {/* TOP BAR */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={()=>router.push('/dashboard')}>← Dashboard</button>
        <div className={styles.brand}><div className={styles.brandIcon}>🌐</div><span>360 Panorama</span></div>
        <div className={styles.topRight}>
          <label className={styles.upBtn}>⬆ Upload<input type="file" accept="image/*" style={{display:'none'}} onChange={uploadFile}/></label>
          <span className={styles.cnt}>{panos.length} saved</span>
          <button className={styles.themeBtn} onClick={()=>setDark(d=>!d)}>{dark?'☀️':'🌙'}</button>
        </div>
      </div>

      {saving&&<div className={styles.savBar}><div className={styles.savFill}/></div>}

      {/* TABS */}
      <div className={styles.tabs}>
        {TABS.map(t=>(
          <button key={t.id} className={`${styles.tab} ${tab===t.id?styles.tabOn:''}`} onClick={()=>setTab(t.id)}>{t.lbl}</button>
        ))}
      </div>

      {/* ── GALLERY ── */}
      {tab==='gallery'&&(
        <div className={styles.content}>
          {loading?(
            <div className={styles.cLoader}><div className={styles.loaderRing}/><p>Loading…</p></div>
          ):panos.length===0?(
            <div className={styles.empty}>
              <div className={styles.emptyIco}>🌐</div>
              <div className={styles.emptyT}>No panoramas yet</div>
              <p className={styles.emptySub}>Capture a 360° panorama or upload an equirectangular image. Stored locally — no cloud needed.</p>
              <div className={styles.emptyActs}>
                <button className={styles.pri} onClick={()=>setTab('capture')}>📷 Capture Now</button>
                <label className={styles.sec}>⬆ Upload<input type="file" accept="image/*" style={{display:'none'}} onChange={uploadFile}/></label>
              </div>
            </div>
          ):(
            <div className={styles.grid}>
              {panos.map(p=><Card key={p.id} p={p} onView={x=>{setViewing(x);setTab('viewer');}} onDel={delPano} onRen={renPano}/>)}
            </div>
          )}
        </div>
      )}

      {/* ── CAPTURE ── */}
      {tab==='capture'&&(
        <div className={styles.content}>
          <div className={styles.capWrap}>

            {/* IDLE */}
            {cap.step==='idle'&&(
              <div className={styles.capIdle}>
                <div className={styles.capIdleIco}>🌐</div>
                <h2 className={styles.capIdleT}>360° Panorama Capture</h2>
                <p className={styles.capIdleSub}>Guided across <b>3 levels</b> · <b>{TOTAL} shots</b> total</p>
                <div className={styles.capSteps}>
                  {[{i:'📷',t:'Allow camera access'},{i:'🧭',t:'Follow direction guide'},{i:'🔵',t:'Tap shutter when aligned'},{i:'✅',t:'Auto-stitches to 360°'}].map((s,i)=>(
                    <div key={i} className={styles.capStep}><span className={styles.capStepIco}>{s.i}</span><span className={styles.capStepT}>{s.t}</span></div>
                  ))}
                </div>
                {cap.err&&<div className={styles.camErr}>{cap.err}</div>}
                <button className={styles.pri} style={{marginTop:24}} onClick={cap.startCam}>📷 Start Camera</button>
              </div>
            )}

            {/* GUIDE — camera on, preview showing */}
            {cap.step==='guide'&&(
              <div className={styles.capGuide}>
                <div className={styles.vidBox}>
                  <video ref={cap.vidRef} className={styles.vid} playsInline muted autoPlay/>
                  <div className={styles.vidOvl}>
                    <div className={styles.reticle}/>
                    <div className={styles.guideTxt}>Camera ready — tap Start</div>
                  </div>
                </div>
                <div className={styles.guideBtns}>
                  <button className={styles.pri} onClick={cap.startCapturing}>● Start Guided Capture ({TOTAL} shots)</button>
                  <button className={styles.sec} onClick={cap.reset}>Cancel</button>
                </div>
              </div>
            )}

            {/* CAPTURING */}
            {cap.step==='capturing'&&(
              <div className={styles.capFlow}>
                <div className={styles.vidBox}>
                  <video ref={cap.vidRef} className={styles.vid} playsInline muted autoPlay/>
                  <div className={styles.vidOvl}>
                    <div className={`${styles.reticle} ${cap.aligned?styles.retOk:''}`}/>
                    <div className={styles.shotCnt}>{cap.done.size}/{TOTAL}</div>
                    <div className={styles.lvlLbl}><span>{curShot.icon}</span><span>{curShot.label}</span></div>
                    {cap.aligned&&<div className={styles.alnTick}>✓ Aligned — Tap shutter!</div>}
                  </div>
                  <button className={`${styles.shutter} ${cap.aligned?styles.shutterOn:''}`} onClick={cap.takeShot}>
                    <div className={styles.shutterIn}/>
                  </button>
                </div>

                <DirGuide shotIdx={cap.shotIdx} done={cap.done} yaw={cap.devYaw} pitch={cap.devPitch} hasGyro={cap.hasGyro}/>

                {cap.thumbs.length>0&&(
                  <div className={styles.strip}>
                    {cap.thumbs.slice(-12).map((u,i)=><img key={i} src={u} className={styles.stripThumb} alt=""/>)}
                  </div>
                )}

                <div className={styles.progBar}><div className={styles.progFill} style={{width:`${cap.progress}%`}}/></div>
                <div className={styles.progLbl}>{cap.done.size} / {TOTAL} shots captured</div>
                <button className={`${styles.sec} ${styles.cancelBtn}`} onClick={cap.reset}>✕ Cancel</button>
              </div>
            )}

            {/* STITCHING */}
            {cap.step==='stitching'&&(
              <div className={styles.stitchBox}>
                <div className={styles.stitchIco}>🧵</div>
                <div className={styles.stitchT}>Stitching panorama…</div>
                <p className={styles.stitchSub}>Assembling {cap.done.size} frames — may take a few seconds</p>
                <div className={styles.stitchBar}><div className={styles.stitchFill}/></div>
              </div>
            )}

            {/* DONE */}
            {cap.step==='done'&&cap.panoUrl&&(
              <div className={styles.doneBox}>
                <div className={styles.doneHead}>
                  <div className={styles.doneBadge}>✅ Panorama Ready</div>
                  <h2 className={styles.doneT}>Your 360° panorama is ready!</h2>
                  <p className={styles.doneSub}>{cap.done.size} frames · drag below to explore</p>
                </div>
                <div className={styles.doneViewer}><Viewer src={cap.panoUrl}/></div>
                <div className={styles.doneFoot}>
                  <input className={styles.nameIn} value={pName} onChange={e=>setPName(e.target.value)} placeholder="Name your panorama…"/>
                  <div className={styles.doneBtns}>
                    <button className={styles.pri} onClick={savePano} disabled={saving}>{saving?'Saving…':'💾 Save to Gallery'}</button>
                    <button className={styles.sec} onClick={download}>⬇ Download</button>
                    <button className={styles.sec} onClick={cap.reset}>🔄 Retake</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VIEWER ── */}
      {tab==='viewer'&&viewing&&(
        <div className={styles.viewPage}>
          <div className={styles.viewHdr}>
            <div className={styles.viewHdrT}>🔭 {viewing.name}</div>
            <button className={styles.sec} onClick={()=>{setTab('gallery');setViewing(null);}}>← Gallery</button>
          </div>
          <Viewer src={viewing.url} onClose={()=>{setTab('gallery');setViewing(null);}}/>
        </div>
      )}
    </div>
  );
}
