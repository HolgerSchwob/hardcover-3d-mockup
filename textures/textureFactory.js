import * as THREE from "https://esm.sh/three@0.160.0";

const textureLoader = new THREE.TextureLoader();
let cachedPaperEdgeTextures = null;

export async function loadTextureFromFile(file) {
  if (!file) {
    return null;
  }

  if (file.type === "image/svg+xml" || file.name?.toLowerCase().endsWith(".svg")) {
    const texture = await rasterizeSvgToTexture(file);
    texture.userData = {
      ...(texture.userData ?? {}),
      sourceType: "svg",
      fileName: file.name ?? "",
    };
    return texture;
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
        texture.userData = {
          ...(texture.userData ?? {}),
          sourceType: "bitmap",
          fileName: file.name ?? "",
          rasterWidth: texture.image?.width ?? null,
          rasterHeight: texture.image?.height ?? null,
        };
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
  const hasParserError = !!doc.querySelector("parsererror");

  let svgW = 0;
  let svgH = 0;
  let svgMarkup = svgText;
  if (!hasParserError && svgEl?.tagName?.toLowerCase() === "svg") {
    const dims = resolveSvgDimensions(svgEl);
    svgW = dims.width;
    svgH = dims.height;
    svgMarkup = buildSanitizedSvgMarkup(svgEl, svgW, svgH);
  }
  // Fallback auf typische Druckbogen-Auflösung (A4 quer @300 dpi)
  if (!svgW || !svgH) {
    svgW = 3508;
    svgH = 2480;
  }

  // SVG-Einheiten (mm, pt, …) werden ignoriert – wir rendern immer auf
  // eine feste Zielauflösung, damit das Seitenverhältnis stimmt.
  const TARGET_LONG_EDGE = 4096;
  const aspect = svgW / svgH;
  const canvasW = aspect >= 1 ? TARGET_LONG_EDGE : Math.max(1, Math.round(TARGET_LONG_EDGE * aspect));
  const canvasH = aspect >= 1 ? Math.max(1, Math.round(TARGET_LONG_EDGE / aspect)) : TARGET_LONG_EDGE;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D-Kontext fuer SVG-Rasterisierung nicht verfuegbar");
  }

  const { image, transport } = await loadSvgImage(svgMarkup, svgText);

  // SVG ohne vollflaechigen Hintergrund liefert transparente Randpixel.
  // Diese werden auf opaken Materialien oft als dunkler Saum sichtbar.
  // Daher beim Rasterisieren explizit Weiss hinterlegen.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.drawImage(image, 0, 0, canvasW, canvasH);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.userData = {
    ...(texture.userData ?? {}),
    sourceType: "svg",
    svgWidth: svgW,
    svgHeight: svgH,
    rasterWidth: canvasW,
    rasterHeight: canvasH,
    svgParseHadError: hasParserError,
    svgImageTransport: transport,
  };
  return texture;
}

function resolveSvgDimensions(svgEl) {
  let width = parseSvgLength(svgEl.getAttribute("width"));
  let height = parseSvgLength(svgEl.getAttribute("height"));
  if (!width || !height) {
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/);
      if (parts.length >= 4) {
        const vbW = Number.parseFloat(parts[2]);
        const vbH = Number.parseFloat(parts[3]);
        width = width || (Number.isFinite(vbW) && vbW > 0 ? vbW : 0);
        height = height || (Number.isFinite(vbH) && vbH > 0 ? vbH : 0);
      }
    }
  }
  return { width, height };
}

function parseSvgLength(raw) {
  if (!raw) {
    return 0;
  }
  const numeric = Number.parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function buildSanitizedSvgMarkup(svgEl, width, height) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

async function loadSvgImage(sanitizedMarkup, originalMarkup) {
  const tried = [];
  const fromDataUrl = async (markup) => {
    const encoded = encodeURIComponent(markup);
    const url = `data:image/svg+xml;charset=utf-8,${encoded}`;
    tried.push("data-url");
    return loadImage(url);
  };
  const fromBlob = async (markup) => {
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    tried.push("blob-url");
    try {
      return await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  try {
    const image = await fromDataUrl(sanitizedMarkup);
    return { image, transport: "data-url" };
  } catch (errorData) {
    try {
      const image = await fromBlob(sanitizedMarkup);
      return { image, transport: "blob-url" };
    } catch (errorBlobSanitized) {
      try {
        const image = await fromBlob(originalMarkup);
        return { image, transport: "blob-url-original" };
      } catch (errorOriginal) {
        const detail = [errorData, errorBlobSanitized, errorOriginal]
          .map((err) => err?.message ?? String(err))
          .join(" | ");
        throw new Error(`SVG konnte nicht gerastert werden (${tried.join(", ")}): ${detail}`);
      }
    }
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bilddekodierung fehlgeschlagen"));
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
