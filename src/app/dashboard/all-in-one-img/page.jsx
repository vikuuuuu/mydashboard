"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS = [
  { id:"resize",    icon:"⤢",  label:"Resize"    },
  { id:"compress",  icon:"⚡",  label:"Compress"  },
  { id:"convert",   icon:"↔",  label:"Convert"   },
  { id:"crop",      icon:"✂",  label:"Crop"      },
  { id:"rotate",    icon:"↻",  label:"Rotate"    },
  { id:"adjust",    icon:"◐",  label:"Adjust"    },
  { id:"filter",    icon:"✦",  label:"Filters"   },
  { id:"watermark", icon:"◈",  label:"Watermark" },
  { id:"text",      icon:"T",  label:"Text"      },
  { id:"bgremove",  icon:"🪄", label:"BG Remove" },
  { id:"bgblur",    icon:"🌫", label:"BG Blur"   },
  { id:"bgreplace", icon:"🎨", label:"BG Replace"},
  { id:"vignette",  icon:"◉",  label:"Vignette"  },
  { id:"border",    icon:"▢",  label:"Border"    },
  { id:"sharpen",   icon:"🔬", label:"Sharpen"   },
  { id:"denoise",   icon:"✨", label:"Denoise"   },
  { id:"pixelate",  icon:"⊞",  label:"Pixelate"  },
  { id:"overlay",   icon:"▤",  label:"Overlay"   },
];

const FORMATS = ["png","jpg","webp","bmp","gif","tiff","ico","avif"];

const FILTERS = [
  {id:"none",label:"Original"},{id:"grayscale",label:"Grayscale"},
  {id:"sepia",label:"Sepia"},{id:"invert",label:"Invert"},
  {id:"blur",label:"Blur"},{id:"brightness",label:"Bright"},
  {id:"contrast",label:"Contrast"},{id:"saturate",label:"Vivid"},
  {id:"hue-rotate",label:"Hue"},{id:"vintage",label:"Vintage"},
  {id:"cool",label:"Cool"},{id:"warm",label:"Warm"},
];

const BG_COLORS = ["#ffffff","#000000","#f8f9fa","#212529","#4361ee","#e63946","#0f9d6e","#f77f00","#9b5de5","#f15bb5","#fee440","#00bbf9"];

const GRADIENTS = [
  {label:"Sunset",  style:"linear-gradient(135deg,rgba(255,94,98,0.85),rgba(255,195,113,0.85))"},
  {label:"Ocean",   style:"linear-gradient(135deg,rgba(0,180,219,0.85),rgba(0,131,176,0.85))"},
  {label:"Forest",  style:"linear-gradient(135deg,rgba(34,193,195,0.85),rgba(45,149,48,0.85))"},
  {label:"Purple",  style:"linear-gradient(135deg,rgba(155,93,229,0.85),rgba(67,97,238,0.85))"},
  {label:"Rose",    style:"linear-gradient(135deg,rgba(241,91,181,0.85),rgba(230,57,70,0.85))"},
  {label:"Gold",    style:"linear-gradient(135deg,rgba(247,127,0,0.85),rgba(254,212,0,0.85))"},
  {label:"Night",   style:"linear-gradient(135deg,rgba(15,12,41,0.95),rgba(48,43,99,0.95))"},
  {label:"Mist",    style:"linear-gradient(135deg,rgba(245,245,245,0.85),rgba(200,210,220,0.85))"},
];

const EDIT_LABELS = {
  resize:"Resize",compress:"Compress",convert:"Convert",crop:"Crop",
  rotate:"Rotate/Flip",adjust:"Adjust",filter:"Filter",watermark:"Watermark",
  text:"Text",bgremove:"BG Remove",bgblur:"BG Blur",bgreplace:"BG Replace",
  vignette:"Vignette",border:"Border",sharpen:"Sharpen",denoise:"Denoise",
  pixelate:"Pixelate",overlay:"Overlay",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: {minHeight:"100vh",background:"#0d0f1a",fontFamily:"'DM Sans',sans-serif",color:"#e8ecf8",display:"flex",flexDirection:"column"},
  topBar: {display:"flex",alignItems:"center",gap:12,padding:"12px 24px",background:"#13162a",borderBottom:"1px solid rgba(99,120,200,0.18)",position:"sticky",top:0,zIndex:100,flexWrap:"wrap"},
  brand: {display:"flex",alignItems:"center",gap:8,fontFamily:"'Syne',sans-serif",fontSize:"1.05rem",fontWeight:800,letterSpacing:"-0.02em",color:"#e8ecf8"},
  brandIcon: {width:32,height:32,background:"linear-gradient(135deg,#4361ee,#7c5cbf)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,flexShrink:0},
  statChip: {background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:999,padding:"3px 10px",fontFamily:"monospace",fontSize:11,color:"#9ca8d0"},
  clearBtn: {background:"rgba(230,57,70,0.12)",border:"1px solid rgba(230,57,70,0.25)",color:"#e63946",fontSize:12,fontWeight:600,padding:"5px 12px",borderRadius:999,cursor:"pointer"},
  layout: {display:"grid",gridTemplateColumns:"320px 1fr",flex:1},
  left: {borderRight:"1px solid rgba(99,120,200,0.15)",background:"#13162a",display:"flex",flexDirection:"column",overflowY:"auto"},
  right: {display:"flex",flexDirection:"column",overflow:"hidden"},
  dropZone: (active,hasFile)=>({margin:14,border:`2px dashed ${active?"#4361ee":"rgba(99,120,200,0.3)"}`,borderRadius:14,minHeight:hasFile?0:160,display:"flex",alignItems:"center",justifyContent:"center",cursor:hasFile?"default":"pointer",transition:"all 0.2s",background:active?"rgba(67,97,238,0.08)":"rgba(255,255,255,0.02)",flexShrink:0}),
  dropContent: {display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:24,textAlign:"center"},
  prevImg: {width:"100%",maxHeight:200,objectFit:"contain",borderRadius:10,padding:8},
  infoRow: {display:"flex",gap:6,padding:"8px 14px",flexWrap:"wrap",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.02)"},
  infoChip: {background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:999,padding:"2px 9px",fontFamily:"monospace",fontSize:10.5,color:"#9ca8d0"},
  pipelineBox: {margin:"0 14px 8px",background:"rgba(67,97,238,0.08)",border:"1px solid rgba(67,97,238,0.2)",borderRadius:10,padding:"10px 12px"},
  pipelineTitle: {fontSize:11,fontWeight:700,color:"#7c8ed4",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8},
  pipelineItem: {display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"5px 10px",marginBottom:5,fontSize:12,color:"#c5caeb"},
  pipelineApplyBtn: {background:"linear-gradient(135deg,#4361ee,#7c5cbf)",color:"#fff",border:"none",fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:700,padding:"9px 18px",borderRadius:8,cursor:"pointer",width:"100%",marginTop:4,transition:"opacity 0.15s"},
  resultBox: {margin:"0 14px 14px",background:"rgba(15,157,110,0.08)",border:"1px solid rgba(15,157,110,0.2)",borderRadius:10,padding:"10px 12px"},
  resultBadge: {fontSize:12,fontWeight:600,color:"#0f9d6e",marginBottom:6},
  resultImg: {width:"100%",borderRadius:8,maxHeight:140,objectFit:"contain",margin:"6px 0"},
  dlBtn: {background:"linear-gradient(135deg,#4361ee,#7c5cbf)",color:"#fff",border:"none",fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:700,padding:"9px 18px",borderRadius:8,cursor:"pointer",width:"100%",transition:"opacity 0.15s"},
  tabBar: {display:"flex",borderBottom:"1px solid rgba(99,120,200,0.15)",background:"#0f1221",overflowX:"auto",flexShrink:0,scrollbarWidth:"thin"},
  tabBtn: (active)=>({display:"flex",alignItems:"center",gap:5,padding:"10px 14px",border:"none",borderBottom:`2.5px solid ${active?"#4361ee":"transparent"}`,background:active?"rgba(67,97,238,0.08)":"none",color:active?"#7c9bff":"#7a84b0",fontFamily:"'DM Sans',sans-serif",fontSize:12.5,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.15s"}),
  controls: {padding:"18px 20px",overflowY:"auto",flex:1},
  section: {display:"flex",flexDirection:"column",gap:16},
  sectionTitle: {fontFamily:"'Syne',sans-serif",fontSize:14.5,fontWeight:800,color:"#e8ecf8",margin:0},
  sectionDesc: {fontSize:12,color:"#7a84b0",margin:"-8px 0 0"},
  field: {display:"flex",flexDirection:"column",gap:6},
  label: {fontSize:10.5,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase",color:"#7a84b0"},
  textInput: {background:"rgba(255,255,255,0.05)",border:"1.5px solid rgba(99,120,200,0.2)",color:"#e8ecf8",fontFamily:"'DM Sans',sans-serif",fontSize:13,padding:"8px 11px",borderRadius:8,outline:"none",width:"100%",boxSizing:"border-box"},
  chip: (active)=>({padding:"6px 13px",borderRadius:999,border:`1.5px solid ${active?"#4361ee":"rgba(99,120,200,0.25)"}`,background:active?"#4361ee":"rgba(255,255,255,0.04)",color:active?"#fff":"#9ca8d0",fontSize:12,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}),
  presetChip: (active)=>({padding:"5px 11px",borderRadius:999,border:`1.5px solid ${active?"#4361ee":"rgba(99,120,200,0.2)"}`,background:active?"rgba(67,97,238,0.15)":"rgba(255,255,255,0.03)",color:active?"#7c9bff":"#9ca8d0",fontSize:11.5,fontWeight:600,cursor:"pointer",display:"flex",gap:5,alignItems:"center"}),
  formatChip: (active)=>({padding:"9px 5px",borderRadius:8,border:`1.5px solid ${active?"#4361ee":"rgba(99,120,200,0.2)"}`,background:active?"#4361ee":"rgba(255,255,255,0.03)",color:active?"#fff":"#9ca8d0",fontFamily:"monospace",fontSize:11.5,fontWeight:700,cursor:"pointer",textAlign:"center"}),
  slider: {WebkitAppearance:"none",appearance:"none",width:"100%",height:4,borderRadius:999,background:"rgba(99,120,200,0.25)",outline:"none",cursor:"pointer"},
  sliderLabels: {display:"flex",justifyContent:"space-between",fontSize:10,color:"#5a6280"},
  valLabel: {color:"#7c9bff",fontFamily:"monospace"},
  colorSwatch: (active)=>({width:26,height:26,borderRadius:"50%",border:`2px solid ${active?"#4361ee":"rgba(255,255,255,0.15)"}`,cursor:"pointer",transition:"transform 0.15s, border-color 0.15s",transform:active?"scale(1.15)":"scale(1)"}),
  colorPicker: {width:26,height:26,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.15)",padding:0,cursor:"pointer",background:"none"},
  actionBtn: (busy)=>({display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:12,border:"none",borderRadius:8,background:busy?"#2d4abc":"linear-gradient(135deg,#4361ee,#7c5cbf)",color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:13.5,fontWeight:700,letterSpacing:"0.04em",cursor:busy?"not-allowed":"pointer",opacity:busy?0.7:1,transition:"all 0.2s"}),
  addPipelineBtn: {display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"9px 12px",border:"1.5px dashed rgba(67,97,238,0.4)",borderRadius:8,background:"rgba(67,97,238,0.04)",color:"#6b7fff",fontFamily:"'DM Sans',sans-serif",fontSize:12.5,fontWeight:600,cursor:"pointer",transition:"all 0.15s"},
  spinner: {display:"inline-block",width:13,height:13,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite"},
  infoBox: {display:"flex",alignItems:"flex-start",gap:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(99,120,200,0.15)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#7a84b0"},
  noImageHint: {padding:20,textAlign:"center",color:"#5a6280",fontSize:12.5,fontStyle:"italic"},
  filterGrid: {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7},
  filterChip: (active)=>({display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"7px 3px",borderRadius:8,border:`1.5px solid ${active?"#4361ee":"rgba(99,120,200,0.2)"}`,background:active?"rgba(67,97,238,0.12)":"rgba(255,255,255,0.03)",color:active?"#7c9bff":"#9ca8d0",fontSize:10.5,fontWeight:600,cursor:"pointer",overflow:"hidden"}),
  filterThumb: {width:"100%",height:38,objectFit:"cover",borderRadius:4},
  historyBox: {borderTop:"1px solid rgba(99,120,200,0.15)",padding:"10px 14px"},
  histItem: {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 8px",borderRadius:6,marginBottom:4,background:"rgba(255,255,255,0.03)",fontSize:12,color:"#7a84b0"},
  gradGrid: {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7},
  gradChip: (active)=>({height:44,borderRadius:8,border:`2px solid ${active?"#4361ee":"transparent"}`,cursor:"pointer",display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:4,fontSize:10,fontWeight:700,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.6)",transition:"all 0.15s"}),
  posGrid: {display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6},
  posChip: (active)=>({padding:"7px 4px",borderRadius:7,border:`1.5px solid ${active?"#4361ee":"rgba(99,120,200,0.2)"}`,background:active?"rgba(67,97,238,0.12)":"rgba(255,255,255,0.03)",color:active?"#7c9bff":"#9ca8d0",fontSize:11,fontWeight:600,cursor:"pointer",textAlign:"center"}),
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ImageStudioPro() {
  const [tab, setTab] = useState("resize");
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null); // current working dataUrl
  const [origPreview, setOrigPreview] = useState(null);
  const [origSize, setOrigSize] = useState(null);
  const [result, setResult] = useState(null);
  const [resultInfo, setResultInfo] = useState(null);
  const [isDrag, setIsDrag] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("Processing…");

  // Pipeline
  const [pipeline, setPipeline] = useState([]);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineMode, setPipelineMode] = useState(false);

  // History (undo)
  const [history, setHistory] = useState([]);

  // Per-tab settings
  const [rWidth, setRWidth] = useState(""); const [rHeight, setRHeight] = useState(""); const [keepRatio, setKeepRatio] = useState(true);
  const [targetKB, setTargetKB] = useState(200);
  const [format, setFormat] = useState("png");
  const [cropX, setCropX] = useState(0); const [cropY, setCropY] = useState(0); const [cropW, setCropW] = useState(""); const [cropH, setCropH] = useState("");
  const [cropAspect, setCropAspect] = useState("free");
  const [angle, setAngle] = useState(90); const [flipH, setFlipH] = useState(false); const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(100); const [contrast, setContrast] = useState(100); const [saturation, setSaturation] = useState(100); const [sharpness, setSharpness] = useState(0); const [exposure, setExposure] = useState(0);
  const [activeFilter, setActiveFilter] = useState("none"); const [filterVal, setFilterVal] = useState(80);
  const [wmText, setWmText] = useState("© My Image"); const [wmPos, setWmPos] = useState("bottom-right"); const [wmSize, setWmSize] = useState(32); const [wmOpacity, setWmOpacity] = useState(70); const [wmColor, setWmColor] = useState("#ffffff");
  const [textContent, setTextContent] = useState("Hello World"); const [textPos, setTextPos] = useState("center"); const [textSize, setTextSize] = useState(48); const [textColor, setTextColor] = useState("#ffffff"); const [textBg, setTextBg] = useState(false); const [textFont, setTextFont] = useState("sans-serif");
  const [bgThreshold, setBgThreshold] = useState(30); const [bgToleranceMode, setBgToleranceMode] = useState("auto");
  const [bgBlurRadius, setBgBlurRadius] = useState(10); const [bgBlurMethod, setBgBlurMethod] = useState("edge");
  const [bgReplaceColor, setBgReplaceColor] = useState("#4361ee"); const [bgReplaceMode, setBgReplaceMode] = useState("color"); const [bgGradient, setBgGradient] = useState(GRADIENTS[0].style);
  const [vignetteStrength, setVignetteStrength] = useState(50); const [vignetteColor, setVignetteColor] = useState("#000000");
  const [borderSize, setBorderSize] = useState(20); const [borderColor, setBorderColor] = useState("#ffffff"); const [borderStyle, setBorderStyle] = useState("solid");
  const [sharpenAmount, setSharpenAmount] = useState(50);
  const [denoiseLevel, setDenoiseLevel] = useState(3);
  const [pixelSize, setPixelSize] = useState(10); const [pixelRegion, setPixelRegion] = useState("full");
  const [overlayGradient, setOverlayGradient] = useState(GRADIENTS[0].style); const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [aiProcessing, setAiProcessing] = useState(false);

  const fileInputRef = useRef();

  const loadImage = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setResult(null); setResultInfo(null); setPipeline([]); setHistory([]);
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setOrigSize({w:img.width,h:img.height,kb:(file.size/1024).toFixed(1)});
      setRWidth(String(img.width)); setRHeight(String(img.height));
      setCropW(String(img.width)); setCropH(String(img.height));
    };
    img.src = url;
    // convert to dataUrl for pipeline
    const reader = new FileReader();
    reader.onload = (e) => { setPreview(e.target.result); setOrigPreview(e.target.result); };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInput = (e) => loadImage(e.target.files?.[0]);
  const handleDrop = (e) => { e.preventDefault(); setIsDrag(false); loadImage(e.dataTransfer.files?.[0]); };

  // Get img from dataUrl
  const getImgFromUrl = (url) => new Promise((res) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => res(img);
  });

  const pushHistory = (dataUrl, label) => {
    setHistory(h => [{dataUrl, label, time: new Date().toLocaleTimeString()}, ...h.slice(0,9)]);
  };

  // ── Single-step processors ──────────────────────────────────────────────────
  const processors = {
    async resize(src, opts={}) {
      const {w=rWidth,h=rHeight} = opts;
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=Number(w); c.height=Number(h);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      return {dataUrl:c.toDataURL("image/png"),info:`${w}×${h}px`};
    },
    async compress(src,opts={}) {
      const {kb=targetKB} = opts;
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=img.width; c.height=img.height;
      c.getContext("2d").drawImage(img,0,0);
      let q=0.92,out,size;
      do { out=c.toDataURL("image/jpeg",q); size=atob(out.split(",")[1]).length/1024; q-=0.05; } while(size>kb&&q>0.05);
      return {dataUrl:out,info:`${size.toFixed(1)}KB`};
    },
    async convert(src,opts={}) {
      const {fmt=format} = opts;
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=img.width; c.height=img.height;
      c.getContext("2d").drawImage(img,0,0);
      const mime = fmt==="jpg"?"image/jpeg":`image/${fmt}`;
      return {dataUrl:c.toDataURL(mime),info:fmt.toUpperCase()};
    },
    async crop(src,opts={}) {
      const {x=Number(cropX),y=Number(cropY),w=Number(cropW),h=Number(cropH)} = opts;
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,x,y,w,h,0,0,w,h);
      return {dataUrl:c.toDataURL("image/png"),info:`${w}×${h} from (${x},${y})`};
    },
    async rotate(src,opts={}) {
      const {a=angle,fh=flipH,fv=flipV} = opts;
      const img = await getImgFromUrl(src);
      const rad=(a*Math.PI)/180;
      const sin=Math.abs(Math.sin(rad)),cos=Math.abs(Math.cos(rad));
      const c = document.createElement("canvas");
      c.width=img.width*cos+img.height*sin;
      c.height=img.width*sin+img.height*cos;
      const ctx=c.getContext("2d");
      ctx.translate(c.width/2,c.height/2); ctx.rotate(rad);
      if(fh)ctx.scale(-1,1); if(fv)ctx.scale(1,-1);
      ctx.drawImage(img,-img.width/2,-img.height/2);
      return {dataUrl:c.toDataURL("image/png"),info:`${a}°${fh?" +FlipH":""}${fv?" +FlipV":""}`};
    },
    async adjust(src) {
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=img.width; c.height=img.height;
      const ctx=c.getContext("2d");
      ctx.filter=`brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(img,0,0);
      // Exposure
      if(exposure!==0){
        const d=ctx.getImageData(0,0,c.width,c.height);
        const factor=exposure>0?1+exposure/100:1/(1-exposure/100);
        for(let i=0;i<d.data.length;i+=4){
          for(let ch=0;ch<3;ch++) d.data[i+ch]=Math.min(255,Math.max(0,d.data[i+ch]*factor));
        }
        ctx.putImageData(d,0,0);
      }
      return {dataUrl:c.toDataURL("image/png"),info:`B:${brightness} C:${contrast} S:${saturation}`};
    },
    async filter(src) {
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=img.width; c.height=img.height;
      const ctx=c.getContext("2d");
      const v=filterVal;
      if(activeFilter==="vintage"){
        ctx.drawImage(img,0,0);
        const d=ctx.getImageData(0,0,c.width,c.height);
        for(let i=0;i<d.data.length;i+=4){
          const r=d.data[i],g=d.data[i+1],b=d.data[i+2];
          d.data[i]=Math.min(255,r*0.9+g*0.3+b*0.1);
          d.data[i+1]=Math.min(255,r*0.3+g*0.7+b*0.1);
          d.data[i+2]=Math.min(255,r*0.1+g*0.1+b*0.6);
        }
        ctx.putImageData(d,0,0);
      } else if(activeFilter==="cool"){
        ctx.drawImage(img,0,0);
        const d=ctx.getImageData(0,0,c.width,c.height);
        for(let i=0;i<d.data.length;i+=4){ d.data[i]=Math.max(0,d.data[i]-20); d.data[i+2]=Math.min(255,d.data[i+2]+30); }
        ctx.putImageData(d,0,0);
      } else if(activeFilter==="warm"){
        ctx.drawImage(img,0,0);
        const d=ctx.getImageData(0,0,c.width,c.height);
        for(let i=0;i<d.data.length;i+=4){ d.data[i]=Math.min(255,d.data[i]+30); d.data[i+2]=Math.max(0,d.data[i+2]-20); }
        ctx.putImageData(d,0,0);
      } else {
        const map={grayscale:`grayscale(${v}%)`,sepia:`sepia(${v}%)`,invert:`invert(${v}%)`,blur:`blur(${(v/100)*10}px)`,brightness:`brightness(${v+50}%)`,contrast:`contrast(${v+50}%)`,saturate:`saturate(${v*3}%)`,"hue-rotate":`hue-rotate(${v*3.6}deg)`,none:"none"};
        ctx.filter=map[activeFilter]||"none"; ctx.drawImage(img,0,0);
      }
      return {dataUrl:c.toDataURL("image/png"),info:FILTERS.find(f=>f.id===activeFilter)?.label};
    },
    async watermark(src) {
      if(!wmText) return {dataUrl:src,info:"No text"};
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=img.width; c.height=img.height;
      const ctx=c.getContext("2d");
      ctx.drawImage(img,0,0);
      ctx.font=`bold ${wmSize}px sans-serif`;
      ctx.fillStyle=wmColor+Math.round((wmOpacity/100)*255).toString(16).padStart(2,"0");
      ctx.strokeStyle=`rgba(0,0,0,${(wmOpacity/100)*0.5})`; ctx.lineWidth=2;
      const tw=ctx.measureText(wmText).width,pad=24;
      const positions={"top-left":[pad,wmSize+pad],"top-right":[c.width-tw-pad,wmSize+pad],"center":[(c.width-tw)/2,(c.height+wmSize)/2],"bottom-left":[pad,c.height-pad],"bottom-right":[c.width-tw-pad,c.height-pad]};
      const [x,y]=positions[wmPos]||positions["bottom-right"];
      ctx.strokeText(wmText,x,y); ctx.fillText(wmText,x,y);
      return {dataUrl:c.toDataURL("image/png"),info:wmText};
    },
    async text(src) {
      if(!textContent) return {dataUrl:src,info:"No text"};
      const img = await getImgFromUrl(src);
      const c = document.createElement("canvas");
      c.width=img.width; c.height=img.height;
      const ctx=c.getContext("2d");
      ctx.drawImage(img,0,0);
      ctx.font=`bold ${textSize}px ${textFont}`;
      const tw=ctx.measureText(textContent).width,pad=20;
      const positions={"top-left":[pad,textSize+pad],"top-right":[c.width-tw-pad,textSize+pad],"center":[(c.width-tw)/2,(c.height+textSize)/2],"bottom-left":[pad,c.height-pad],"bottom-right":[c.width-tw-pad,c.height-pad]};
      const [x,y]=positions[textPos]||positions["center"];
      if(textBg){ ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(x-8,y-textSize-4,tw+16,textSize+14); }
      ctx.fillStyle=textColor; ctx.fillText(textContent,x,y);
      return {dataUrl:c.toDataURL("image/png"),info:textContent};
    },

    // ── IMPROVED BG REMOVE: multi-pass flood fill from all 4 corners ──
    async bgremove(src) {
      const img = await getImgFromUrl(src);
      const W=img.width,H=img.height;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d"); ctx.drawImage(img,0,0);
      const imageData=ctx.getImageData(0,0,W,H);
      const data=imageData.data;
      const thresh = bgToleranceMode==="auto"?45:bgThreshold;
      const feather=20;

      // Sample background from all 4 corners (more robust)
      const corners=[];
      const cs=Math.min(10,Math.floor(W/6),Math.floor(H/6));
      for(let sy=0;sy<cs;sy++) for(let sx=0;sx<cs;sx++){
        const idx=(sy*W+sx)*4; corners.push([data[idx],data[idx+1],data[idx+2]]);
        const idx2=(sy*W+(W-1-sx))*4; corners.push([data[idx2],data[idx2+1],data[idx2+2]]);
        const idx3=((H-1-sy)*W+sx)*4; corners.push([data[idx3],data[idx3+1],data[idx3+2]]);
        const idx4=((H-1-sy)*W+(W-1-sx))*4; corners.push([data[idx4],data[idx4+1],data[idx4+2]]);
      }
      // Cluster the most common corner color
      let sR=0,sG=0,sB=0;
      corners.forEach(([r,g,b])=>{sR+=r;sG+=g;sB+=b;});
      sR/=corners.length; sG/=corners.length; sB/=corners.length;

      // BFS flood fill from all 4 borders instead of simple threshold
      const visited=new Uint8Array(W*H);
      const queue=[];
      // Seed from all border pixels
      for(let x=0;x<W;x++){ queue.push(x); queue.push((H-1)*W+x); }
      for(let y=1;y<H-1;y++){ queue.push(y*W); queue.push(y*W+W-1); }

      while(queue.length>0){
        const idx=queue.pop();
        if(visited[idx]) continue;
        const i=idx*4;
        const dr=Math.abs(data[i]-sR),dg=Math.abs(data[i+1]-sG),db=Math.abs(data[i+2]-sB);
        const dist=Math.sqrt(dr*dr+dg*dg+db*db);
        if(dist>thresh+feather) continue;
        visited[idx]=1;
        // soft edge
        const alpha = dist<thresh ? 0 : Math.round(((dist-thresh)/feather)*255);
        data[i+3]=alpha;
        const x=idx%W,y=Math.floor(idx/W);
        if(x>0)queue.push(idx-1);
        if(x<W-1)queue.push(idx+1);
        if(y>0)queue.push(idx-W);
        if(y<H-1)queue.push(idx+W);
      }
      ctx.putImageData(imageData,0,0);
      return {dataUrl:c.toDataURL("image/png"),info:"Background removed (transparent)"};
    },

    // ── IMPROVED BG BLUR: GrabCut-like approach using edge map ──
    async bgblur(src) {
      const img = await getImgFromUrl(src);
      const W=img.width,H=img.height;

      // Create blurred background
      const blurC=document.createElement("canvas"); blurC.width=W; blurC.height=H;
      const bCtx=blurC.getContext("2d");
      bCtx.filter=`blur(${bgBlurRadius}px)`;
      bCtx.drawImage(img,0,0);

      // Create grayscale edge-detected mask
      const edgeC=document.createElement("canvas"); edgeC.width=W; edgeC.height=H;
      const eCtx=edgeC.getContext("2d");
      eCtx.drawImage(img,0,0);
      const ed=eCtx.getImageData(0,0,W,H);
      const edData=ed.data;

      // Sobel edge detection to find subject
      const gray=new Float32Array(W*H);
      for(let i=0;i<W*H;i++) gray[i]=(edData[i*4]*0.299+edData[i*4+1]*0.587+edData[i*4+2]*0.114)/255;

      // Build subject mask: use gradient of image to find edges, then fill subject region
      const edgeMag=new Float32Array(W*H);
      let maxEdge=0;
      for(let y=1;y<H-1;y++){
        for(let x=1;x<W-1;x++){
          const gx=gray[y*W+x+1]-gray[y*W+x-1];
          const gy=gray[(y+1)*W+x]-gray[(y-1)*W+x];
          const mag=Math.sqrt(gx*gx+gy*gy);
          edgeMag[y*W+x]=mag;
          if(mag>maxEdge)maxEdge=mag;
        }
      }

      // Subject confidence = high edge density in center region + distance from border
      const subjectMask=new Float32Array(W*H);
      const cx=W/2,cy=H/2;
      // Use center-weighted distance field + edge boosts
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          const i=y*W+x;
          const distFromCenter=Math.sqrt(((x-cx)/cx)**2+((y-cy)/cy)**2);
          const centerWeight=Math.max(0,1-distFromCenter*0.9);
          const edgeBoost=edgeMag[i]/Math.max(maxEdge,0.001);
          subjectMask[i]=centerWeight*0.6+edgeBoost*0.4;
        }
      }

      // Smooth the mask
      const smoothed=new Float32Array(W*H);
      const r2=Math.max(2,Math.floor(W/20));
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          let sum=0,count=0;
          for(let dy=-r2;dy<=r2;dy++) for(let dx=-r2;dx<=r2;dx++){
            const nx=x+dx,ny=y+dy;
            if(nx>=0&&nx<W&&ny>=0&&ny<H){sum+=subjectMask[ny*W+nx];count++;}
          }
          smoothed[y*W+x]=sum/count;
        }
      }

      // Composite: bg=blurred, fg=original, blend by mask
      const result=document.createElement("canvas"); result.width=W; result.height=H;
      const rCtx=result.getContext("2d");
      rCtx.drawImage(blurC,0,0);
      const blurData=rCtx.getImageData(0,0,W,H);
      const origD=eCtx.getImageData(0,0,W,H);
      const blurDataArr=blurData.data;
      const origArr=origD.data;
      for(let i=0;i<W*H;i++){
        const t=Math.pow(Math.min(1,Math.max(0,smoothed[i]*1.4-0.1)),1.5);
        for(let ch=0;ch<3;ch++) blurDataArr[i*4+ch]=Math.round(origArr[i*4+ch]*t+blurDataArr[i*4+ch]*(1-t));
      }
      rCtx.putImageData(blurData,0,0);
      return {dataUrl:result.toDataURL("image/png"),info:`Portrait blur ${bgBlurRadius}px`};
    },

    async bgreplace(src) {
      // First remove bg, then composite on new bg
      const removed=await processors.bgremove(src);
      const img=await getImgFromUrl(removed.dataUrl);
      const W=img.width,H=img.height;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d");
      if(bgReplaceMode==="gradient"){
        const grad=ctx.createLinearGradient(0,0,W,H);
        const colorMatches=bgGradient.match(/rgba?\([^)]+\)/g)||[];
        if(colorMatches.length>=2){ grad.addColorStop(0,colorMatches[0].replace(/[\d.]+\)$/,"1)")); grad.addColorStop(1,colorMatches[1].replace(/[\d.]+\)$/,"1)")); }
        else { grad.addColorStop(0,"#4361ee"); grad.addColorStop(1,"#7c5cbf"); }
        ctx.fillStyle=grad;
      } else { ctx.fillStyle=bgReplaceColor; }
      ctx.fillRect(0,0,W,H);
      ctx.drawImage(img,0,0);
      return {dataUrl:c.toDataURL("image/png"),info:`BG replaced → ${bgReplaceMode}`};
    },

    async vignette(src) {
      const img=await getImgFromUrl(src);
      const W=img.width,H=img.height;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d");
      ctx.drawImage(img,0,0);
      const grd=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.25,W/2,H/2,Math.max(W,H)*0.72);
      const alpha=vignetteStrength/100;
      grd.addColorStop(0,"rgba(0,0,0,0)");
      grd.addColorStop(1,vignetteColor==="#000000"?`rgba(0,0,0,${alpha})`:`rgba(255,255,255,${alpha})`);
      ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);
      return {dataUrl:c.toDataURL("image/png"),info:`${vignetteStrength}% vignette`};
    },

    async border(src) {
      const img=await getImgFromUrl(src);
      const pad=borderSize,W=img.width+pad*2,H=img.height+pad*2;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d");
      if(borderStyle==="polaroid"){
        ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
        ctx.fillStyle="#f0f0f0"; ctx.fillRect(0,img.height+pad,W,pad*3);
        ctx.drawImage(img,pad,pad);
      } else if(borderStyle==="shadow"){
        ctx.fillStyle="#f0f0f0"; ctx.fillRect(0,0,W,H);
        ctx.shadowColor="rgba(0,0,0,0.3)"; ctx.shadowBlur=pad; ctx.shadowOffsetX=pad*0.3; ctx.shadowOffsetY=pad*0.3;
        ctx.drawImage(img,pad,pad);
      } else if(borderStyle==="glow"){
        ctx.fillStyle="#0a0a0a"; ctx.fillRect(0,0,W,H);
        ctx.shadowColor=borderColor; ctx.shadowBlur=pad*1.5;
        ctx.drawImage(img,pad,pad);
      } else {
        ctx.fillStyle=borderColor; ctx.fillRect(0,0,W,H); ctx.drawImage(img,pad,pad);
      }
      return {dataUrl:c.toDataURL("image/png"),info:`${borderSize}px ${borderStyle}`};
    },

    async sharpen(src) {
      const img=await getImgFromUrl(src);
      const W=img.width,H=img.height;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d"); ctx.drawImage(img,0,0);
      const orig=ctx.getImageData(0,0,W,H);
      const blurC=document.createElement("canvas"); blurC.width=W; blurC.height=H;
      const bCtx=blurC.getContext("2d"); bCtx.filter="blur(1px)"; bCtx.drawImage(img,0,0);
      const blurred=bCtx.getImageData(0,0,W,H);
      const amt=sharpenAmount/100;
      const res=ctx.createImageData(W,H);
      for(let i=0;i<orig.data.length;i+=4){
        for(let ch=0;ch<3;ch++) res.data[i+ch]=Math.min(255,Math.max(0,orig.data[i+ch]+amt*(orig.data[i+ch]-blurred.data[i+ch])));
        res.data[i+3]=255;
      }
      ctx.putImageData(res,0,0);
      return {dataUrl:c.toDataURL("image/png"),info:`${sharpenAmount}% sharpness`};
    },

    async denoise(src) {
      const img=await getImgFromUrl(src);
      const W=img.width,H=img.height;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d");
      ctx.filter=`blur(${denoiseLevel*0.4}px)`; ctx.drawImage(img,0,0);
      const d=ctx.getImageData(0,0,W,H);
      for(let i=0;i<d.data.length;i+=4) for(let ch=0;ch<3;ch++){
        const v=d.data[i+ch]; d.data[i+ch]=Math.min(255,Math.max(0,((v/255-0.5)*1.08+0.5)*255));
      }
      ctx.putImageData(d,0,0);
      return {dataUrl:c.toDataURL("image/png"),info:`Level ${denoiseLevel}`};
    },

    async pixelate(src) {
      const img=await getImgFromUrl(src);
      const W=img.width,H=img.height;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d"); ctx.drawImage(img,0,0);
      const px=pixelSize;
      const sx=pixelRegion==="center"?Math.floor(W*0.25):0;
      const sy=pixelRegion==="center"?Math.floor(H*0.25):0;
      const ex=pixelRegion==="center"?Math.floor(W*0.75):W;
      const ey=pixelRegion==="center"?Math.floor(H*0.75):H;
      for(let y=sy;y<ey;y+=px) for(let x=sx;x<ex;x+=px){
        const pw=Math.min(px,ex-x),ph=Math.min(px,ey-y);
        const d=ctx.getImageData(x,y,pw,ph).data;
        let r=0,g=0,b=0,n=0;
        for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
        ctx.fillStyle=`rgb(${r/n|0},${g/n|0},${b/n|0})`; ctx.fillRect(x,y,pw,ph);
      }
      return {dataUrl:c.toDataURL("image/png"),info:`${px}px pixels`};
    },

    async overlay(src) {
      const img=await getImgFromUrl(src);
      const W=img.width,H=img.height;
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d"); ctx.drawImage(img,0,0);
      ctx.globalAlpha=overlayOpacity/100;
      const grad=ctx.createLinearGradient(0,0,W,H);
      const cm=overlayGradient.match(/rgba?\([^)]+\)/g)||[];
      if(cm.length>=2){
        grad.addColorStop(0,cm[0].replace(/[\d.]+\)$/,"1)"));
        grad.addColorStop(1,cm[1].replace(/[\d.]+\)$/,"1)"));
      }
      ctx.fillStyle=grad; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1;
      return {dataUrl:c.toDataURL("image/png"),info:`${overlayOpacity}% overlay`};
    },
  };

  // ── Run single step ─────────────────────────────────────────────────────────
  const runStep = async (tabId, src) => {
    if(!processors[tabId]) return {dataUrl:src,info:"Unknown step"};
    return await processors[tabId](src);
  };

  // ── Apply current tab ───────────────────────────────────────────────────────
  const applyCurrentTab = async () => {
    if(!preview) return;
    setProcessing(true);
    setProcessingMsg("Processing…");
    try {
      const {dataUrl,info} = await runStep(tab, preview);
      pushHistory(preview, `Before ${EDIT_LABELS[tab]||tab}`);
      setPreview(dataUrl);
      setResult(dataUrl);
      setResultInfo({label:EDIT_LABELS[tab]||tab,value:info});
    } finally { setProcessing(false); }
  };

  // ── Add to pipeline ─────────────────────────────────────────────────────────
  const addToPipeline = () => {
    setPipeline(p=>[...p,{id:Date.now(),tab,label:EDIT_LABELS[tab]||tab}]);
  };

  // ── Run full pipeline ───────────────────────────────────────────────────────
  const runPipeline = async () => {
    if(!origPreview||pipeline.length===0) return;
    setPipelineRunning(true);
    let src = origPreview;
    try {
      for(let i=0;i<pipeline.length;i++){
        setProcessingMsg(`Step ${i+1}/${pipeline.length}: ${pipeline[i].label}…`);
        const {dataUrl} = await runStep(pipeline[i].tab, src);
        src = dataUrl;
      }
      pushHistory(preview, "Before pipeline");
      setPreview(src);
      setResult(src);
      setResultInfo({label:"Pipeline",value:`${pipeline.length} edits applied`});
    } finally { setPipelineRunning(false); setProcessingMsg("Processing…"); }
  };

  // ── Undo ────────────────────────────────────────────────────────────────────
  const undo = () => {
    if(history.length===0) return;
    const [last,...rest] = history;
    setPreview(last.dataUrl);
    setResult(null); setResultInfo(null);
    setHistory(rest);
  };

  const download = () => {
    if(!result) return;
    const ext = tab==="compress"?"jpg":tab==="convert"?format:"png";
    const a=document.createElement("a"); a.href=result; a.download=`studio-${tab}.${ext}`; a.click();
  };

  const handleWidthChange = (v) => { setRWidth(v); if(keepRatio&&origSize) setRHeight(String(Math.round((Number(v)/origSize.w)*origSize.h))); };
  const handleHeightChange = (v) => { setRHeight(v); if(keepRatio&&origSize) setRWidth(String(Math.round((Number(v)/origSize.h)*origSize.w))); };

  const SliderField = ({label,val,min,max,step=1,onChange,left,right,unit=""}) => (
    <div style={S.field}>
      <label style={S.label}>{label} — <span style={S.valLabel}>{val}{unit}</span></label>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e=>onChange(Number(e.target.value))} style={S.slider} />
      {(left||right)&&<div style={S.sliderLabels}><span>{left}</span><span>{right}</span></div>}
    </div>
  );

  const ChipGroup = ({options,value,onChange}) => (
    <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
      {options.map(([v,l])=><button key={v} style={S.chip(value===v)} onClick={()=>onChange(v)}>{l}</button>)}
    </div>
  );

  const ColorRow = ({colors,value,onChange}) => (
    <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
      {colors.map(c=><button key={c} style={{...S.colorSwatch(value===c),background:c,border:c==="#ffffff"&&value!==c?"1.5px solid #444":S.colorSwatch(value===c).border}} onClick={()=>onChange(c)} />)}
      <input type="color" value={value} onChange={e=>onChange(e.target.value)} style={S.colorPicker} />
    </div>
  );

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap'); @keyframes spin{to{transform:rotate(360deg)}} input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#4361ee;cursor:pointer} button:hover{opacity:0.85}`}</style>

      {/* TOP BAR */}
      <div style={S.topBar}>
        <div style={S.brand}><div style={S.brandIcon}>✦</div>Image Studio Pro</div>
        {origSize&&<>
          <span style={S.statChip}>{origSize.w}×{origSize.h}px</span>
          <span style={S.statChip}>{origSize.kb}KB</span>
          <button style={{...S.chip(pipelineMode),fontSize:12,padding:"5px 12px"}} onClick={()=>setPipelineMode(m=>!m)}>
            ⛓ Multi-Edit {pipelineMode?"ON":"OFF"}
          </button>
          {history.length>0&&<button style={S.clearBtn} onClick={undo}>↩ Undo ({history.length})</button>}
          <button style={{...S.clearBtn,marginLeft:"auto"}} onClick={()=>{setImageFile(null);setPreview(null);setOrigPreview(null);setResult(null);setOrigSize(null);setPipeline([]);setHistory([]);}}>✕ Clear</button>
        </>}
      </div>

      <div style={S.layout}>
        {/* LEFT */}
        <div style={S.left}>
          <div style={{padding:"10px 14px 0",fontSize:10.5,fontWeight:700,color:"#5a6280",letterSpacing:"0.07em",textTransform:"uppercase"}}>Source Image</div>

          <div style={S.dropZone(isDrag, !!imageFile)}
            onDragOver={e=>{e.preventDefault();setIsDrag(true);}} onDragLeave={()=>setIsDrag(false)} onDrop={handleDrop}
            onClick={()=>!imageFile&&fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} hidden />
            {!imageFile
              ? <div style={S.dropContent}>
                  <div style={{fontSize:"2rem"}}>🖼️</div>
                  <p style={{fontFamily:"'Syne',sans-serif",fontSize:13.5,fontWeight:700,color:"#c5caeb",margin:0}}>Drop image here</p>
                  <span style={{fontSize:11.5,color:"#5a6280"}}>or click to browse</span>
                  <span style={{fontFamily:"monospace",fontSize:10,color:"#3d4560",letterSpacing:"0.06em"}}>PNG · JPG · WEBP · BMP · GIF</span>
                </div>
              : <img src={preview} style={S.prevImg} alt="preview" />
            }
          </div>

          {origSize&&<div style={S.infoRow}>
            <span style={S.infoChip}>W {origSize.w}px</span>
            <span style={S.infoChip}>H {origSize.h}px</span>
            <span style={S.infoChip}>{origSize.kb}KB</span>
            {history.length>0&&<span style={{...S.infoChip,color:"#7c9bff",cursor:"pointer"}} onClick={undo}>↩ {history.length}</span>}
          </div>}

          {/* Pipeline */}
          {pipelineMode&&imageFile&&(
            <div style={S.pipelineBox}>
              <div style={S.pipelineTitle}>⛓ Edit Pipeline ({pipeline.length} steps)</div>
              {pipeline.length===0&&<div style={{fontSize:11.5,color:"#5a6280",padding:"4px 0"}}>Add steps from tabs below</div>}
              {pipeline.map((step,i)=>(
                <div key={step.id} style={S.pipelineItem}>
                  <span style={{color:"#7a84b0",fontFamily:"monospace",fontSize:10,marginRight:6}}>{i+1}</span>
                  <span style={{flex:1}}>{step.label}</span>
                  <button style={{background:"none",border:"none",color:"#e63946",cursor:"pointer",fontSize:13,padding:"0 2px"}} onClick={()=>setPipeline(p=>p.filter(s=>s.id!==step.id))}>✕</button>
                </div>
              ))}
              {pipeline.length>0&&(
                <button style={{...S.pipelineApplyBtn,opacity:pipelineRunning?0.6:1}} onClick={runPipeline} disabled={pipelineRunning}>
                  {pipelineRunning?<><span style={S.spinner}/> {processingMsg}</>:"▶ Run All Steps"}
                </button>
              )}
            </div>
          )}

          {result&&(
            <div style={S.resultBox}>
              <div style={S.resultBadge}>✓ {resultInfo?.label}: {resultInfo?.value}</div>
              <img src={result} style={S.resultImg} alt="result" />
              <button style={S.dlBtn} onClick={download}>↓ Download</button>
            </div>
          )}

          {/* History */}
          {history.length>0&&(
            <div style={S.historyBox}>
              <div style={{fontSize:10.5,fontWeight:700,color:"#5a6280",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:6}}>History</div>
              {history.slice(0,5).map((h,i)=>(
                <div key={i} style={{...S.histItem,cursor:"pointer"}} onClick={()=>{setPreview(h.dataUrl);setResult(null);setResultInfo(null);setHistory(hist=>hist.slice(i+1));}}>
                  <span>{h.label}</span>
                  <span style={{fontFamily:"monospace",fontSize:9,color:"#3d4560"}}>{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={S.right}>
          <div style={S.tabBar}>
            {TABS.map(t=>(
              <button key={t.id} style={S.tabBtn(tab===t.id)} onClick={()=>{setTab(t.id);setResult(null);}}>
                <span style={{fontSize:14}}>{t.icon}</span><span>{t.label}</span>
              </button>
            ))}
          </div>

          <div style={S.controls}>
            <div style={S.section}>

              {/* RESIZE */}
              {tab==="resize"&&<>
                <h2 style={S.sectionTitle}>⤢ Resize Image</h2>
                <p style={S.sectionDesc}>Set exact pixel dimensions with ratio lock.</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"end"}}>
                  <div style={S.field}>
                    <label style={S.label}>Width (px)</label>
                    <input style={S.textInput} type="number" value={rWidth} onChange={e=>handleWidthChange(e.target.value)} />
                  </div>
                  <button style={{...S.chip(keepRatio),padding:"8px 10px",borderRadius:8}} onClick={()=>setKeepRatio(v=>!v)} title="Lock aspect ratio">
                    {keepRatio?"🔒":"🔓"}
                  </button>
                  <div style={S.field}>
                    <label style={S.label}>Height (px)</label>
                    <input style={S.textInput} type="number" value={rHeight} onChange={e=>handleHeightChange(e.target.value)} />
                  </div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:10.5,color:"#5a6280",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Presets</span>
                  {[["HD",1280,720],["FHD",1920,1080],["4K",3840,2160],["Square",800,800],["IG",1080,1080],["TW",1200,675],["Thumb",150,150],["OG",1200,630]].map(([l,w,h])=>(
                    <button key={l} style={S.presetChip(rWidth==String(w)&&rHeight==String(h))} onClick={()=>{setRWidth(String(w));setRHeight(String(h));setKeepRatio(false);}}>
                      {l} <span style={{fontFamily:"monospace",fontSize:10,color:"#5a6280"}}>{w}×{h}</span>
                    </button>
                  ))}
                </div>
              </>}

              {/* COMPRESS */}
              {tab==="compress"&&<>
                <h2 style={S.sectionTitle}>⚡ Compress Image</h2>
                <p style={S.sectionDesc}>Reduce file size with quality control.</p>
                <SliderField label="Target Size" val={targetKB} min={20} max={2000} step={10} onChange={setTargetKB} unit="KB" left="20KB" right="2MB" />
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {[[50,"50KB"],[100,"100KB"],[200,"200KB"],[500,"500KB"],[1000,"1MB"]].map(([v,l])=>(
                    <button key={v} style={S.presetChip(targetKB===v)} onClick={()=>setTargetKB(v)}>{l}</button>
                  ))}
                </div>
              </>}

              {/* CONVERT */}
              {tab==="convert"&&<>
                <h2 style={S.sectionTitle}>↔ Convert Format</h2>
                <p style={S.sectionDesc}>Convert to any popular image format.</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {FORMATS.map(f=><button key={f} style={S.formatChip(format===f)} onClick={()=>setFormat(f)}>{f.toUpperCase()}</button>)}
                </div>
              </>}

              {/* CROP */}
              {tab==="crop"&&<>
                <h2 style={S.sectionTitle}>✂ Crop Image</h2>
                <p style={S.sectionDesc}>Define region or use aspect ratio presets.</p>
                <div style={S.field}>
                  <label style={S.label}>Aspect Ratio</label>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {[["free","Free"],["1:1","1:1"],["16:9","16:9"],["4:3","4:3"],["3:2","3:2"],["9:16","9:16"]].map(([v,l])=>(
                      <button key={v} style={S.chip(cropAspect===v)} onClick={()=>{
                        setCropAspect(v);
                        if(v!=="free"&&origSize){
                          const [wR,hR]=v.split(":").map(Number);
                          const maxW=origSize.w,maxH=origSize.h;
                          let nw=maxW,nh=Math.round(maxW*hR/wR);
                          if(nh>maxH){nh=maxH;nw=Math.round(maxH*wR/hR);}
                          setCropW(String(nw));setCropH(String(nh));setCropX("0");setCropY("0");
                        }
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[[cropX,setCropX,"Start X"],[cropY,setCropY,"Start Y"],[cropW,setCropW,"Width (px)"],[cropH,setCropH,"Height (px)"]].map(([val,set,lbl])=>(
                    <div key={lbl} style={S.field}><label style={S.label}>{lbl}</label><input style={S.textInput} type="number" value={val} onChange={e=>set(e.target.value)} /></div>
                  ))}
                </div>
              </>}

              {/* ROTATE */}
              {tab==="rotate"&&<>
                <h2 style={S.sectionTitle}>↻ Rotate & Flip</h2>
                <p style={S.sectionDesc}>Rotate by any angle or mirror the image.</p>
                <div style={S.field}>
                  <label style={S.label}>Angle — <span style={S.valLabel}>{angle}°</span></label>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                    {[90,180,270,45,-90,-45].map(a=><button key={a} style={S.chip(angle===a)} onClick={()=>setAngle(a)}>{a}°</button>)}
                    <input style={{...S.textInput,width:70}} type="number" value={angle} onChange={e=>setAngle(Number(e.target.value))} />
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button style={{...S.chip(flipH),flex:1,padding:10}} onClick={()=>setFlipH(v=>!v)}>↔ Flip Horizontal</button>
                  <button style={{...S.chip(flipV),flex:1,padding:10}} onClick={()=>setFlipV(v=>!v)}>↕ Flip Vertical</button>
                </div>
              </>}

              {/* ADJUST */}
              {tab==="adjust"&&<>
                <h2 style={S.sectionTitle}>◐ Adjust Image</h2>
                <p style={S.sectionDesc}>Fine-tune brightness, contrast, saturation and exposure.</p>
                <SliderField label="Brightness" val={brightness} min={10} max={300} onChange={setBrightness} unit="%" left="Dark" right="Bright" />
                <SliderField label="Contrast" val={contrast} min={10} max={300} onChange={setContrast} unit="%" left="Flat" right="Punchy" />
                <SliderField label="Saturation" val={saturation} min={0} max={300} onChange={setSaturation} unit="%" left="B&W" right="Vivid" />
                <SliderField label="Exposure" val={exposure} min={-80} max={80} onChange={setExposure} unit="" left="-80" right="+80" />
                <button style={{...S.chip(false),padding:"7px 12px",fontSize:12}} onClick={()=>{setBrightness(100);setContrast(100);setSaturation(100);setExposure(0);}}>↺ Reset All</button>
              </>}

              {/* FILTER */}
              {tab==="filter"&&<>
                <h2 style={S.sectionTitle}>✦ Image Filters</h2>
                <p style={S.sectionDesc}>Apply artistic effects including Vintage, Cool & Warm.</p>
                <div style={S.filterGrid}>
                  {FILTERS.map(f=>(
                    <button key={f.id} style={S.filterChip(activeFilter===f.id)} onClick={()=>setActiveFilter(f.id)}>
                      {preview&&<img src={preview} style={{...S.filterThumb,filter:f.id==="none"?"none":f.id==="vintage"?"sepia(60%) contrast(110%)":f.id==="cool"?"hue-rotate(200deg) saturate(120%)":f.id==="warm"?"sepia(30%) saturate(130%)":`${f.id}(${f.id==="blur"?"4px":"80%"})`}} alt={f.label} />}
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
                {activeFilter!=="none"&&<SliderField label="Intensity" val={filterVal} min={0} max={100} onChange={setFilterVal} unit="%" />}
              </>}

              {/* WATERMARK */}
              {tab==="watermark"&&<>
                <h2 style={S.sectionTitle}>◈ Add Watermark</h2>
                <p style={S.sectionDesc}>Protect your image with a text watermark.</p>
                <div style={S.field}><label style={S.label}>Text</label><input style={S.textInput} type="text" value={wmText} onChange={e=>setWmText(e.target.value)} placeholder="© Your Name" /></div>
                <div style={S.field}><label style={S.label}>Color</label><ColorRow colors={["#ffffff","#000000","#ff0000","#ffff00","#00ff00"]} value={wmColor} onChange={setWmColor} /></div>
                <div style={S.field}>
                  <label style={S.label}>Position</label>
                  <div style={S.posGrid}>
                    {["top-left","top-right","center","bottom-left","bottom-right"].map(p=>(
                      <button key={p} style={S.posChip(wmPos===p)} onClick={()=>setWmPos(p)}>{p.replace("-"," ")}</button>
                    ))}
                  </div>
                </div>
                <SliderField label="Font Size" val={wmSize} min={12} max={120} onChange={setWmSize} unit="px" />
                <SliderField label="Opacity" val={wmOpacity} min={10} max={100} onChange={setWmOpacity} unit="%" />
              </>}

              {/* TEXT OVERLAY */}
              {tab==="text"&&<>
                <h2 style={S.sectionTitle}>T Text Overlay</h2>
                <p style={S.sectionDesc}>Add styled text directly onto your image.</p>
                <div style={S.field}><label style={S.label}>Text Content</label><input style={S.textInput} type="text" value={textContent} onChange={e=>setTextContent(e.target.value)} placeholder="Your text here" /></div>
                <div style={S.field}><label style={S.label}>Font</label>
                  <ChipGroup options={[["sans-serif","Sans"],["serif","Serif"],["monospace","Mono"],["cursive","Cursive"],["fantasy","Fantasy"]]} value={textFont} onChange={setTextFont} />
                </div>
                <div style={S.field}><label style={S.label}>Color</label><ColorRow colors={["#ffffff","#000000","#ff0000","#ffff00","#4361ee","#e63946"]} value={textColor} onChange={setTextColor} /></div>
                <div style={S.field}>
                  <label style={S.label}>Position</label>
                  <div style={S.posGrid}>
                    {["top-left","top-right","center","bottom-left","bottom-right"].map(p=>(
                      <button key={p} style={S.posChip(textPos===p)} onClick={()=>setTextPos(p)}>{p.replace("-"," ")}</button>
                    ))}
                  </div>
                </div>
                <SliderField label="Font Size" val={textSize} min={14} max={200} onChange={setTextSize} unit="px" />
                <label style={{...S.label,display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                  <input type="checkbox" checked={textBg} onChange={e=>setTextBg(e.target.checked)} style={{accentColor:"#4361ee"}} />
                  Add dark background behind text
                </label>
              </>}

              {/* BG REMOVE */}
              {tab==="bgremove"&&<>
                <h2 style={S.sectionTitle}>🪄 Remove Background</h2>
                <p style={S.sectionDesc}>Flood-fill from all borders for accurate removal. Output: transparent PNG.</p>
                <div style={S.field}>
                  <label style={S.label}>Detection Mode</label>
                  <ChipGroup options={[["auto","Auto (Recommended)"],["manual","Manual Threshold"]]} value={bgToleranceMode} onChange={setBgToleranceMode} />
                </div>
                {bgToleranceMode==="manual"&&<SliderField label="Color Threshold" val={bgThreshold} min={5} max={120} onChange={setBgThreshold} left="Strict (5)" right="Loose (120)" />}
                <div style={S.infoBox}>
                  <span>💡</span><span>New algorithm samples all 4 corners and uses flood fill — much better accuracy on solid/gradient backgrounds. Increase threshold for complex scenes.</span>
                </div>
              </>}

              {/* BG BLUR */}
              {tab==="bgblur"&&<>
                <h2 style={S.sectionTitle}>🌫 Background Blur</h2>
                <p style={S.sectionDesc}>Blur background while keeping subject sharp — real portrait effect using edge detection.</p>
                <SliderField label="Blur Intensity" val={bgBlurRadius} min={2} max={30} onChange={setBgBlurRadius} unit="px" left="Soft (2)" right="Heavy (30)" />
                <div style={S.infoBox}>
                  <span>📸</span><span>Uses Sobel edge detection + center-weighting to separate subject from background. Works best for centered portraits.</span>
                </div>
              </>}

              {/* BG REPLACE */}
              {tab==="bgreplace"&&<>
                <h2 style={S.sectionTitle}>🎨 Replace Background</h2>
                <p style={S.sectionDesc}>Swap background with solid color or gradient.</p>
                <div style={S.field}><label style={S.label}>Type</label><ChipGroup options={[["color","Solid Color"],["gradient","Gradient"]]} value={bgReplaceMode} onChange={setBgReplaceMode} /></div>
                {bgReplaceMode==="color"&&<div style={S.field}><label style={S.label}>Color</label><ColorRow colors={BG_COLORS} value={bgReplaceColor} onChange={setBgReplaceColor} /></div>}
                {bgReplaceMode==="gradient"&&<div style={S.field}>
                  <label style={S.label}>Gradient</label>
                  <div style={S.gradGrid}>
                    {GRADIENTS.map(g=><button key={g.label} style={{...S.gradChip(bgGradient===g.style),background:g.style.replace(/rgba?\([^)]+\)/g,m=>m.replace(/[\d.]+\)$/,"1)"))}} onClick={()=>setBgGradient(g.style)}>{g.label}</button>)}
                  </div>
                </div>}
                <SliderField label="Detection Threshold" val={bgThreshold} min={5} max={120} onChange={setBgThreshold} left="Strict" right="Loose" />
              </>}

              {/* VIGNETTE */}
              {tab==="vignette"&&<>
                <h2 style={S.sectionTitle}>◉ Vignette</h2>
                <p style={S.sectionDesc}>Cinematic dark or light edge effect.</p>
                <SliderField label="Strength" val={vignetteStrength} min={10} max={95} onChange={setVignetteStrength} unit="%" />
                <div style={S.field}><label style={S.label}>Color</label><ChipGroup options={[["#000000","🌑 Dark"],["#ffffff","⬜ Light"]]} value={vignetteColor} onChange={setVignetteColor} /></div>
              </>}

              {/* BORDER */}
              {tab==="border"&&<>
                <h2 style={S.sectionTitle}>▢ Add Border</h2>
                <p style={S.sectionDesc}>Frame with solid, shadow, glow or Polaroid style.</p>
                <div style={S.field}><label style={S.label}>Style</label><ChipGroup options={[["solid","Solid"],["shadow","Shadow"],["glow","Glow"],["polaroid","Polaroid"]]} value={borderStyle} onChange={setBorderStyle} /></div>
                <SliderField label="Size" val={borderSize} min={5} max={100} onChange={setBorderSize} unit="px" />
                {(borderStyle==="solid"||borderStyle==="glow")&&<div style={S.field}><label style={S.label}>{borderStyle==="glow"?"Glow Color":"Border Color"}</label><ColorRow colors={["#ffffff","#000000","#4361ee","#e63946","#0f9d6e","#f77f00","#9b5de5"]} value={borderColor} onChange={setBorderColor} /></div>}
              </>}

              {/* SHARPEN */}
              {tab==="sharpen"&&<>
                <h2 style={S.sectionTitle}>🔬 Sharpen</h2>
                <p style={S.sectionDesc}>Enhance edges with unsharp masking.</p>
                <SliderField label="Sharpness" val={sharpenAmount} min={10} max={200} onChange={setSharpenAmount} unit="%" left="Subtle (10)" right="Intense (200)" />
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {[[30,"Soft"],[70,"Normal"],[120,"Sharp"],[180,"Ultra"]].map(([v,l])=><button key={v} style={S.presetChip(sharpenAmount===v)} onClick={()=>setSharpenAmount(v)}>{l}</button>)}
                </div>
              </>}

              {/* DENOISE */}
              {tab==="denoise"&&<>
                <h2 style={S.sectionTitle}>✨ Denoise</h2>
                <p style={S.sectionDesc}>Reduce grain and noise.</p>
                <SliderField label="Level" val={denoiseLevel} min={1} max={10} onChange={setDenoiseLevel} left="Light (1)" right="Heavy (10)" />
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {[[2,"Light"],[4,"Medium"],[7,"Heavy"],[10,"Max"]].map(([v,l])=><button key={v} style={S.presetChip(denoiseLevel===v)} onClick={()=>setDenoiseLevel(v)}>{l}</button>)}
                </div>
              </>}

              {/* PIXELATE */}
              {tab==="pixelate"&&<>
                <h2 style={S.sectionTitle}>⊞ Pixelate</h2>
                <p style={S.sectionDesc}>Mosaic / pixel art / censor effect.</p>
                <SliderField label="Pixel Block Size" val={pixelSize} min={2} max={80} onChange={setPixelSize} unit="px" left="Fine (2)" right="Mosaic (80)" />
                <div style={S.field}><label style={S.label}>Region</label><ChipGroup options={[["full","Full Image"],["center","Center Only"]]} value={pixelRegion} onChange={setPixelRegion} /></div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {[[5,"Fine"],[10,"Normal"],[20,"Mosaic"],[40,"Art"],[60,"8-bit"]].map(([v,l])=><button key={v} style={S.presetChip(pixelSize===v)} onClick={()=>setPixelSize(v)}>{l}</button>)}
                </div>
              </>}

              {/* OVERLAY */}
              {tab==="overlay"&&<>
                <h2 style={S.sectionTitle}>▤ Color Overlay</h2>
                <p style={S.sectionDesc}>Gradient color wash / duotone effect.</p>
                <div style={S.field}>
                  <label style={S.label}>Gradient Preset</label>
                  <div style={S.gradGrid}>
                    {GRADIENTS.map(g=><button key={g.label} style={{...S.gradChip(overlayGradient===g.style),background:g.style.replace(/rgba?\([^)]+\)/g,m=>m.replace(/[\d.]+\)$/,"1)"))}} onClick={()=>setOverlayGradient(g.style)}>{g.label}</button>)}
                  </div>
                </div>
                <SliderField label="Opacity" val={overlayOpacity} min={5} max={90} onChange={setOverlayOpacity} unit="%" left="Subtle (5%)" right="Strong (90%)" />
              </>}

              {/* ACTION BUTTONS */}
              {imageFile ? (
                <div style={{display:"flex",flexDirection:"column",gap:8,paddingTop:4}}>
                  {pipelineMode ? (
                    <button style={S.addPipelineBtn} onClick={addToPipeline}>
                      + Add "{EDIT_LABELS[tab]||tab}" to Pipeline
                    </button>
                  ) : (
                    <button style={S.actionBtn(processing)} onClick={applyCurrentTab} disabled={processing}>
                      {processing ? <><span style={S.spinner}/> {processingMsg}</> : <>{TABS.find(t=>t.id===tab)?.icon} Apply {TABS.find(t=>t.id===tab)?.label}</>}
                    </button>
                  )}
                </div>
              ) : (
                <div style={S.noImageHint}>← Upload an image to get started</div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
