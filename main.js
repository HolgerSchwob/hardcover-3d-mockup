import { BookViewer } from "./viewer/bookViewer.js";
import { loadTextureFromFile } from "./textures/textureFactory.js";

const viewerElement = document.getElementById("viewer");
const statusElement = document.getElementById("status");
const calcDebugElement = document.getElementById("calcDebug");
let viewer;

const inputs = {
  bookHeightMM: document.getElementById("bookHeightMM"),
  bookWidthMM: document.getElementById("bookWidthMM"),
  blockThicknessMM: document.getElementById("blockThicknessMM"),
  overhangMM: document.getElementById("overhangMM"),
  boardThicknessMM: document.getElementById("boardThicknessMM"),
  spineInsertThicknessMM: document.getElementById("spineInsertThicknessMM"),
  falzOffsetFromBlockLeftMM: document.getElementById("falzOffsetFromBlockLeftMM"),
  falzWidthMM: document.getElementById("falzWidthMM"),
  falzDepthMM: document.getElementById("falzDepthMM"),
  falzRadiusMM: document.getElementById("falzRadiusMM"),
  sheetWidthMM: document.getElementById("sheetWidthMM"),
  sheetHeightMM: document.getElementById("sheetHeightMM"),
  coverSheet: document.getElementById("coverSheet"),
  paperTexture: document.getElementById("paperTexture"),
  surfCoverRoughness: document.getElementById("surfCoverRoughness"),
  surfCoverClearcoat: document.getElementById("surfCoverClearcoat"),
  surfCoverClearcoatRoughness: document.getElementById("surfCoverClearcoatRoughness"),
  surfCoverEnvMapIntensity: document.getElementById("surfCoverEnvMapIntensity"),
  surfCoverMetalness: document.getElementById("surfCoverMetalness"),
  surfInnerRoughness: document.getElementById("surfInnerRoughness"),
  surfInnerMetalness: document.getElementById("surfInnerMetalness"),
  surfInnerEnvMapIntensity: document.getElementById("surfInnerEnvMapIntensity"),
  surfPaperEdgeLineStrength: document.getElementById("surfPaperEdgeLineStrength"),
  surfPaperEdgeGrainStrength: document.getElementById("surfPaperEdgeGrainStrength"),
  lightExposure: document.getElementById("lightExposure"),
  lightEnvironmentIntensity: document.getElementById("lightEnvironmentIntensity"),
  lightHemisphereIntensity: document.getElementById("lightHemisphereIntensity"),
  lightKeyIntensity: document.getElementById("lightKeyIntensity"),
  lightKeyAngleDeg: document.getElementById("lightKeyAngleDeg"),
  lightKeyPenumbra: document.getElementById("lightKeyPenumbra"),
  lightFillIntensity: document.getElementById("lightFillIntensity"),
  lightRimIntensity: document.getElementById("lightRimIntensity"),
  lightShadowOpacity: document.getElementById("lightShadowOpacity"),
  lightBloomStrength: document.getElementById("lightBloomStrength"),
  dragInvertX: document.getElementById("dragInvertX"),
  dragInvertY: document.getElementById("dragInvertY"),
};

const buttons = {
  apply: document.getElementById("apply"),
  exportGLTF: document.getElementById("exportGLTF"),
  fitView: document.getElementById("fitView"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
};

const cameraButtons = [...document.querySelectorAll("button[data-view]")];
const runtimeState = {
  textures: {
    coverSheet: null,
    paperTexture: null,
  },
  currentView: "marketing",
};

window.addEventListener("error", (event) => {
  setStatus(`Runtime-Fehler: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason?.message ?? String(event.reason);
  setStatus(`Promise-Fehler: ${reason}`);
});

initialize();

function initialize() {
  try {
    viewer = new BookViewer(viewerElement);
  } catch (error) {
    setStatus(`Viewer-Start fehlgeschlagen: ${error.message ?? error}`);
    return;
  }

  buttons.apply.addEventListener("click", applyChanges);
  buttons.exportGLTF.addEventListener("click", () => viewer.exportGLTF());
  buttons.fitView.addEventListener("click", () => viewer.fitCurrentView());
  buttons.zoomIn.addEventListener("click", () => viewer.zoomBy(0.84));
  buttons.zoomOut.addEventListener("click", () => viewer.zoomBy(1.2));
  cameraButtons.forEach((button) => {
    button.addEventListener("click", () => {
      runtimeState.currentView = button.dataset.view;
      if (runtimeState.currentView === "open") {
        viewer.setOpenAmount(1);
      } else {
        viewer.setOpenAmount(0);
      }
      applyBookUpdate();
      viewer.setCameraPreset(runtimeState.currentView);
    });
  });

  [
    inputs.bookHeightMM,
    inputs.bookWidthMM,
    inputs.blockThicknessMM,
    inputs.overhangMM,
    inputs.boardThicknessMM,
    inputs.spineInsertThicknessMM,
    inputs.falzOffsetFromBlockLeftMM,
    inputs.falzWidthMM,
    inputs.falzDepthMM,
    inputs.falzRadiusMM,
    inputs.sheetWidthMM,
    inputs.sheetHeightMM,
  ].forEach((input) => {
    input.addEventListener("input", debounce(applyBookUpdate, 150));
  });

  const surfaceRangeIds = [
    "surfCoverRoughness",
    "surfCoverClearcoat",
    "surfCoverClearcoatRoughness",
    "surfCoverEnvMapIntensity",
    "surfCoverMetalness",
    "surfInnerRoughness",
    "surfInnerMetalness",
    "surfInnerEnvMapIntensity",
    "surfPaperEdgeLineStrength",
    "surfPaperEdgeGrainStrength",
  ];
  const debouncedBook = debounce(applyBookUpdate, 120);
  surfaceRangeIds.forEach((id) => {
    const el = inputs[id];
    if (!el) {
      return;
    }
    el.addEventListener("input", () => {
      syncSurfaceRangeLabels();
      debouncedBook();
    });
  });
  const lightingRangeIds = [
    "lightExposure",
    "lightEnvironmentIntensity",
    "lightHemisphereIntensity",
    "lightKeyIntensity",
    "lightKeyAngleDeg",
    "lightKeyPenumbra",
    "lightFillIntensity",
    "lightRimIntensity",
    "lightShadowOpacity",
    "lightBloomStrength",
  ];
  const debouncedLighting = debounce(applyLightingUpdate, 40);
  lightingRangeIds.forEach((id) => {
    const el = inputs[id];
    if (!el) {
      return;
    }
    el.addEventListener("input", () => {
      syncSurfaceRangeLabels();
      debouncedLighting();
    });
  });
  [inputs.dragInvertX, inputs.dragInvertY].forEach((input) => {
    input?.addEventListener("change", applyDragOptionsUpdate);
  });
  syncSurfaceRangeLabels();

  [inputs.coverSheet, inputs.paperTexture].forEach((input) => {
    input.addEventListener("change", applyChanges);
  });

  window.addEventListener("resize", () => {
    viewer.resize();
    viewer.fitCurrentView();
  });
  applyBookUpdate();
  viewer.setCameraPreset(runtimeState.currentView);
  // Nach dem ersten Layout-Frame nochmal sauber einpassen, damit die
  // Kamera die tatsaechliche Viewport-Groesse sieht und das Buch mittig
  // im Canvas sitzt.
  requestAnimationFrame(() => {
    viewer.resize();
    viewer.fitCurrentView();
  });
  setStatus("Viewer bereit.");
  startViewStateLoop();
}

function startViewStateLoop() {
  let lastYaw = null;
  let lastPitch = null;
  let lastZoom = null;
  function tick() {
    if (viewer) {
      const vs = viewer.getViewState();
      if (vs.yawRad !== lastYaw || vs.pitchRad !== lastPitch || vs.zoomScale !== lastZoom) {
        lastYaw = vs.yawRad;
        lastPitch = vs.pitchRad;
        lastZoom = vs.zoomScale;
        const params = readNumericParams();
        const derived = deriveBookAndSheetValues(params);
        renderDebugValues(params, derived, runtimeState.textures.coverSheet);
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function applyChanges() {
  try {
    setStatus("Lade Texturen ...");
    runtimeState.textures.coverSheet = await loadTextureFromFile(inputs.coverSheet.files[0] ?? null);
    runtimeState.textures.paperTexture = await loadTextureFromFile(inputs.paperTexture.files[0] ?? null);
    applyBookUpdate();
    const params = readNumericParams();
    const derived = deriveBookAndSheetValues(params);
    const sheetWarning = getSheetMappingWarning(params, derived, runtimeState.textures.coverSheet);
    const sheet = runtimeState.textures.coverSheet;
    const isSvg = inputs.coverSheet.files[0]?.name?.toLowerCase().endsWith(".svg");
    setStatus(sheetWarning ?? (sheet
      ? `Mockup aktualisiert (Druckbogen ${isSvg ? "SVG" : "PNG"}).`
      : "Mockup aktualisiert."));
  } catch (error) {
    setStatus(`Fehler beim Laden: ${error.message ?? error}`);
  }
}

function applyBookUpdate() {
  const params = readNumericParams();
  const derived = deriveBookAndSheetValues(params);
  viewer.update(
    {
      ...params,
      ...derived,
    },
    runtimeState.textures,
    {
      openAmount: runtimeState.currentView === "open" ? 1 : 0,
      surfaceMaterial: readSurfaceMaterialParams(),
      textBlockStyle: readTextBlockStyleParams(),
      lighting: readLightingParams(),
      dragOptions: readDragOptions(),
    },
  );
  renderDebugValues(params, derived, runtimeState.textures.coverSheet);

  const sheetWarning = getSheetMappingWarning(params, derived, runtimeState.textures.coverSheet);
  if (sheetWarning) {
    setStatus(sheetWarning);
  }
}

function applyLightingUpdate() {
  viewer.updateLighting(readLightingParams());
}

function applyDragOptionsUpdate() {
  viewer.updateDragOptions(readDragOptions());
}

function readSurfaceMaterialParams() {
  return {
    coverRoughness: clamp01(toFloat(inputs.surfCoverRoughness?.value, 0.68)),
    coverMetalness: clamp01(toFloat(inputs.surfCoverMetalness?.value, 0.03)),
    coverEnvMapIntensity: clamp(
      toFloat(inputs.surfCoverEnvMapIntensity?.value, 0.55),
      0,
      3,
    ),
    coverClearcoat: clamp01(toFloat(inputs.surfCoverClearcoat?.value, 0.28)),
    coverClearcoatRoughness: clamp01(toFloat(inputs.surfCoverClearcoatRoughness?.value, 0.34)),
    innerRoughness: clamp01(toFloat(inputs.surfInnerRoughness?.value, 0.88)),
    innerMetalness: clamp01(toFloat(inputs.surfInnerMetalness?.value, 0.02)),
    innerEnvMapIntensity: clamp(
      toFloat(inputs.surfInnerEnvMapIntensity?.value, 0.32),
      0,
      3,
    ),
  };
}

function readTextBlockStyleParams() {
  return {
    lineStrength: clamp01(toFloat(inputs.surfPaperEdgeLineStrength?.value, 0.72)),
    grainStrength: clamp01(toFloat(inputs.surfPaperEdgeGrainStrength?.value, 0.58)),
  };
}

function readLightingParams() {
  return {
    exposure: clamp(toFloat(inputs.lightExposure?.value, 0.98), 0.6, 1.6),
    environmentIntensity: clamp(toFloat(inputs.lightEnvironmentIntensity?.value, 0.92), 0, 3),
    hemisphereIntensity: clamp(toFloat(inputs.lightHemisphereIntensity?.value, 0.3), 0, 2),
    keyIntensity: clamp(toFloat(inputs.lightKeyIntensity?.value, 1.55), 0, 4),
    keyAngleDeg: clamp(toFloat(inputs.lightKeyAngleDeg?.value, 30), 8, 80),
    keyPenumbra: clamp01(toFloat(inputs.lightKeyPenumbra?.value, 0.72)),
    fillIntensity: clamp(toFloat(inputs.lightFillIntensity?.value, 0.28), 0, 2),
    rimIntensity: clamp(toFloat(inputs.lightRimIntensity?.value, 0.62), 0, 3),
    shadowOpacity: clamp(toFloat(inputs.lightShadowOpacity?.value, 0.14), 0, 0.8),
    bloomStrength: clamp(toFloat(inputs.lightBloomStrength?.value, 0.035), 0, 0.5),
  };
}

function readDragOptions() {
  return {
    invertX: !!inputs.dragInvertX?.checked,
    invertY: !!inputs.dragInvertY?.checked,
  };
}

function syncSurfaceRangeLabels() {
  for (const span of document.querySelectorAll(".range-val[data-for]")) {
    const id = span.getAttribute("data-for");
    const input = id ? document.getElementById(id) : null;
    if (!input || input.type !== "range") {
      continue;
    }
    const v = Number.parseFloat(input.value);
    if (!Number.isFinite(v)) {
      span.textContent = "—";
      continue;
    }
    const step = Number.parseFloat(input.step);
    const stepDecimals = Number.isFinite(step) && step > 0 && step < 1
      ? Math.min(3, step.toString().split(".")[1]?.length ?? 2)
      : 0;
    span.textContent = v.toFixed(stepDecimals);
  }
}

function readNumericParams() {
  return {
    bookHeightMM: toPositiveFloat(inputs.bookHeightMM.value, 297),
    bookWidthMM: toPositiveFloat(inputs.bookWidthMM.value, 210),
    blockThicknessMM: Math.max(1, toPositiveFloat(inputs.blockThicknessMM.value, 10)),
    overhangMM: toNonNegativeFloat(inputs.overhangMM.value, 2.5),
    boardThicknessMM: Math.max(0.5, toPositiveFloat(inputs.boardThicknessMM.value, 2)),
    spineInsertThicknessMM: Math.max(0, toPositiveFloat(inputs.spineInsertThicknessMM.value, 1)),
    falzOffsetFromBlockLeftMM: Math.max(0, toPositiveFloat(inputs.falzOffsetFromBlockLeftMM.value, 8)),
    falzWidthMM: Math.max(0.5, toPositiveFloat(inputs.falzWidthMM.value, 6)),
    falzDepthMM: Math.max(0.1, toPositiveFloat(inputs.falzDepthMM.value, 1.7)),
    falzRadiusMM: Math.max(0.1, toPositiveFloat(inputs.falzRadiusMM.value, 1.2)),
    sheetWidthMM: toPositiveFloat(inputs.sheetWidthMM.value, 488),
    sheetHeightMM: toPositiveFloat(inputs.sheetHeightMM.value, 330),
  };
}

function deriveBookAndSheetValues(params) {
  const coverHeightMM = params.bookHeightMM + params.overhangMM * 2;
  const coverWidthMM = params.bookWidthMM + params.overhangMM;
  const spineOuterWidthMM = params.blockThicknessMM + params.boardThicknessMM * 2;
  const spineCoreWidthMM = params.blockThicknessMM;
  const halfInsertAndCoreMM = params.blockThicknessMM * 0.5 + params.spineInsertThicknessMM * 0.5;
  const sheetCenterXMM = params.sheetWidthMM * 0.5;
  const frontX1MM = sheetCenterXMM + halfInsertAndCoreMM;
  const frontX2MM = frontX1MM + coverWidthMM;
  const backX2MM = sheetCenterXMM - halfInsertAndCoreMM;
  const backX1MM = backX2MM - coverWidthMM;
  // Spine-Ausschnitt auf dem Druckbogen = volle sichtbare Rueckenbreite
  // (Block + 2*Pappe), nicht nur Blockdicke — sonst wirkt die Textur auf
  // der Rueckeneinlage seitlich zu schmal.
  const spineX1MM = sheetCenterXMM - spineOuterWidthMM * 0.5;
  const spineX2MM = sheetCenterXMM + spineOuterWidthMM * 0.5;
  const y1MM = (params.sheetHeightMM - coverHeightMM) * 0.5;
  const y2MM = y1MM + coverHeightMM;

  return {
    coverHeightMM,
    coverWidthMM,
    spineOuterWidthMM,
    spineCoreWidthMM,
    frontX1MM,
    frontX2MM,
    backX1MM,
    backX2MM,
    spineX1MM,
    spineX2MM,
    y1MM,
    y2MM,
    // Legacy-Parameter für vorhandene Geometriepfade.
    spineWidthMM: spineCoreWidthMM,
    bleedMM: params.overhangMM,
  };
}

function renderDebugValues(params, derived, coverSheetTexture) {
  const lines = [
    `Coverformathoehe: ${derived.coverHeightMM.toFixed(2)} mm`,
    `Coverformatbreite: ${derived.coverWidthMM.toFixed(2)} mm`,
    `Rueckenbreite (Block + 2*Pappe): ${derived.spineOuterWidthMM.toFixed(2)} mm`,
    `Rueckenkernbreite (Blockdicke): ${derived.spineCoreWidthMM.toFixed(2)} mm`,
    `Spine-UV-Breite auf Bogen: ${(derived.spineX2MM - derived.spineX1MM).toFixed(2)} mm (= Ruecken aussen)`,
    "",
    "Druckbogen-Koordinaten (mm):",
    `Front: X1=${derived.frontX1MM.toFixed(2)}  X2=${derived.frontX2MM.toFixed(2)}  Y1=${derived.y1MM.toFixed(2)}  Y2=${derived.y2MM.toFixed(2)}`,
    `Back:  X1=${derived.backX1MM.toFixed(2)}  X2=${derived.backX2MM.toFixed(2)}  Y1=${derived.y1MM.toFixed(2)}  Y2=${derived.y2MM.toFixed(2)}`,
    `Spine: X1=${derived.spineX1MM.toFixed(2)}  X2=${derived.spineX2MM.toFixed(2)}  Y1=${derived.y1MM.toFixed(2)}  Y2=${derived.y2MM.toFixed(2)}`,
  ];

  if (coverSheetTexture?.image) {
    lines.push(
      "",
      `Textur: ${coverSheetTexture.image.width}x${coverSheetTexture.image.height} px`,
      `Textur-Verhaeltnis: ${(coverSheetTexture.image.width / Math.max(1, coverSheetTexture.image.height)).toFixed(6)}`,
      `Sheet-Verhaeltnis:  ${(params.sheetWidthMM / Math.max(0.001, params.sheetHeightMM)).toFixed(6)}`,
    );
  }

  if (viewer) {
    const vs = viewer.getViewState();
    lines.push(
      "",
      "--- Ansicht (reproduzierbar) ---",
      `Preset:     ${vs.preset}`,
      `Yaw:        ${vs.yawRad} rad  (${vs.yawDeg}°)`,
      `Pitch:      ${vs.pitchRad} rad  (${vs.pitchDeg}°)`,
      `Zoom:       ${vs.zoomScale}`,
      `Kamera:     X=${vs.camX}  Y=${vs.camY}  Z=${vs.camZ}`,
    );
  }

  calcDebugElement.textContent = lines.join("\n");
}

function toPositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Wie toPositiveFloat, erlaubt aber 0 (z. B. Überstand für Paperbacks). */
function toNonNegativeFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function setStatus(message) {
  statusElement.textContent = message;
}

function getSheetMappingWarning(params, derived, coverSheetTexture) {
  if (!coverSheetTexture?.image) {
    return null;
  }

  const warnings = [];

  if (derived.backX1MM < 0 || derived.frontX2MM > params.sheetWidthMM) {
    warnings.push(
      `Coverbereiche ausserhalb Bogen: BackX1=${derived.backX1MM.toFixed(1)} mm, FrontX2=${derived.frontX2MM.toFixed(1)} mm bei Bogenbreite ${params.sheetWidthMM.toFixed(1)} mm.`,
    );
  }

  if (derived.y1MM < 0 || derived.y2MM > params.sheetHeightMM) {
    warnings.push(
      `Coverhoehe passt nicht: Y1=${derived.y1MM.toFixed(1)} mm, Y2=${derived.y2MM.toFixed(1)} mm bei Bogenhoehe ${params.sheetHeightMM.toFixed(1)} mm.`,
    );
  }

  const imageRatio = coverSheetTexture.image.width / Math.max(1, coverSheetTexture.image.height);
  const sheetRatio = params.sheetWidthMM / Math.max(0.001, params.sheetHeightMM);
  const ratioDeviation = Math.abs(sheetRatio - imageRatio) / imageRatio;
  if (ratioDeviation > 0.01) {
    warnings.push(
      `Seitenverhaeltnis PNG (${coverSheetTexture.image.width}x${coverSheetTexture.image.height}) passt nicht zu Sheet-Massen (${params.sheetWidthMM.toFixed(1)}x${params.sheetHeightMM.toFixed(1)} mm).`,
    );
  }

  if (warnings.length === 0) {
    return null;
  }

  return `Warnung: ${warnings.join(" ")}`;
}

function debounce(fn, delayMs) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delayMs);
  };
}
