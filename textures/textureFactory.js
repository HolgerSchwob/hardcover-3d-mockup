import * as THREE from "https://esm.sh/three@0.160.0";

const textureLoader = new THREE.TextureLoader();
let cachedPaperEdgeTextures = null;

export async function loadTextureFromFile(file) {
  if (!file) {
    return null;
  }

  if (file.type === "image/svg+xml" || file.name?.toLowerCase().endsWith(".svg")) {
    return rasterizeSvgToTexture(file);
  }

  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    textureLoader.load(
      dataUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

async function rasterizeSvgToTexture(file) {
  const svgText = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svgEl = doc.documentElement;

  let svgW = parseFloat(svgEl.getAttribute("width")) || 0;
  let svgH = parseFloat(svgEl.getAttribute("height")) || 0;
  if (!svgW || !svgH) {
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/);
      if (parts.length >= 4) {
        svgW = parseFloat(parts[2]) || 0;
        svgH = parseFloat(parts[3]) || 0;
      }
    }
  }
  // Fallback auf typische Druckbogen-Auflösung (A4 quer @300 dpi)
  if (!svgW || !svgH) {
    svgW = 3508;
    svgH = 2480;
  }

  const MAX_PX = 4096;
  const scale = Math.min(1, MAX_PX / Math.max(svgW, svgH));
  const canvasW = Math.max(1, Math.round(svgW * scale));
  const canvasH = Math.max(1, Math.round(svgH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      URL.revokeObjectURL(url);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 8;
      resolve(texture);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG konnte nicht geladen werden"));
    };
    img.src = url;
  });
}

/**
 * Erzeugt eine wiederverwendbare Papierkanten-Textur fuer den Buchblock:
 * feine Seitenlinien + leichtes Korn. Als color + bump nutzbar.
 */
export function getPaperEdgeTextures() {
  if (cachedPaperEdgeTextures) {
    return cachedPaperEdgeTextures;
  }

  const width = 384;
  const height = 1024;
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  bumpCanvas.width = width;
  bumpCanvas.height = height;

  const colorCtx = colorCanvas.getContext("2d");
  const bumpCtx = bumpCanvas.getContext("2d");
  const random = createSeededRandom(0x4a1f9d7);

  colorCtx.fillStyle = "#f6f6f4";
  colorCtx.fillRect(0, 0, width, height);
  // Sichtbare Seitenlinien: bewusst grob genug, damit sie bei Distanz lesbar bleiben.
  for (let y = 0; y < height; y += 14) {
    const shade = clampByte(186 + (random() - 0.5) * 26);
    const alpha = 0.12 + random() * 0.13;
    const lineHeight = random() > 0.65 ? 3 : 2;
    colorCtx.fillStyle = `rgba(${shade},${shade},${shade},${alpha.toFixed(3)})`;
    colorCtx.fillRect(0, y, width, lineHeight);
  }
  // Seltene dunklere Trennlagen fuer "Signaturen".
  for (let y = 0; y < height; y += 72) {
    const shade = clampByte(166 + (random() - 0.5) * 20);
    const alpha = 0.12 + random() * 0.1;
    colorCtx.fillStyle = `rgba(${shade},${shade},${shade},${alpha.toFixed(3)})`;
    colorCtx.fillRect(0, y, width, 3);
  }
  for (let x = 0; x < width; x += 19) {
    const alpha = 0.014 + random() * 0.03;
    colorCtx.fillStyle = `rgba(140,140,140,${alpha.toFixed(3)})`;
    colorCtx.fillRect(x, 0, 1, height);
  }
  for (let i = 0; i < 4800; i += 1) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const value = clampByte(212 + (random() - 0.5) * 46);
    const alpha = 0.01 + random() * 0.04;
    colorCtx.fillStyle = `rgba(${value},${value},${value},${alpha.toFixed(3)})`;
    colorCtx.fillRect(x, y, 1, 1);
  }

  bumpCtx.fillStyle = "rgb(128,128,128)";
  bumpCtx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += 14) {
    const lightness = clampByte(104 + (random() - 0.5) * 72);
    const lineHeight = random() > 0.64 ? 3 : 2;
    bumpCtx.fillStyle = `rgb(${lightness},${lightness},${lightness})`;
    bumpCtx.fillRect(0, y, width, lineHeight);
  }
  for (let y = 0; y < height; y += 72) {
    const lightness = clampByte(90 + (random() - 0.5) * 44);
    bumpCtx.fillStyle = `rgb(${lightness},${lightness},${lightness})`;
    bumpCtx.fillRect(0, y, width, 3);
  }
  for (let i = 0; i < 7000; i += 1) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const value = clampByte(128 + (random() - 0.5) * 96);
    bumpCtx.fillStyle = `rgb(${value},${value},${value})`;
    bumpCtx.fillRect(x, y, 1, 1);
  }

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.wrapS = THREE.RepeatWrapping;
  colorTexture.wrapT = THREE.RepeatWrapping;
  colorTexture.repeat.set(1, 1);
  colorTexture.minFilter = THREE.LinearFilter;
  colorTexture.magFilter = THREE.LinearFilter;
  colorTexture.generateMipmaps = false;
  colorTexture.anisotropy = 8;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.repeat.set(1, 1);
  bumpTexture.minFilter = THREE.LinearFilter;
  bumpTexture.magFilter = THREE.LinearFilter;
  bumpTexture.generateMipmaps = false;
  bumpTexture.anisotropy = 8;

  // Eigene Variante für den Vorderschnitt (um 90° gedreht, eigene Repeat-Werte).
  const foreColorTexture = createRotatedTextureVariant(colorTexture, Math.PI * 0.5);
  const foreBumpTexture = createRotatedTextureVariant(bumpTexture, Math.PI * 0.5);

  cachedPaperEdgeTextures = {
    capColor: colorTexture,
    capBump: bumpTexture,
    foreColor: foreColorTexture,
    foreBump: foreBumpTexture,
  };
  return cachedPaperEdgeTextures;
}

export function createEdgeCropTexture(baseTexture, edge, dims) {
  if (!baseTexture) {
    return null;
  }

  const safeBleedX = Math.max(0.0001, dims.bleedMM / dims.outerWidthMM);
  const safeBleedY = Math.max(0.0001, dims.bleedMM / dims.outerHeightMM);

  const texture = baseTexture.clone();
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  if (edge === "left") {
    texture.repeat.set(safeBleedX, 1);
    texture.offset.set(0, 0);
  } else if (edge === "right") {
    texture.repeat.set(safeBleedX, 1);
    texture.offset.set(1 - safeBleedX, 0);
  } else if (edge === "top") {
    texture.repeat.set(1, safeBleedY);
    texture.offset.set(0, 1 - safeBleedY);
  } else if (edge === "bottom") {
    texture.repeat.set(1, safeBleedY);
    texture.offset.set(0, 0);
  }

  return texture;
}

export function createSpineTexture(spineWidthMM) {
  const width = 256;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, "#3e4453");
  grad.addColorStop(0.5, "#596176");
  grad.addColorStop(1, "#3e4453");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for (let y = 0; y < height; y += 12) {
    ctx.fillRect(0, y, width, 1);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 0);
  ctx.lineTo(width * 0.5, height);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "bold 44px Arial";
  ctx.textAlign = "center";
  ctx.save();
  ctx.translate(width * 0.5, height * 0.5);
  ctx.rotate(-Math.PI * 0.5);
  ctx.fillText(`${spineWidthMM.toFixed(1)} mm`, 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createRotatedTextureVariant(baseTexture, rotationRad) {
  const texture = baseTexture.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0.5, 0.5);
  texture.rotation = rotationRad;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
