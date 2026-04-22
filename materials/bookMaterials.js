import * as THREE from "https://esm.sh/three@0.160.0";
import { createEdgeCropTexture, createSpineTexture } from "../textures/textureFactory.js";

/** Mattfolienkaschierung: hohe Grundrauigkeit, duenne matte Deckschicht (Clearcoat). */
const laminateBase = {
  roughness: 0.68,
  metalness: 0.03,
  envMapIntensity: 0.55,
  clearcoat: 0.28,
  clearcoatRoughness: 0.34,
};

function createLaminateOuterMaterial(map) {
  return new THREE.MeshPhysicalMaterial({
    ...laminateBase,
    map,
  });
}

/**
 * @typedef {object} SurfaceMaterialOptions
 * @property {number} [coverRoughness]
 * @property {number} [coverMetalness]
 * @property {number} [coverEnvMapIntensity]
 * @property {number} [coverClearcoat]
 * @property {number} [coverClearcoatRoughness]
 * @property {number} [innerRoughness] — MeshStandard: Innenfläche + Kantenumwicklung
 * @property {number} [innerMetalness]
 * @property {number} [innerEnvMapIntensity]
 */

const defaultSurfaceOptions = {
  coverRoughness: 0.68,
  coverMetalness: 0.03,
  coverEnvMapIntensity: 0.55,
  coverClearcoat: 0.28,
  coverClearcoatRoughness: 0.34,
  innerRoughness: 0.88,
  innerMetalness: 0.02,
  innerEnvMapIntensity: 0.32,
};

/**
 * @param {SurfaceMaterialOptions} [surface]
 * @returns {Required<SurfaceMaterialOptions>}
 */
function resolveSurfaceOptions(surface) {
  return { ...defaultSurfaceOptions, ...surface };
}

/**
 * @param {import("https://esm.sh/three@0.160.0").Material | null | undefined} mat
 * @param {Required<SurfaceMaterialOptions>} s
 */
function applyCoverPhysicalToMaterial(mat, s) {
  if (!mat || !("isMeshPhysicalMaterial" in mat) || !mat.isMeshPhysicalMaterial) {
    return;
  }
  mat.roughness = s.coverRoughness;
  mat.metalness = s.coverMetalness;
  mat.envMapIntensity = s.coverEnvMapIntensity;
  mat.clearcoat = s.coverClearcoat;
  mat.clearcoatRoughness = s.coverClearcoatRoughness;
}

/**
 * @param {import("https://esm.sh/three@0.160.0").Material | null | undefined} mat
 * @param {Required<SurfaceMaterialOptions>} s
 */
function applyInnerStandardToMaterial(mat, s) {
  if (!mat || !("isMeshStandardMaterial" in mat) || !mat.isMeshStandardMaterial) {
    return;
  }
  mat.roughness = s.innerRoughness;
  mat.metalness = s.innerMetalness;
  mat.envMapIntensity = s.innerEnvMapIntensity;
}

/**
 * Wendet Slider-Werte auf alle relevanten Buch-Materialien an.
 * @param {object} bundle
 * @param {Required<SurfaceMaterialOptions>} s
 */
function applySurfaceOptionsToBundle(bundle, s) {
  const { frontOuter, backOuter, spineOuter, innerFace, frontTurnIn, backTurnIn } = bundle;
  applyCoverPhysicalToMaterial(frontOuter, s);
  applyCoverPhysicalToMaterial(backOuter, s);
  applyCoverPhysicalToMaterial(spineOuter, s);
  applyInnerStandardToMaterial(innerFace, s);
  for (const set of [frontTurnIn, backTurnIn]) {
    if (!set) {
      continue;
    }
    for (const m of Object.values(set)) {
      applyCoverPhysicalToMaterial(m, s);
      applyInnerStandardToMaterial(m, s);
    }
  }
}

/**
 * @param {object} textures
 * @param {object} dims
 * @param {SurfaceMaterialOptions} [surface]
 */
export function createBookMaterials(textures, dims, surface) {
  const matteSettings = {
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.32,
  };

  const neutralOuter = new THREE.MeshPhysicalMaterial({
    ...laminateBase,
    color: 0x7b828d,
  });

  const neutralInner = new THREE.MeshStandardMaterial({
    ...matteSettings,
    color: 0xd6d0c4,
  });

  const sheetActive = !!textures.coverSheet;

  // Im Druckbogen-Modus teilen sich Front, Rücken und Spine dieselbe Textur.
  // Die Differenzierung passiert ausschließlich über die UVs (Geometrie).
  const sheetMaterial = sheetActive
    ? createLaminateOuterMaterial(textures.coverSheet)
    : null;

  const frontOuter = sheetActive
    ? sheetMaterial
    : textures.coverFront
      ? createLaminateOuterMaterial(textures.coverFront)
      : neutralOuter.clone();

  const backOuter = sheetActive
    ? sheetMaterial
    : textures.coverBack
      ? createLaminateOuterMaterial(textures.coverBack)
      : neutralOuter.clone();

  const spineOuter = sheetActive
    ? sheetMaterial
    : createLaminateOuterMaterial(createSpineTexture(dims.spineWidthMM));

  const innerFace = textures.paperTexture
    ? new THREE.MeshStandardMaterial({ ...matteSettings, map: textures.paperTexture })
    : neutralInner.clone();

  const edgeWrap = new THREE.MeshStandardMaterial({
    ...matteSettings,
    roughness: 0.82,
    color: 0x4a4f5d,
  });

  const frontTurnIn = sheetActive
    ? createTurnInSetFromSheet(textures.coverSheet, dims.sheetTurnInLayout, "front", matteSettings, neutralInner)
    : createTurnInSet(textures.coverFront, dims, neutralInner);
  const backTurnIn = sheetActive
    ? createTurnInSetFromSheet(textures.coverSheet, dims.sheetTurnInLayout, "back", matteSettings, neutralInner)
    : createTurnInSet(textures.coverBack, dims, neutralInner);

  const bundle = {
    frontOuter,
    backOuter,
    spineOuter,
    innerFace,
    edgeWrap,
    frontTurnIn,
    backTurnIn,
    sheetActive,
  };
  applySurfaceOptionsToBundle(bundle, resolveSurfaceOptions(surface));
  return bundle;
}

/**
 * Einschlag-Streifen aus dem Druckbogen (mm-Rechteck) per map.offset/repeat.
 * Gleiche Logik wie die Kanten-Quads: angrenzend an Cover-Rechteck +/- bleed.
 */
function createCroppedSheetMaterial(baseMap, matteSettings, x1mm, x2mm, y1mm, y2mm, sheetWmm, sheetHmm) {
  const W = Math.max(0.001, sheetWmm);
  const H = Math.max(0.001, sheetHmm);
  const map = baseMap.clone();
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const u0 = THREE.MathUtils.clamp(x1mm / W, 0, 1);
  const u1 = THREE.MathUtils.clamp(x2mm / W, 0, 1);
  const v0 = THREE.MathUtils.clamp(y1mm / H, 0, 1);
  const v1 = THREE.MathUtils.clamp(y2mm / H, 0, 1);
  const du = Math.max(1e-6, u1 - u0);
  const dv = Math.max(1e-6, v1 - v0);
  map.repeat.set(du, dv);
  map.offset.set(u0, v0);
  map.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({
    ...laminateBase,
    map,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function createTurnInSetFromSheet(coverSheetMap, layout, side, matteSettings, neutralInner) {
  if (!coverSheetMap || !layout) {
    return createTurnInSet(null, { outerWidthMM: 1, outerHeightMM: 1, bleedMM: 1 }, neutralInner);
  }
  const W = layout.sheetWidthMM;
  const H = layout.sheetHeightMM;
  const b = Math.max(0, layout.bleedMM);
  const f1 = layout.frontX1MM;
  const f2 = layout.frontX2MM;
  const b1 = layout.backX1MM;
  const b2 = layout.backX2MM;
  const y1 = layout.y1MM;
  const y2 = layout.y2MM;
  // Innenmass der Einschlaege (wie addTurnIns): Geometrie ist um je b schmaler/hoeher
  // als das volle Cover-Rechteck. Die Textur muss denselben **mm/mm**-Ausschnitt nutzen,
  // sonst wird y1..y2 auf kuerzere Kanten gestaucht → sichtbarer Versatz zu Deckel/Spine.
  let yi1 = y1 + b;
  let yi2 = y2 - b;
  if (!(yi2 > yi1)) {
    yi1 = y1;
    yi2 = y2;
  }
  let innerUFront1 = f1 + b;
  let innerUFront2 = f2 - b;
  if (!(innerUFront2 > innerUFront1)) {
    innerUFront1 = f1;
    innerUFront2 = f2;
  }
  let innerUBack1 = b1 + b;
  let innerUBack2 = b2 - b;
  if (!(innerUBack2 > innerUBack1)) {
    innerUBack1 = b1;
    innerUBack2 = b2;
  }

  if (side === "front") {
    return {
      top: createCroppedSheetMaterial(coverSheetMap, matteSettings, innerUFront1, innerUFront2, y2, y2 + b, W, H),
      right: createCroppedSheetMaterial(coverSheetMap, matteSettings, f2, f2 + b, yi1, yi2, W, H),
      bottom: createCroppedSheetMaterial(coverSheetMap, matteSettings, innerUFront1, innerUFront2, y1 - b, y1, W, H),
      left: createCroppedSheetMaterial(coverSheetMap, matteSettings, f1 - b, f1, yi1, yi2, W, H),
    };
  }

  // Rueckdeckel: Falz liegt bei b2 (Richtung Spine, groesseres X). Streifen muss wie vorn
  // am **inneren** Rand des Cover-Rechtecks liegen: [b2-b, b2] — NICHT [b2, b2+b],
  // das faellt in den Spine-Ausschnitt des PNG.
  return {
    top: createCroppedSheetMaterial(coverSheetMap, matteSettings, innerUBack1, innerUBack2, y2, y2 + b, W, H),
    right: createCroppedSheetMaterial(coverSheetMap, matteSettings, b2 - b, b2, yi1, yi2, W, H),
    bottom: createCroppedSheetMaterial(coverSheetMap, matteSettings, innerUBack1, innerUBack2, y1 - b, y1, W, H),
    left: createCroppedSheetMaterial(coverSheetMap, matteSettings, b1 - b, b1, yi1, yi2, W, H),
  };
}

function createTurnInSet(sourceTexture, dims, fallback) {
  if (!sourceTexture) {
    const top = fallback.clone();
    const right = fallback.clone();
    const bottom = fallback.clone();
    const left = fallback.clone();
    top.side = THREE.DoubleSide;
    right.side = THREE.DoubleSide;
    bottom.side = THREE.DoubleSide;
    left.side = THREE.DoubleSide;
    return {
      top,
      right,
      bottom,
      left,
    };
  }

  return {
    top: new THREE.MeshPhysicalMaterial({
      ...laminateBase,
      map: createEdgeCropTexture(sourceTexture, "top", dims),
      side: THREE.DoubleSide,
    }),
    right: new THREE.MeshPhysicalMaterial({
      ...laminateBase,
      map: createEdgeCropTexture(sourceTexture, "right", dims),
      side: THREE.DoubleSide,
    }),
    bottom: new THREE.MeshPhysicalMaterial({
      ...laminateBase,
      map: createEdgeCropTexture(sourceTexture, "bottom", dims),
      side: THREE.DoubleSide,
    }),
    left: new THREE.MeshPhysicalMaterial({
      ...laminateBase,
      map: createEdgeCropTexture(sourceTexture, "left", dims),
      side: THREE.DoubleSide,
    }),
  };
}
