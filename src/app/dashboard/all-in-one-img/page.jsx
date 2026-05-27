"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import styles from "../common/toolLayout.module.css";

const TABS = [
  { id: "resize",    icon: "⤢",  label: "Resize"     },
  { id: "compress",  icon: "⚡",  label: "Compress"   },
  { id: "convert",   icon: "↔",  label: "Convert"    },
  { id: "crop",      icon: "✂",  label: "Crop"       },
  { id: "rotate",    icon: "↻",  label: "Rotate"     },
  { id: "filter",    icon: "✦",  label: "Filters"    },
  { id: "watermark", icon: "◈",  label: "Watermark"  },
  { id: "bgremove",  icon: "🪄",  label: "BG Remove"  },
  { id: "bgblur",    icon: "🌫",  label: "BG Blur"    },
  { id: "bgreplace", icon: "🎨",  label: "BG Replace" },
  { id: "denoise",   icon: "✨",  label: "Denoise"    },
  { id: "sharpen",   icon: "🔬",  label: "Sharpen"    },
  { id: "vignette",  icon: "◉",  label: "Vignette"   },
  { id: "pixelate",  icon: "⊞",  label: "Pixelate"   },
  { id: "overlay",   icon: "▤",  label: "Overlay"    },
  { id: "border",    icon: "▢",  label: "Border"     },
];

const FORMATS = ["png","jpg","jpeg","webp","bmp","gif","tiff","ico","avif"];

const FILTERS = [
  { id: "none",        label: "Original"  },
  { id: "grayscale",   label: "Grayscale" },
  { id: "sepia",       label: "Sepia"     },
  { id: "invert",      label: "Invert"    },
  { id: "blur",        label: "Blur"      },
  { id: "brightness",  label: "Bright"    },
  { id: "contrast",    label: "Contrast"  },
  { id: "saturate",    label: "Vivid"     },
  { id: "hue-rotate",  label: "Hue"       },
  { id: "vintage",     label: "Vintage"   },
  { id: "cool",        label: "Cool"      },
  { id: "warm",        label: "Warm"      },
];

const BG_COLORS = [
  "#ffffff","#000000","#f8f9fa","#212529",
  "#4361ee","#e63946","#0f9d6e","#f77f00",
  "#9b5de5","#f15bb5","#fee440","#00bbf9",
];

const OVERLAY_GRADIENTS = [
  { label: "Sunset",  style: "linear-gradient(135deg,rgba(255,94,98,0.55),rgba(255,195,113,0.55))" },
  { label: "Ocean",   style: "linear-gradient(135deg,rgba(0,180,219,0.55),rgba(0,131,176,0.55))" },
  { label: "Forest",  style: "linear-gradient(135deg,rgba(34,193,195,0.55),rgba(45,149,48,0.55))" },
  { label: "Purple",  style: "linear-gradient(135deg,rgba(155,93,229,0.55),rgba(67,97,238,0.55))" },
  { label: "Rose",    style: "linear-gradient(135deg,rgba(241,91,181,0.55),rgba(230,57,70,0.55))" },
  { label: "Gold",    style: "linear-gradient(135deg,rgba(247,127,0,0.55),rgba(254,212,0,0.55))" },
  { label: "Night",   style: "linear-gradient(135deg,rgba(15,12,41,0.70),rgba(48,43,99,0.70))" },
  { label: "Mist",    style: "linear-gradient(135deg,rgba(255,255,255,0.35),rgba(200,210,220,0.35))" },
];

export default function ImageStudio() {
  const router = useRouter();
  const user = getCurrentUser();

  /* ── Shared State ── */
  const [tab, setTab]             = useState("resize");
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview]     = useState(null);
  const [origSize, setOrigSize]   = useState(null);
  const [result, setResult]       = useState(null);
  const [resultInfo, setResultInfo] = useState(null);
  const [isDrag, setIsDrag]       = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("Processing…");
  const fileInputRef              = useRef();

  /* ── Resize ── */
  const [rWidth, setRWidth]   = useState("");
  const [rHeight, setRHeight] = useState("");
  const [keepRatio, setKeepRatio] = useState(true);

  /* ── Compress ── */
  const [targetKB, setTargetKB] = useState(200);

  /* ── Convert ── */
  const [format, setFormat] = useState("png");

  /* ── Crop ── */
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState("");
  const [cropH, setCropH] = useState("");

  /* ── Rotate ── */
  const [angle, setAngle]   = useState(90);
  const [flipH, setFlipH]   = useState(false);
  const [flipV, setFlipV]   = useState(false);

  /* ── Filter ── */
  const [activeFilter, setActiveFilter] = useState("none");
  const [filterVal, setFilterVal]       = useState(80);

  /* ── Watermark ── */
  const [wmText, setWmText]       = useState("© My Image");
  const [wmPos, setWmPos]         = useState("bottom-right");
  const [wmSize, setWmSize]       = useState(32);
  const [wmOpacity, setWmOpacity] = useState(70);
  const [wmColor, setWmColor]     = useState("#ffffff");

  /* ── BG Remove ── */
  const [bgThreshold, setBgThreshold] = useState(30);
  const [bgToleranceMode, setBgToleranceMode] = useState("auto"); // auto | manual

  /* ── BG Blur ── */
  const [bgBlurRadius, setBgBlurRadius]     = useState(10);
  const [bgBlurFgScale, setBgBlurFgScale]   = useState(100);

  /* ── BG Replace ── */
  const [bgReplaceColor, setBgReplaceColor] = useState("#4361ee");
  const [bgReplaceMode, setBgReplaceMode]   = useState("color"); // color | gradient | pattern
  const [bgGradient, setBgGradient]         = useState(OVERLAY_GRADIENTS[0].style);

  /* ── Denoise ── */
  const [denoiseLevel, setDenoiseLevel] = useState(3);

  /* ── Sharpen ── */
  const [sharpenAmount, setSharpenAmount] = useState(50);

  /* ── Vignette ── */
  const [vignetteStrength, setVignetteStrength] = useState(50);
  const [vignetteColor, setVignetteColor]       = useState("#000000");

  /* ── Pixelate ── */
  const [pixelSize, setPixelSize] = useState(10);
  const [pixelRegion, setPixelRegion] = useState("full"); // full | center | custom

  /* ── Overlay ── */
  const [overlayGradient, setOverlayGradient] = useState(OVERLAY_GRADIENTS[0].style);
  const [overlayOpacity, setOverlayOpacity]   = useState(50);

  /* ── Border ── */
  const [borderSize, setBorderSize]   = useState(20);
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [borderStyle, setBorderStyle] = useState("solid"); // solid | shadow | glow | polaroid

  /* ─────────────────────────── Load Image ─────────────────────────── */
  const loadImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setResult(null);
    setResultInfo(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    const img = new window.Image();
    img.onload = () => {
      setOrigSize({ w: img.width, h: img.height, kb: (file.size / 1024).toFixed(1) });
      setRWidth(String(img.width));
      setRHeight(String(img.height));
      setCropW(String(img.width));
      setCropH(String(img.height));
    };
    img.src = url;
    if (user) logToolUsage({ userId: user.uid, tool: "image-studio-upload" });
  }, [user]);

  const handleFileInput = (e) => loadImage(e.target.files?.[0]);
  const handleDrop = (e) => { e.preventDefault(); setIsDrag(false); loadImage(e.dataTransfer.files?.[0]); };

  /* ─────────────────────────── Canvas Helper ─────────────────────────── */
  const getImg = () => new Promise((res) => {
    const img = new window.Image();
    img.src = preview;
    img.onload = () => res(img);
  });

  const setDone = (dataUrl, label, value) => {
    setResult(dataUrl);
    setResultInfo({ label, value });
    setProcessing(false);
  };

  /* ─────────────────────────── RESIZE ─────────────────────────── */
  const doResize = async () => {
    if (!imageFile || !rWidth || !rHeight) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = Number(rWidth); c.height = Number(rHeight);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    setDone(c.toDataURL("image/png"), "Size", `${rWidth} × ${rHeight} px`);
    if (user) logToolUsage({ userId: user.uid, tool: "img-resize" });
  };

  /* ─────────────────────────── COMPRESS ─────────────────────────── */
  const doCompress = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    let quality = 0.92, output, kb;
    do {
      output = c.toDataURL("image/jpeg", quality);
      kb = atob(output.split(",")[1]).length / 1024;
      quality -= 0.05;
    } while (kb > targetKB && quality > 0.05);
    setDone(output, "Compressed", `${kb.toFixed(1)} KB (was ${origSize?.kb} KB)`);
  };

  /* ─────────────────────────── CONVERT ─────────────────────────── */
  const doConvert = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    const mime = format === "jpg" ? "image/jpeg" : `image/${format}`;
    setDone(c.toDataURL(mime), "Format", format.toUpperCase());
  };

  /* ─────────────────────────── CROP ─────────────────────────── */
  const doCrop = async () => {
    if (!imageFile || !cropW || !cropH) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = Number(cropW); c.height = Number(cropH);
    c.getContext("2d").drawImage(img, Number(cropX), Number(cropY), Number(cropW), Number(cropH), 0, 0, Number(cropW), Number(cropH));
    setDone(c.toDataURL("image/png"), "Cropped", `${cropW} × ${cropH} from (${cropX},${cropY})`);
  };

  /* ─────────────────────────── ROTATE ─────────────────────────── */
  const doRotate = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const rad = (angle * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
    const c = document.createElement("canvas");
    c.width  = img.width * cos + img.height * sin;
    c.height = img.width * sin + img.height * cos;
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    setDone(c.toDataURL("image/png"), "Rotated", `${angle}°${flipH?" + Flip H":""}${flipV?" + Flip V":""}`);
  };

  /* ─────────────────────────── FILTER ─────────────────────────── */
  const doFilter = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    const v = filterVal;

    if (activeFilter === "vintage") {
      // Custom vintage: sepia + brightness + contrast via pixel manipulation
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const r = d.data[i], g = d.data[i+1], b = d.data[i+2];
        d.data[i]   = Math.min(255, r * 0.9 + g * 0.3 + b * 0.1);
        d.data[i+1] = Math.min(255, r * 0.3 + g * 0.7 + b * 0.1);
        d.data[i+2] = Math.min(255, r * 0.1 + g * 0.1 + b * 0.6);
      }
      ctx.putImageData(d, 0, 0);
    } else if (activeFilter === "cool") {
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i]   = Math.max(0, d.data[i]   - 20);
        d.data[i+2] = Math.min(255, d.data[i+2] + 30);
      }
      ctx.putImageData(d, 0, 0);
    } else if (activeFilter === "warm") {
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i]   = Math.min(255, d.data[i]   + 30);
        d.data[i+2] = Math.max(0,   d.data[i+2] - 20);
      }
      ctx.putImageData(d, 0, 0);
    } else {
      const filterMap = {
        grayscale:     `grayscale(${v}%)`,
        sepia:         `sepia(${v}%)`,
        invert:        `invert(${v}%)`,
        blur:          `blur(${(v/100)*10}px)`,
        brightness:    `brightness(${v+50}%)`,
        contrast:      `contrast(${v+50}%)`,
        saturate:      `saturate(${v*3}%)`,
        "hue-rotate":  `hue-rotate(${v*3.6}deg)`,
        none:          "none",
      };
      ctx.filter = filterMap[activeFilter] || "none";
      ctx.drawImage(img, 0, 0);
    }
    setDone(c.toDataURL("image/png"), "Filter", FILTERS.find(f=>f.id===activeFilter)?.label);
  };

  /* ─────────────────────────── WATERMARK ─────────────────────────── */
  const doWatermark = async () => {
    if (!imageFile || !wmText) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    ctx.font = `bold ${wmSize}px sans-serif`;
    ctx.fillStyle = wmColor + Math.round((wmOpacity/100)*255).toString(16).padStart(2,"0");
    ctx.strokeStyle = "rgba(0,0,0,"+(wmOpacity/100)*0.5+")";
    ctx.lineWidth = 2;
    const tw = ctx.measureText(wmText).width, pad = 24;
    const positions = {
      "top-left":     [pad, wmSize+pad],
      "top-right":    [c.width-tw-pad, wmSize+pad],
      center:         [(c.width-tw)/2, (c.height+wmSize)/2],
      "bottom-left":  [pad, c.height-pad],
      "bottom-right": [c.width-tw-pad, c.height-pad],
    };
    const [x,y] = positions[wmPos] || positions["bottom-right"];
    ctx.strokeText(wmText,x,y);
    ctx.fillText(wmText,x,y);
    setDone(c.toDataURL("image/png"), "Watermark", wmText);
  };

  /* ─────────────────────────── BG REMOVE (edge-detection threshold) ─────────────────────────── */
  const doBgRemove = async () => {
    if (!imageFile) return;
    setProcessing(true);
    setProcessingMsg("Analyzing image edges…");
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const data = d.data;

    // Sample corner pixels as "background" color (top-left 5x5 average)
    let sampleR=0, sampleG=0, sampleB=0, sampleCount=0;
    const sampleSize = Math.min(8, Math.floor(c.width/4), Math.floor(c.height/4));
    for (let sy=0; sy<sampleSize; sy++) {
      for (let sx=0; sx<sampleSize; sx++) {
        const idx = (sy*c.width + sx)*4;
        sampleR += data[idx]; sampleG += data[idx+1]; sampleB += data[idx+2];
        sampleCount++;
      }
    }
    sampleR = sampleR/sampleCount; sampleG = sampleG/sampleCount; sampleB = sampleB/sampleCount;

    const thresh = bgToleranceMode === "auto" ? 40 : bgThreshold;

    for (let i = 0; i < data.length; i += 4) {
      const dr = Math.abs(data[i]   - sampleR);
      const dg = Math.abs(data[i+1] - sampleG);
      const db = Math.abs(data[i+2] - sampleB);
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      if (dist < thresh) data[i+3] = 0;
      else if (dist < thresh + 20) data[i+3] = Math.round(((dist-thresh)/20)*255);
    }
    ctx.putImageData(d, 0, 0);
    setDone(c.toDataURL("image/png"), "BG Removed", "Background removed (transparent)");
    setProcessingMsg("Processing…");
  };

  /* ─────────────────────────── BG BLUR ─────────────────────────── */
  const doBgBlur = async () => {
    if (!imageFile) return;
    setProcessing(true);
    setProcessingMsg("Separating subject from background…");
    const img = await getImg();
    const W = img.width, H = img.height;

    // Step 1: Blurred canvas
    const blurC = document.createElement("canvas");
    blurC.width = W; blurC.height = H;
    const blurCtx = blurC.getContext("2d");
    blurCtx.filter = `blur(${bgBlurRadius}px)`;
    blurCtx.drawImage(img, 0, 0);

    // Step 2: Detect subject (center region) and compose
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");

    // Draw blurred BG first
    ctx.drawImage(blurC, 0, 0);

    // Elliptical mask for subject (center 60% of image)
    const cx = W/2, cy = H/2;
    const rx = W * 0.30, ry = H * 0.38;
    const feather = Math.min(rx,ry) * 0.4;

    // Draw original on top with elliptical gradient mask
    const tempC = document.createElement("canvas");
    tempC.width = W; tempC.height = H;
    const tmpCtx = tempC.getContext("2d");
    tmpCtx.drawImage(img, 0, 0);

    // Build mask
    const maskC = document.createElement("canvas");
    maskC.width = W; maskC.height = H;
    const mCtx = maskC.getContext("2d");
    const grd = mCtx.createRadialGradient(cx, cy, Math.max(rx,ry)*0.5 - feather, cx, cy, Math.max(rx,ry)*1.1);
    grd.addColorStop(0, "rgba(0,0,0,1)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    mCtx.fillStyle = grd;
    mCtx.fillRect(0,0,W,H);

    // Compose: destination-in
    tmpCtx.globalCompositeOperation = "destination-in";
    tmpCtx.drawImage(maskC, 0, 0);

    ctx.drawImage(tempC, 0, 0);
    setDone(c.toDataURL("image/png"), "BG Blurred", `Blur radius: ${bgBlurRadius}px`);
    setProcessingMsg("Processing…");
  };

  /* ─────────────────────────── BG REPLACE ─────────────────────────── */
  const doBgReplace = async () => {
    if (!imageFile) return;
    setProcessing(true);
    setProcessingMsg("Replacing background…");
    const img = await getImg();
    const W = img.width, H = img.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");

    // Draw background
    if (bgReplaceMode === "gradient") {
      const grad = ctx.createLinearGradient(0,0,W,H);
      // Parse the gradient string and apply two-stop approximation
      const g1 = bgGradient;
      const colorMatches = g1.match(/rgba?\([^)]+\)/g) || [];
      if (colorMatches.length >= 2) {
        grad.addColorStop(0, colorMatches[0]);
        grad.addColorStop(1, colorMatches[1]);
      } else {
        grad.addColorStop(0, "#4361ee");
        grad.addColorStop(1, "#3a86ff");
      }
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bgReplaceColor;
    }
    ctx.fillRect(0,0,W,H);

    // Extract subject with threshold method (same as bg remove)
    const tempC = document.createElement("canvas");
    tempC.width = W; tempC.height = H;
    const tCtx = tempC.getContext("2d");
    tCtx.drawImage(img, 0, 0);
    const d = tCtx.getImageData(0, 0, W, H);
    const data = d.data;

    let sR=0,sG=0,sB=0,sN=0;
    const ss = Math.min(8, Math.floor(W/4), Math.floor(H/4));
    for (let sy=0;sy<ss;sy++) for (let sx=0;sx<ss;sx++) {
      const idx=(sy*W+sx)*4;
      sR+=data[idx]; sG+=data[idx+1]; sB+=data[idx+2]; sN++;
    }
    sR/=sN; sG/=sN; sB/=sN;
    const thresh = bgThreshold;
    for (let i=0;i<data.length;i+=4) {
      const dr=Math.abs(data[i]-sR), dg=Math.abs(data[i+1]-sG), db=Math.abs(data[i+2]-sB);
      const dist=Math.sqrt(dr*dr+dg*dg+db*db);
      if (dist < thresh) data[i+3]=0;
      else if (dist < thresh+20) data[i+3]=Math.round(((dist-thresh)/20)*255);
    }
    tCtx.putImageData(d,0,0);
    ctx.drawImage(tempC,0,0);
    setDone(c.toDataURL("image/png"), "BG Replaced", bgReplaceMode === "gradient" ? "Gradient background" : bgReplaceColor);
    setProcessingMsg("Processing…");
  };

  /* ─────────────────────────── DENOISE ─────────────────────────── */
  const doDenoise = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const W = img.width, H = img.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    // Apply multiple passes of slight blur (simulates noise reduction)
    ctx.filter = `blur(${denoiseLevel * 0.4}px)`;
    ctx.drawImage(img, 0, 0);
    // Recover some sharpness via contrast
    const d = ctx.getImageData(0,0,W,H);
    const data = d.data;
    for (let i=0;i<data.length;i+=4) {
      for (let ch=0;ch<3;ch++) {
        const v = data[i+ch];
        data[i+ch] = Math.min(255, Math.max(0, ((v/255 - 0.5)*1.08 + 0.5)*255));
      }
    }
    ctx.putImageData(d,0,0);
    setDone(c.toDataURL("image/png"), "Denoised", `Level ${denoiseLevel}`);
  };

  /* ─────────────────────────── SHARPEN ─────────────────────────── */
  const doSharpen = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const W = img.width, H = img.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Unsharp mask: original - blur + original
    const orig = ctx.getImageData(0,0,W,H);
    const blurC = document.createElement("canvas");
    blurC.width = W; blurC.height = H;
    const bCtx = blurC.getContext("2d");
    bCtx.filter = "blur(1px)";
    bCtx.drawImage(img, 0, 0);
    const blurred = bCtx.getImageData(0,0,W,H);

    const amount = sharpenAmount / 100;
    const result2 = ctx.createImageData(W, H);
    for (let i=0;i<orig.data.length;i+=4) {
      for (let ch=0;ch<3;ch++) {
        const sharpened = orig.data[i+ch] + amount*(orig.data[i+ch] - blurred.data[i+ch]);
        result2.data[i+ch] = Math.min(255, Math.max(0, sharpened));
      }
      result2.data[i+3] = 255;
    }
    ctx.putImageData(result2,0,0);
    setDone(c.toDataURL("image/png"), "Sharpened", `Amount: ${sharpenAmount}%`);
  };

  /* ─────────────────────────── VIGNETTE ─────────────────────────── */
  const doVignette = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const W = img.width, H = img.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const grd = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.25, W/2, H/2, Math.max(W,H)*0.72);
    const alpha = vignetteStrength / 100;
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, vignetteColor === "#000000" ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,W,H);
    setDone(c.toDataURL("image/png"), "Vignette", `${vignetteStrength}% strength`);
  };

  /* ─────────────────────────── PIXELATE ─────────────────────────── */
  const doPixelate = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const W = img.width, H = img.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const px = pixelSize;
    const startX = pixelRegion === "center" ? Math.floor(W*0.25) : 0;
    const startY = pixelRegion === "center" ? Math.floor(H*0.25) : 0;
    const endX   = pixelRegion === "center" ? Math.floor(W*0.75) : W;
    const endY   = pixelRegion === "center" ? Math.floor(H*0.75) : H;

    for (let y=startY; y<endY; y+=px) {
      for (let x=startX; x<endX; x+=px) {
        const pw = Math.min(px, endX-x), ph = Math.min(px, endY-y);
        const d = ctx.getImageData(x, y, pw, ph).data;
        let r=0,g=0,b=0,n=0;
        for (let i=0;i<d.length;i+=4) { r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
        ctx.fillStyle = `rgb(${r/n|0},${g/n|0},${b/n|0})`;
        ctx.fillRect(x, y, pw, ph);
      }
    }
    setDone(c.toDataURL("image/png"), "Pixelated", `${px}px blocks`);
  };

  /* ─────────────────────────── OVERLAY ─────────────────────────── */
  const doOverlay = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const W = img.width, H = img.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);

    ctx.globalAlpha = overlayOpacity / 100;
    // Try to render gradient
    const grad = ctx.createLinearGradient(0,0,W,H);
    const colorMatches = overlayGradient.match(/rgba?\([^)]+\)/g) || [];
    if (colorMatches.length >= 2) {
      grad.addColorStop(0, colorMatches[0].replace(/,([\d.]+)\)/, ",1)"));
      grad.addColorStop(1, colorMatches[1].replace(/,([\d.]+)\)/, ",1)"));
    } else {
      grad.addColorStop(0, "#4361ee");
      grad.addColorStop(1, "#3a86ff");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha = 1;
    setDone(c.toDataURL("image/png"), "Overlay", `${overlayOpacity}% opacity`);
  };

  /* ─────────────────────────── BORDER ─────────────────────────── */
  const doBorder = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const pad = borderSize;
    const W = img.width + pad*2;
    const H = img.height + pad*2;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");

    if (borderStyle === "polaroid") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, img.height+pad, W, pad*3);
      ctx.drawImage(img, pad, pad);
      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 1;
      ctx.strokeRect(0,0,W,H);
    } else if (borderStyle === "shadow") {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0,0,W,H);
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = pad;
      ctx.shadowOffsetX = pad*0.3;
      ctx.shadowOffsetY = pad*0.3;
      ctx.drawImage(img, pad, pad);
    } else if (borderStyle === "glow") {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0,0,W,H);
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = pad * 1.5;
      ctx.drawImage(img, pad, pad);
    } else {
      ctx.fillStyle = borderColor;
      ctx.fillRect(0,0,W,H);
      ctx.drawImage(img, pad, pad);
    }
    setDone(c.toDataURL("image/png"), "Border", `${borderSize}px ${borderStyle}`);
  };

  /* ─────────────────────────── Download ─────────────────────────── */
  const download = () => {
    if (!result) return;
    const ext = tab === "compress" ? "jpg" : tab === "convert" ? format : "png";
    const a = document.createElement("a");
    a.href = result;
    a.download = `studio-${tab}.${ext}`;
    a.click();
  };

  /* ─────────────────────────── Ratio Lock ─────────────────────────── */
  const handleWidthChange = (v) => {
    setRWidth(v);
    if (keepRatio && origSize) setRHeight(String(Math.round((Number(v)/origSize.w)*origSize.h)));
  };
  const handleHeightChange = (v) => {
    setRHeight(v);
    if (keepRatio && origSize) setRWidth(String(Math.round((Number(v)/origSize.h)*origSize.w)));
  };

  const ACTIONS = {
    resize: doResize, compress: doCompress, convert: doConvert, crop: doCrop,
    rotate: doRotate, filter: doFilter, watermark: doWatermark,
    bgremove: doBgRemove, bgblur: doBgBlur, bgreplace: doBgReplace,
    denoise: doDenoise, sharpen: doSharpen, vignette: doVignette,
    pixelate: doPixelate, overlay: doOverlay, border: doBorder,
  };

  return (
    <div className={styles.page}>
      {/* TOP BAR */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>✦</div>
          <span>Image Studio Pro</span>
        </div>
        {origSize && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>{origSize.w} × {origSize.h} px</span>
            <span className={styles.statChip}>{origSize.kb} KB</span>
            <button className={styles.clearBtn} onClick={() => { setImageFile(null); setPreview(null); setResult(null); setOrigSize(null); }}>
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      <div className={styles.layoutTwo}>
        {/* LEFT: Upload + Preview + Result */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Source Image</span>
          </div>

          <div
            className={`${styles.dropZone} ${isDrag ? styles.dropActive : ""} ${imageFile ? styles.dropHasFile : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
            onDragLeave={() => setIsDrag(false)}
            onDrop={handleDrop}
            onClick={() => !imageFile && fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} hidden />
            {!imageFile ? (
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>🖼️</div>
                <p className={styles.dropText}>Drop image here</p>
                <span className={styles.dropSub}>or click to browse</span>
                <span className={styles.dropFormats}>PNG · JPG · WEBP · BMP · GIF</span>
              </div>
            ) : (
              <img src={preview} className={styles.previewImg} alt="preview" />
            )}
          </div>

          {origSize && (
            <div className={styles.origInfo}>
              <div className={styles.infoChip}><span>W</span>{origSize.w}px</div>
              <div className={styles.infoChip}><span>H</span>{origSize.h}px</div>
              <div className={styles.infoChip}><span>KB</span>{origSize.kb}</div>
            </div>
          )}

          {result && (
            <div className={styles.resultBox}>
              <div style={{width:"100%"}}>
                <div className={styles.resultBadge}>✓ {resultInfo?.label}: {resultInfo?.value}</div>
                <img src={result} className={styles.resultImg} alt="result" />
              </div>
              <button className={styles.downloadBtn} onClick={download}>↓ Download</button>
            </div>
          )}
        </aside>

        {/* RIGHT: Tabs + Controls */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div className={styles.tabBar}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ""}`}
                onClick={() => { setTab(t.id); setResult(null); }}
              >
                <span className={styles.tabIcon}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.controls}>
            <div className={styles.section}>

              {/* ── RESIZE ── */}
              {tab === "resize" && (<>
                <h2 className={styles.sectionTitle}>⤢ Resize Image</h2>
                <p className={styles.sectionDesc}>Set exact pixel dimensions.</p>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label>Width (px)</label>
                    <input className={styles.textInput} type="number" value={rWidth} onChange={(e) => handleWidthChange(e.target.value)} />
                  </div>
                  <div className={styles.fieldCenter}>
                    <button className={`${styles.ratioBtn} ${keepRatio ? styles.ratioBtnOn : ""}`} onClick={() => setKeepRatio(v=>!v)} title="Lock aspect ratio">
                      {keepRatio ? "🔒" : "🔓"}
                    </button>
                  </div>
                  <div className={styles.field}>
                    <label>Height (px)</label>
                    <input className={styles.textInput} type="number" value={rHeight} onChange={(e) => handleHeightChange(e.target.value)} />
                  </div>
                </div>
                <div className={styles.presets}>
                  <span className={styles.presetsLabel}>Presets</span>
                  {[["HD",1280,720],["FHD",1920,1080],["4K",3840,2160],["Square",800,800],["Instagram",1080,1080],["Twitter",1200,675],["Thumb",150,150]].map(([l,w,h]) => (
                    <button key={l} className={styles.presetChip} onClick={() => { setRWidth(String(w)); setRHeight(String(h)); setKeepRatio(false); }}>
                      {l} <span>{w}×{h}</span>
                    </button>
                  ))}
                </div>
              </>)}

              {/* ── COMPRESS ── */}
              {tab === "compress" && (<>
                <h2 className={styles.sectionTitle}>⚡ Compress Image</h2>
                <p className={styles.sectionDesc}>Reduce file size while preserving quality.</p>
                <div className={styles.field}>
                  <label>Target Size — <strong className={styles.valLabel}>{targetKB} KB</strong></label>
                  <input type="range" min="20" max="2000" step="10" value={targetKB} onChange={(e) => setTargetKB(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>20 KB</span><span>2000 KB</span></div>
                </div>
                <div className={styles.presets}>
                  <span className={styles.presetsLabel}>Quick</span>
                  {[[50,"50 KB"],[100,"100 KB"],[200,"200 KB"],[500,"500 KB"],[1000,"1 MB"]].map(([v,l]) => (
                    <button key={v} className={`${styles.presetChip} ${targetKB===v?styles.presetActive:""}`} onClick={() => setTargetKB(v)}>{l}</button>
                  ))}
                </div>
              </>)}

              {/* ── CONVERT ── */}
              {tab === "convert" && (<>
                <h2 className={styles.sectionTitle}>↔ Convert Format</h2>
                <p className={styles.sectionDesc}>Convert to any popular image format.</p>
                <div className={styles.formatGrid}>
                  {FORMATS.map(f => (
                    <button key={f} className={`${styles.formatChip} ${format===f?styles.formatActive:""}`} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>
                  ))}
                </div>
              </>)}

              {/* ── CROP ── */}
              {tab === "crop" && (<>
                <h2 className={styles.sectionTitle}>✂ Crop Image</h2>
                <p className={styles.sectionDesc}>Define region to crop from the source.</p>
                <div className={styles.fieldGrid}>
                  <div className={styles.field}><label>Start X</label><input className={styles.textInput} type="number" value={cropX} onChange={e=>setCropX(e.target.value)} /></div>
                  <div className={styles.field}><label>Start Y</label><input className={styles.textInput} type="number" value={cropY} onChange={e=>setCropY(e.target.value)} /></div>
                  <div className={styles.field}><label>Width (px)</label><input className={styles.textInput} type="number" value={cropW} onChange={e=>setCropW(e.target.value)} /></div>
                  <div className={styles.field}><label>Height (px)</label><input className={styles.textInput} type="number" value={cropH} onChange={e=>setCropH(e.target.value)} /></div>
                </div>
                {origSize && <div className={styles.infoBox}><span>ℹ️</span><span>Original: {origSize.w}×{origSize.h}px</span></div>}
              </>)}

              {/* ── ROTATE ── */}
              {tab === "rotate" && (<>
                <h2 className={styles.sectionTitle}>↻ Rotate & Flip</h2>
                <p className={styles.sectionDesc}>Rotate by any angle or mirror the image.</p>
                <div className={styles.field}>
                  <label>Angle — <strong className={styles.valLabel}>{angle}°</strong></label>
                  <div className={styles.angleRow}>
                    {[90,180,270,45,-90,-45].map(a => (
                      <button key={a} className={`${styles.angleChip} ${angle===a?styles.angleActive:""}`} onClick={() => setAngle(a)}>{a}°</button>
                    ))}
                    <input className={styles.textInput} type="number" value={angle} onChange={e=>setAngle(Number(e.target.value))} style={{width:70}} />
                  </div>
                </div>
                <div className={styles.flipRow}>
                  <button className={`${styles.flipBtn} ${flipH?styles.flipActive:""}`} onClick={() => setFlipH(v=>!v)}>↔ Flip Horizontal</button>
                  <button className={`${styles.flipBtn} ${flipV?styles.flipActive:""}`} onClick={() => setFlipV(v=>!v)}>↕ Flip Vertical</button>
                </div>
              </>)}

              {/* ── FILTER ── */}
              {tab === "filter" && (<>
                <h2 className={styles.sectionTitle}>✦ Image Filters</h2>
                <p className={styles.sectionDesc}>Apply artistic effects including Vintage, Cool & Warm tones.</p>
                <div className={styles.filterGrid}>
                  {FILTERS.map(f => (
                    <button key={f.id} className={`${styles.filterChip} ${activeFilter===f.id?styles.filterActive:""}`} onClick={() => setActiveFilter(f.id)}>
                      {preview && <img src={preview} className={styles.filterThumb} alt={f.label} style={{ filter: f.id!=="none" ? (f.id==="vintage"?"sepia(60%) contrast(110%)" : f.id==="cool"?"hue-rotate(200deg) saturate(120%)" : f.id==="warm"?"sepia(30%) saturate(130%)" : `${f.id}(${f.id==="blur"?"4px":"80%"})`) : "none" }} />}
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
                {activeFilter !== "none" && (
                  <div className={styles.sliderRow}>
                    <label>Intensity: <strong className={styles.valLabel}>{filterVal}%</strong></label>
                    <input type="range" min="0" max="100" value={filterVal} onChange={e=>setFilterVal(Number(e.target.value))} className={styles.slider} />
                  </div>
                )}
              </>)}

              {/* ── WATERMARK ── */}
              {tab === "watermark" && (<>
                <h2 className={styles.sectionTitle}>◈ Add Watermark</h2>
                <p className={styles.sectionDesc}>Protect your image with a text watermark.</p>
                <div className={styles.field}><label>Text</label><input className={styles.textInput} type="text" value={wmText} onChange={e=>setWmText(e.target.value)} placeholder="© Your Name" /></div>
                <div className={styles.field}>
                  <label>Color</label>
                  <div className={styles.colorRow}>
                    {["#ffffff","#000000","#ff0000","#ffff00","#00ff00","#0000ff"].map(c => (
                      <button key={c} className={`${styles.colorSwatch} ${wmColor===c?styles.colorActive:""}`} style={{background:c}} onClick={() => setWmColor(c)} />
                    ))}
                    <input type="color" value={wmColor} onChange={e=>setWmColor(e.target.value)} className={styles.colorPicker} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Position</label>
                  <div className={styles.posGrid}>
                    {["top-left","top-right","center","bottom-left","bottom-right"].map(p => (
                      <button key={p} className={`${styles.posChip} ${wmPos===p?styles.posActive:""}`} onClick={() => setWmPos(p)}>{p.replace("-"," ")}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.fieldGrid}>
                  <div className={styles.field}><label>Font Size: <strong className={styles.valLabel}>{wmSize}px</strong></label><input type="range" min="12" max="120" value={wmSize} onChange={e=>setWmSize(Number(e.target.value))} className={styles.slider} /></div>
                  <div className={styles.field}><label>Opacity: <strong className={styles.valLabel}>{wmOpacity}%</strong></label><input type="range" min="10" max="100" value={wmOpacity} onChange={e=>setWmOpacity(Number(e.target.value))} className={styles.slider} /></div>
                </div>
              </>)}

              {/* ── BG REMOVE ── */}
              {tab === "bgremove" && (<>
                <h2 className={styles.sectionTitle}>🪄 Remove Background</h2>
                <p className={styles.sectionDesc}>Removes background using edge-detection. Best with solid/uniform backgrounds. Output is transparent PNG.</p>
                <div className={styles.field}>
                  <label>Detection Mode</label>
                  <div className={styles.chipGroup}>
                    {[["auto","Auto (Recommended)"],["manual","Manual Threshold"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${bgToleranceMode===v?styles.chipActive:""}`} onClick={()=>setBgToleranceMode(v)}>{l}</button>
                    ))}
                  </div>
                </div>
                {bgToleranceMode === "manual" && (
                  <div className={styles.field}>
                    <label>Color Threshold — <strong className={styles.valLabel}>{bgThreshold}</strong></label>
                    <input type="range" min="5" max="120" value={bgThreshold} onChange={e=>setBgThreshold(Number(e.target.value))} className={styles.slider} />
                    <div className={styles.sliderLabels}><span>Strict (5)</span><span>Loose (120)</span></div>
                  </div>
                )}
                <div className={styles.infoBox}>
                  <span>💡</span>
                  <span>Works best with images that have a solid/flat background. For complex scenes, increase the threshold.</span>
                </div>
              </>)}

              {/* ── BG BLUR ── */}
              {tab === "bgblur" && (<>
                <h2 className={styles.sectionTitle}>🌫 Background Blur</h2>
                <p className={styles.sectionDesc}>Blur the background while keeping the subject sharp — like a DSLR portrait effect.</p>
                <div className={styles.field}>
                  <label>Blur Intensity — <strong className={styles.valLabel}>{bgBlurRadius}px</strong></label>
                  <input type="range" min="2" max="30" value={bgBlurRadius} onChange={e=>setBgBlurRadius(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>Soft (2)</span><span>Heavy (30)</span></div>
                </div>
                <div className={styles.infoBox}>
                  <span>📸</span>
                  <span>Uses center-region masking to detect the subject. Works best for centered portraits and objects.</span>
                </div>
              </>)}

              {/* ── BG REPLACE ── */}
              {tab === "bgreplace" && (<>
                <h2 className={styles.sectionTitle}>🎨 Replace Background</h2>
                <p className={styles.sectionDesc}>Swap background with a solid color or gradient. Best with uniform original backgrounds.</p>
                <div className={styles.field}>
                  <label>Background Type</label>
                  <div className={styles.chipGroup}>
                    {[["color","Solid Color"],["gradient","Gradient"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${bgReplaceMode===v?styles.chipActive:""}`} onClick={()=>setBgReplaceMode(v)}>{l}</button>
                    ))}
                  </div>
                </div>
                {bgReplaceMode === "color" && (
                  <div className={styles.field}>
                    <label>Background Color</label>
                    <div className={styles.colorRow}>
                      {BG_COLORS.map(c => (
                        <button key={c} className={`${styles.colorSwatch} ${bgReplaceColor===c?styles.colorActive:""}`} style={{background:c, border: c==="#ffffff"?"1.5px solid #ddd":undefined}} onClick={()=>setBgReplaceColor(c)} />
                      ))}
                      <input type="color" value={bgReplaceColor} onChange={e=>setBgReplaceColor(e.target.value)} className={styles.colorPicker} />
                    </div>
                  </div>
                )}
                {bgReplaceMode === "gradient" && (
                  <div className={styles.field}>
                    <label>Gradient Preset</label>
                    <div className={styles.gradientGrid}>
                      {OVERLAY_GRADIENTS.map(g => (
                        <button
                          key={g.label}
                          className={`${styles.gradientChip} ${bgGradient===g.style?styles.gradientActive:""}`}
                          style={{background: g.style.replace(/rgba?\([^)]+\)/g, m => m.replace(/[\d.]+\)$/, "1)"))}}
                          onClick={()=>setBgGradient(g.style)}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.field}>
                  <label>Detection Threshold — <strong className={styles.valLabel}>{bgThreshold}</strong></label>
                  <input type="range" min="5" max="120" value={bgThreshold} onChange={e=>setBgThreshold(Number(e.target.value))} className={styles.slider} />
                </div>
              </>)}

              {/* ── DENOISE ── */}
              {tab === "denoise" && (<>
                <h2 className={styles.sectionTitle}>✨ Denoise</h2>
                <p className={styles.sectionDesc}>Reduce noise and grain for a cleaner, smoother image.</p>
                <div className={styles.field}>
                  <label>Noise Reduction Level — <strong className={styles.valLabel}>{denoiseLevel}</strong></label>
                  <input type="range" min="1" max="10" value={denoiseLevel} onChange={e=>setDenoiseLevel(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>Light (1)</span><span>Heavy (10)</span></div>
                </div>
                <div className={styles.presets}>
                  <span className={styles.presetsLabel}>Presets</span>
                  {[[2,"Light"],[4,"Medium"],[7,"Heavy"],[10,"Max"]].map(([v,l]) => (
                    <button key={v} className={`${styles.presetChip} ${denoiseLevel===v?styles.presetActive:""}`} onClick={()=>setDenoiseLevel(v)}>{l}</button>
                  ))}
                </div>
              </>)}

              {/* ── SHARPEN ── */}
              {tab === "sharpen" && (<>
                <h2 className={styles.sectionTitle}>🔬 Sharpen</h2>
                <p className={styles.sectionDesc}>Enhance edges and fine details with unsharp masking.</p>
                <div className={styles.field}>
                  <label>Sharpness — <strong className={styles.valLabel}>{sharpenAmount}%</strong></label>
                  <input type="range" min="10" max="200" value={sharpenAmount} onChange={e=>setSharpenAmount(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>Subtle (10)</span><span>Intense (200)</span></div>
                </div>
                <div className={styles.presets}>
                  <span className={styles.presetsLabel}>Presets</span>
                  {[[30,"Soft"],[70,"Normal"],[120,"Sharp"],[180,"Ultra"]].map(([v,l]) => (
                    <button key={v} className={`${styles.presetChip} ${sharpenAmount===v?styles.presetActive:""}`} onClick={()=>setSharpenAmount(v)}>{l}</button>
                  ))}
                </div>
              </>)}

              {/* ── VIGNETTE ── */}
              {tab === "vignette" && (<>
                <h2 className={styles.sectionTitle}>◉ Vignette</h2>
                <p className={styles.sectionDesc}>Add a cinematic dark or light vignette around the edges.</p>
                <div className={styles.field}>
                  <label>Strength — <strong className={styles.valLabel}>{vignetteStrength}%</strong></label>
                  <input type="range" min="10" max="95" value={vignetteStrength} onChange={e=>setVignetteStrength(Number(e.target.value))} className={styles.slider} />
                </div>
                <div className={styles.field}>
                  <label>Vignette Color</label>
                  <div className={styles.chipGroup}>
                    <button className={`${styles.chip} ${vignetteColor==="#000000"?styles.chipActive:""}`} onClick={()=>setVignetteColor("#000000")}>🌑 Dark</button>
                    <button className={`${styles.chip} ${vignetteColor==="#ffffff"?styles.chipActive:""}`} onClick={()=>setVignetteColor("#ffffff")}>⬜ Light</button>
                  </div>
                </div>
              </>)}

              {/* ── PIXELATE ── */}
              {tab === "pixelate" && (<>
                <h2 className={styles.sectionTitle}>⊞ Pixelate</h2>
                <p className={styles.sectionDesc}>Apply mosaic/pixel art effect — censor or stylize.</p>
                <div className={styles.field}>
                  <label>Pixel Block Size — <strong className={styles.valLabel}>{pixelSize}px</strong></label>
                  <input type="range" min="2" max="80" value={pixelSize} onChange={e=>setPixelSize(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>Fine (2)</span><span>Mosaic (80)</span></div>
                </div>
                <div className={styles.field}>
                  <label>Region</label>
                  <div className={styles.chipGroup}>
                    {[["full","Full Image"],["center","Center Only"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${pixelRegion===v?styles.chipActive:""}`} onClick={()=>setPixelRegion(v)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.presets}>
                  <span className={styles.presetsLabel}>Presets</span>
                  {[[5,"Fine"],[10,"Normal"],[20,"Mosaic"],[40,"Art"],[60,"8-bit"]].map(([v,l]) => (
                    <button key={v} className={`${styles.presetChip} ${pixelSize===v?styles.presetActive:""}`} onClick={()=>setPixelSize(v)}>{l}</button>
                  ))}
                </div>
              </>)}

              {/* ── OVERLAY ── */}
              {tab === "overlay" && (<>
                <h2 className={styles.sectionTitle}>▤ Color Overlay</h2>
                <p className={styles.sectionDesc}>Apply a gradient color wash or duotone effect over the image.</p>
                <div className={styles.field}>
                  <label>Gradient Preset</label>
                  <div className={styles.gradientGrid}>
                    {OVERLAY_GRADIENTS.map(g => (
                      <button
                        key={g.label}
                        className={`${styles.gradientChip} ${overlayGradient===g.style?styles.gradientActive:""}`}
                        style={{background: g.style.replace(/rgba?\([^)]+\)/g, m => m.replace(/[\d.]+\)$/, "1)"))}}
                        onClick={()=>setOverlayGradient(g.style)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Opacity — <strong className={styles.valLabel}>{overlayOpacity}%</strong></label>
                  <input type="range" min="5" max="90" value={overlayOpacity} onChange={e=>setOverlayOpacity(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>Subtle (5%)</span><span>Strong (90%)</span></div>
                </div>
              </>)}

              {/* ── BORDER ── */}
              {tab === "border" && (<>
                <h2 className={styles.sectionTitle}>▢ Add Border</h2>
                <p className={styles.sectionDesc}>Frame your image with solid, shadow, glow, or Polaroid style borders.</p>
                <div className={styles.field}>
                  <label>Border Style</label>
                  <div className={styles.chipGroup}>
                    {[["solid","Solid"],["shadow","Shadow"],["glow","Glow"],["polaroid","Polaroid"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${borderStyle===v?styles.chipActive:""}`} onClick={()=>setBorderStyle(v)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Border Size — <strong className={styles.valLabel}>{borderSize}px</strong></label>
                  <input type="range" min="5" max="100" value={borderSize} onChange={e=>setBorderSize(Number(e.target.value))} className={styles.slider} />
                </div>
                {(borderStyle === "solid" || borderStyle === "glow") && (
                  <div className={styles.field}>
                    <label>{borderStyle === "glow" ? "Glow Color" : "Border Color"}</label>
                    <div className={styles.colorRow}>
                      {["#ffffff","#000000","#4361ee","#e63946","#0f9d6e","#f77f00","#9b5de5"].map(c => (
                        <button key={c} className={`${styles.colorSwatch} ${borderColor===c?styles.colorActive:""}`} style={{background:c, border: c==="#ffffff"?"1.5px solid #ddd":undefined}} onClick={()=>setBorderColor(c)} />
                      ))}
                      <input type="color" value={borderColor} onChange={e=>setBorderColor(e.target.value)} className={styles.colorPicker} />
                    </div>
                  </div>
                )}
              </>)}

              {/* ── ACTION BUTTON ── */}
              {imageFile ? (
                <button
                  className={`${styles.actionBtn} ${processing ? styles.actionBusy : ""}`}
                  onClick={ACTIONS[tab]}
                  disabled={processing}
                >
                  {processing ? (
                    <><span className={styles.spinner} /> {processingMsg}</>
                  ) : (
                    <>{TABS.find(t=>t.id===tab)?.icon} Apply {TABS.find(t=>t.id===tab)?.label}</>
                  )}
                </button>
              ) : (
                <div className={styles.noImageHint}>← Upload an image to get started</div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
