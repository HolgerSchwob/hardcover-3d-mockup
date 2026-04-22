import * as THREE from "https://esm.sh/three@0.160.0";
import { RoundedBoxGeometry } from "https://esm.sh/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js";
import { getPaperEdgeTextures } from "../textures/textureFactory.js";

const MM_TO_M = 0.001;

const FULL_UV_RECT = Object.freeze({ uStart: 0, uEnd: 1, vStart: 0, vEnd: 1 });

// Berechnet die UV-Rechtecke für U4 | Rücken | U1 über absolute
// Druckbogenkoordinaten in mm (X1/X2/Y1/Y2). Wenn kein Druckbogen aktiv
// ist, liefert alles den vollen 0..1 Bereich (Legacy-Modus).
function computeSheetUVRects({
  sheetActive,
  sheetWidthMM,
  sheetHeightMM,
  frontX1MM,
  frontX2MM,
  backX1MM,
  backX2MM,
  spineX1MM,
  spineX2MM,
  y1MM,
  y2MM,
}) {
  if (!sheetActive) {
    return {
      front: FULL_UV_RECT,
      back: FULL_UV_RECT,
      spine: FULL_UV_RECT,
    };
  }

  const safeSheetWidthMM = Math.max(0.001, sheetWidthMM);
  const safeSheetHeightMM = Math.max(0.001, sheetHeightMM);
  const clampX = (x) => THREE.MathUtils.clamp(x, 0, safeSheetWidthMM);
  const clampY = (y) => THREE.MathUtils.clamp(y, 0, safeSheetHeightMM);
  const toRect = (x1, x2, yStart, yEnd) => {
    const left = Math.min(clampX(x1), clampX(x2));
    const right = Math.max(clampX(x1), clampX(x2));
    const bottom = Math.min(clampY(yStart), clampY(yEnd));
    const top = Math.max(clampY(yStart), clampY(yEnd));
    return {
      uStart: left / safeSheetWidthMM,
      uEnd: right / safeSheetWidthMM,
      vStart: bottom / safeSheetHeightMM,
      vEnd: top / safeSheetHeightMM,
    };
  };

  return {
    front: toRect(frontX1MM, frontX2MM, y1MM, y2MM),
    back: toRect(backX1MM, backX2MM, y1MM, y2MM),
    spine: toRect(spineX1MM, spineX2MM, y1MM, y2MM),
  };
}

export function createHardcoverBook(params, materials, options = {}) {
  const group = new THREE.Group();
  group.name = "HardcoverBook";

  const blockWidthMM = params.bookWidthMM;
  const blockHeightMM = params.bookHeightMM;
  const overhangMM = params.overhangMM ?? params.bleedMM ?? 2.5;
  const boardWidthMM = params.coverWidthMM ?? (blockWidthMM + overhangMM);
  const boardHeightMM = params.coverHeightMM ?? (blockHeightMM + overhangMM * 2);
  const boardThicknessMM = params.boardThicknessMM;
  const spineInsertThicknessMM = Math.max(0.1, params.spineInsertThicknessMM ?? 1);
  const spineCoreWidthMM = params.spineCoreWidthMM ?? params.spineWidthMM ?? params.blockThicknessMM ?? 10;
  const spineOuterWidthMM = params.spineOuterWidthMM ?? (spineCoreWidthMM + boardThicknessMM * 2);

  const hingeZoneMM = 8.0;
  const hingeVisualGapMM = 0.8;
  /** Abstand Buchblock ↔ Rückeneinlage (mm); 0 = Innenkante bündig am linken Blockrand. */
  const spineToBlockGapMM = params.spineToBlockGapMM ?? 0;
  const falzOffsetFromBlockLeftMM = params.falzOffsetFromBlockLeftMM ?? 8.0;
  const falzWidthMM = params.falzWidthMM ?? 6.0;
  const falzDepthMM = params.falzDepthMM ?? 1.7;
  const falzRadiusMM = params.falzRadiusMM ?? 1.2;
  // Buchblockmaße sind laut Eingabe exakte Endmaße.
  const textBlockTrimMM = 0.0;
  const bevelRadiusMM = Math.min(0.45, params.boardThicknessMM * 0.25);
  const openAngle = options.openAmount ? THREE.MathUtils.lerp(0, Math.PI * 0.26, options.openAmount) : 0;
  // In der Breite soll der Überstand nur an der Vorderkante liegen.
  // Daher verschieben wir beide Deckel um +overhang/2 entlang X.
  const coverXShiftMM = overhangMM * 0.5;
  const turnInBleedMM = params.bleedMM ?? params.overhangMM ?? 2.5;

  const sheetW = params.sheetWidthMM ?? 488;
  const sheetH = params.sheetHeightMM ?? 330;
  const halfInsertAndCoreMM = spineCoreWidthMM * 0.5 + spineInsertThicknessMM * 0.5;
  const frontX1MM = params.frontX1MM ?? sheetW * 0.5 + halfInsertAndCoreMM;
  const frontX2MM = params.frontX2MM ?? frontX1MM + boardWidthMM;
  const backX2MM = params.backX2MM ?? sheetW * 0.5 - halfInsertAndCoreMM;
  const backX1MM = params.backX1MM ?? backX2MM - boardWidthMM;
  const y1MM = params.y1MM ?? (sheetH - boardHeightMM) * 0.5;
  const y2MM = params.y2MM ?? y1MM + boardHeightMM;
  const spineX1MM = params.spineX1MM ?? sheetW * 0.5 - spineOuterWidthMM * 0.5;
  const spineX2MM = params.spineX2MM ?? sheetW * 0.5 + spineOuterWidthMM * 0.5;

  // UV-Rechtecke für Druckbogen-Modus: U4 (back) | Rücken | U1 (front), zentriert.
  // Wenn kein Bogen aktiv ist: voller 0..1 Bereich (Legacy-Modus mit getrennten Texturen).
  const sheetUV = computeSheetUVRects({
    sheetActive: !!materials.sheetActive,
    sheetWidthMM: sheetW,
    sheetHeightMM: sheetH,
    frontX1MM,
    frontX2MM,
    backX1MM,
    backX2MM,
    spineX1MM,
    spineX2MM,
    y1MM,
    y2MM,
  });

  const textBlockWidthMM = Math.max(blockWidthMM - textBlockTrimMM, 1);
  const textBlockHeightMM = Math.max(blockHeightMM - textBlockTrimMM, 1);
  const textBlockLeftXMM = -textBlockWidthMM * 0.5;
  const falzCenterRaw = textBlockLeftXMM + falzOffsetFromBlockLeftMM + falzWidthMM * 0.5;
  const falzMinCenter = textBlockLeftXMM + falzWidthMM * 0.5;
  const falzMaxCenter = textBlockLeftXMM + textBlockWidthMM - falzWidthMM * 0.5;
  const falzChannelCenterXMM = THREE.MathUtils.clamp(falzCenterRaw, falzMinCenter, falzMaxCenter);

  const coverSize = {
    width: boardWidthMM * MM_TO_M,
    height: boardHeightMM * MM_TO_M,
    depth: boardThicknessMM * MM_TO_M,
  };

  const spineBoardSize = {
    width: spineInsertThicknessMM * MM_TO_M,
    height: boardHeightMM * MM_TO_M,
    depth: spineOuterWidthMM * MM_TO_M,
  };

  const frontHingeX = (-(boardWidthMM * 0.5 + hingeVisualGapMM * 0.5) + coverXShiftMM) * MM_TO_M;
  const frontPivot = new THREE.Group();
  frontPivot.position.x = frontHingeX;
  frontPivot.rotation.y = -openAngle;

  let frontBoard = createBoardMesh(
    coverSize,
    bevelRadiusMM * MM_TO_M,
    materials.frontOuter,
    materials.innerFace,
    materials.edgeWrap,
    {
      centerX: falzChannelCenterXMM * MM_TO_M,
      width: falzWidthMM * MM_TO_M,
      depth: falzDepthMM * MM_TO_M,
      radius: falzRadiusMM * MM_TO_M,
      outerSideSign: 1,
    },
    sheetUV.front,
  );
  // Ohne U-Nut: createBoardMesh liefert ein Mesh; Kantenstreifen als Kinder davon
  // liegen z-fighting / Draw-Reihenfolge mit der dunklen Papp-+Y-Flaeche. Group-
  // Wrapper + polygonOffset auf Streifenmaterial behebt das.
  if (materials.sheetActive && !(frontBoard instanceof THREE.Group)) {
    const holder = new THREE.Group();
    holder.add(frontBoard);
    frontBoard = holder;
  }
  frontBoard.position.x = (boardWidthMM * 0.5 + hingeVisualGapMM * 0.5) * MM_TO_M;
  frontBoard.position.z = (spineCoreWidthMM * 0.5 + boardThicknessMM * 0.5) * MM_TO_M;
  frontBoard.name = "FrontBoard";
  frontPivot.add(frontBoard);
  if (materials.sheetActive) {
    addCoverBoardEdgeStripsFromSheet(frontBoard, materials.frontOuter, {
      variant: "front",
      halfWm: coverSize.width * 0.5,
      halfHm: coverSize.height * 0.5,
      halfDm: coverSize.depth * 0.5,
      sheetW,
      sheetH,
      frontX1MM,
      frontX2MM,
      backX1MM,
      backX2MM,
      y1MM,
      y2MM,
      thicknessMm: boardThicknessMM,
    });
  }
  // Einschlaege leicht **vor** der Innenflaeche (Richtung Aussen-Cover), damit sie nicht
  // hinter der Innen-Papierflaeche verschwinden; Koordinaten im Deckel-Lokalsystem.
  const zTurnInFrontLocal = -boardThicknessMM * 0.5 * MM_TO_M + 0.000035;
  addTurnIns(
    frontBoard,
    boardWidthMM,
    boardHeightMM,
    turnInBleedMM,
    zTurnInFrontLocal,
    materials.frontTurnIn,
  );

  const backPivot = new THREE.Group();
  backPivot.position.x = coverXShiftMM * MM_TO_M;
  let backBoard = createBoardMesh(
    coverSize,
    bevelRadiusMM * MM_TO_M,
    materials.backOuter,
    materials.innerFace,
    materials.edgeWrap,
    {
      centerX: falzChannelCenterXMM * MM_TO_M,
      width: falzWidthMM * MM_TO_M,
      depth: falzDepthMM * MM_TO_M,
      radius: falzRadiusMM * MM_TO_M,
      outerSideSign: -1,
    },
    sheetUV.back,
  );
  if (materials.sheetActive && !(backBoard instanceof THREE.Group)) {
    const holder = new THREE.Group();
    holder.add(backBoard);
    backBoard = holder;
  }
  backBoard.position.z = -(spineCoreWidthMM * 0.5 + boardThicknessMM * 0.5) * MM_TO_M;
  backBoard.name = "BackBoard";
  backPivot.add(backBoard);
  if (materials.sheetActive) {
    addCoverBoardEdgeStripsFromSheet(backBoard, materials.backOuter, {
      variant: "back",
      halfWm: coverSize.width * 0.5,
      halfHm: coverSize.height * 0.5,
      halfDm: coverSize.depth * 0.5,
      sheetW,
      sheetH,
      frontX1MM,
      frontX2MM,
      backX1MM,
      backX2MM,
      y1MM,
      y2MM,
      thicknessMm: boardThicknessMM,
    });
  }
  const zTurnInBackLocal = boardThicknessMM * 0.5 * MM_TO_M - 0.000035;
  addTurnIns(
    backBoard,
    boardWidthMM,
    boardHeightMM,
    turnInBleedMM,
    zTurnInBackLocal,
    materials.backTurnIn,
  );

  const textBlock = createTextBlock(
    textBlockWidthMM,
    textBlockHeightMM,
    spineCoreWidthMM,
    materials.innerFace?.map ?? null,
    options.textBlockStyle ?? {},
  );

  const spineEdgeMapping = materials.sheetActive
    ? {
      sheetWidthMM: sheetW,
      sheetHeightMM: sheetH,
      insertThicknessMM: spineInsertThicknessMM,
      boardThicknessMM,
      spineX1MM,
      spineX2MM,
      y1MM,
      y2MM,
    }
    : null;

  const spineBoard = createSpineMesh(
    spineBoardSize,
    materials.spineOuter,
    materials.innerFace,
    materials.edgeWrap,
    sheetUV.spine,
    // Der bedruckte Rückenbereich soll exakt dem ausgeschnittenen
    // Spine-Rechteck aus dem Druckbogen entsprechen (Rueckeneinlage).
    Math.max(0.1, spineX2MM - spineX1MM) * MM_TO_M,
    spineEdgeMapping,
  );
  // Innenkante Rückeneinlage (+X der Einlage) soll bei gap=0 exakt auf textBlockLeftXMM liegen.
  const spineInnerFaceXMM = textBlockLeftXMM - spineToBlockGapMM;
  spineBoard.position.x = (spineInnerFaceXMM - spineInsertThicknessMM * 0.5) * MM_TO_M;
  spineBoard.name = "SpineBoard";

  group.userData.hingeZoneMM = hingeZoneMM;
  // Orbit-/Kamera-Blickpunkt: Block liegt bei X=0; Bounding-Box der Zusatzmeshes
  // (Ruecken, Einschlag) verschiebt den reinen Box3-Schwerpunkt nach links, sodass
  // das Buch im Viewport oft zu weit rechts wirkt. Zusaetzlich liegt die
  // sichtbare Covermitte durch den einseitigen Ueberstand leicht bei +X.
  // Framing daher explizit auf die visuelle Buchmitte setzen.
  group.userData.framingCenterWorld = new THREE.Vector3(
    coverXShiftMM * MM_TO_M,
    0,
    0,
  );

  group.add(spineBoard);
  group.add(frontPivot);
  group.add(backPivot);
  group.add(textBlock);

  group.position.x = 0;
  group.position.y = 0;
  group.position.z = 0;

  return group;
}

// ---------------------------------------------------------------------------
// Buchdeckel inkl. echter U-Nut (ExtrudeGeometry aus 2D-Querschnitt).
// ---------------------------------------------------------------------------

function createBoardMesh(size, bevelRadius, outerMaterial, innerMaterial, edgeMaterial, groove = null, uvRect = FULL_UV_RECT) {
  const outerSideSign = groove?.outerSideSign ?? 1;
  const rawDepth = groove?.depth ?? 0;
  const rawWidth = groove?.width ?? 0;
  const rawRadius = groove?.radius ?? 0;
  const grooveDepth = THREE.MathUtils.clamp(rawDepth, 0, size.depth * 0.85);
  const grooveWidth = THREE.MathUtils.clamp(rawWidth, 0, size.width * 0.9);
  const grooveRadius = THREE.MathUtils.clamp(
    rawRadius,
    0.00005,
    Math.min(grooveDepth, grooveWidth * 0.5),
  );
  const grooveCenterX = groove?.centerX ?? 0;

  // Fallback: ohne Nut bleibt die ursprüngliche gerundete Box.
  if (grooveDepth < 0.00005 || grooveWidth < 0.00005) {
    const geometry = new RoundedBoxGeometry(size.width, size.height, size.depth, 3, bevelRadius);
    return new THREE.Mesh(
      geometry,
      faceMaterialsForBoard(outerSideSign, outerMaterial, innerMaterial, edgeMaterial),
    );
  }

  const boardGroup = new THREE.Group();

  const halfW = size.width * 0.5;
  const halfD = size.depth * 0.5;
  const gx1 = grooveCenterX - grooveWidth * 0.5;
  const gx2 = grooveCenterX + grooveWidth * 0.5;

  // 1) Buchdeckel-Körper = extrudierter Querschnitt mit sauberer U-Kontur.
  //    Wird in dunklem Kantenmaterial gerendert; die Außenhaut deckt den
  //    sichtbaren Außenbereich später komplett ab.
  const crossSection = buildBoardCrossSection({
    halfW,
    halfD,
    gx1,
    gx2,
    grooveDepth,
    grooveRadius,
    outerSideSign,
  });
  const bodyGeom = new THREE.ExtrudeGeometry(crossSection, {
    depth: size.height,
    bevelEnabled: false,
    curveSegments: 48,
    steps: 1,
  });
  bodyGeom.translate(0, 0, -size.height * 0.5);
  bodyGeom.rotateX(-Math.PI * 0.5);
  bodyGeom.computeVertexNormals();

  const body = new THREE.Mesh(bodyGeom, edgeMaterial);
  body.name = "BoardBody";
  boardGroup.add(body);

  // 2) Außenhaut = durchgehende Bezugsmembran, die der Außenkontur folgt
  //    (inkl. Falz). UVs per X-Projektion -> Covermotiv fließt ohne
  //    Unterbrechung über die gesamte Fläche und zieht sich in die Nut.
  const skinGeom = buildOuterCoverSkin(size, {
    gx1,
    gx2,
    grooveDepth,
    grooveRadius,
    outerSideSign,
    arcSegments: 48,
    uvRect,
  });
  const skinMesh = new THREE.Mesh(skinGeom, outerMaterial);
  skinMesh.name = "CoverSkin";
  boardGroup.add(skinMesh);

  // 3) Innenseite (Papier / neutrale Fläche).
  const innerZ = outerSideSign > 0 ? -halfD - 0.00008 : halfD + 0.00008;
  const innerGeom = new THREE.PlaneGeometry(size.width, size.height);
  const innerMesh = new THREE.Mesh(innerGeom, innerMaterial);
  innerMesh.position.z = innerZ;
  if (outerSideSign > 0) {
    innerMesh.rotation.y = Math.PI;
  }
  boardGroup.add(innerMesh);

  return boardGroup;
}

function buildBoardCrossSection({ halfW, halfD, gx1, gx2, grooveDepth, grooveRadius, outerSideSign }) {
  const shape = new THREE.Shape();
  const d = grooveDepth;
  const r = grooveRadius;

  if (outerSideSign > 0) {
    // Außenfläche unten (-Y in 2D), Nut geht nach oben (+Y) ins Material.
    shape.moveTo(-halfW, -halfD);
    shape.lineTo(gx1, -halfD);
    shape.absarc(gx1 + r, -halfD, r, Math.PI, Math.PI * 0.5, true);
    if (d > r + 0.00002) {
      shape.lineTo(gx1 + r, -halfD + d);
      shape.lineTo(gx2 - r, -halfD + d);
      shape.lineTo(gx2 - r, -halfD + r);
    } else {
      shape.lineTo(gx2 - r, -halfD + r);
    }
    shape.absarc(gx2 - r, -halfD, r, Math.PI * 0.5, 0, true);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();
  } else {
    // Außenfläche oben (+Y in 2D), Nut geht nach unten (-Y) ins Material.
    shape.moveTo(halfW, halfD);
    shape.lineTo(gx2, halfD);
    shape.absarc(gx2 - r, halfD, r, 0, -Math.PI * 0.5, true);
    if (d > r + 0.00002) {
      shape.lineTo(gx2 - r, halfD - d);
      shape.lineTo(gx1 + r, halfD - d);
      shape.lineTo(gx1 + r, halfD - r);
    } else {
      shape.lineTo(gx1 + r, halfD - r);
    }
    shape.absarc(gx1 + r, halfD, r, -Math.PI * 0.5, -Math.PI, true);
    shape.lineTo(-halfW, halfD);
    shape.lineTo(-halfW, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.closePath();
  }
  return shape;
}

// Durchgehende Bezugsmembran entlang der Außenkontur. Folgt exakt der
// U-Kurve des Deckelquerschnitts. UV.u ist die X-Position (Projektion
// "von oben" aufs Cover), UV.v ist die Buchhöhe. Dadurch mappt das
// vollflächige Covermotiv ohne Unterbrechung über Schulter, Falzflanken
// und Falzboden.
function buildOuterCoverSkin(size, { gx1, gx2, grooveDepth, grooveRadius, outerSideSign, arcSegments = 32, uvRect = FULL_UV_RECT }) {
  const halfW = size.width * 0.5;
  const halfH = size.height * 0.5;
  const halfD = size.depth * 0.5;
  const s = outerSideSign;
  const outerZ = s * halfD;
  const grooveFloorZ = s * (halfD - grooveDepth);
  const r = grooveRadius;
  const d = grooveDepth;
  // Minimaler Versatz nach außen gegen Z-Fighting mit dem Body.
  const zLift = s * 0.00008;
  const uStart = uvRect.uStart;
  const uEnd = uvRect.uEnd;
  const vStart = uvRect.vStart;
  const vEnd = uvRect.vEnd;

  // 2D-Pfad in (x, z). Startet links außen, geht über die Falz nach rechts außen.
  const path = [];
  path.push({ x: -halfW, z: outerZ });
  if (gx1 > -halfW + 0.00001) {
    path.push({ x: gx1, z: outerZ });
  }

  // Linke Rundung: Zentrum (gx1 + r, outerZ), Winkel pi -> pi/2.
  for (let i = 1; i <= arcSegments; i++) {
    const angle = Math.PI - (i / arcSegments) * Math.PI * 0.5;
    const px = (gx1 + r) + r * Math.cos(angle);
    const pz = outerZ - s * r * Math.sin(angle);
    path.push({ x: px, z: pz });
  }

  // Flacher Falzboden, falls Tiefe > Radius.
  if (d > r + 0.00002) {
    path.push({ x: gx1 + r, z: grooveFloorZ });
    path.push({ x: gx2 - r, z: grooveFloorZ });
    path.push({ x: gx2 - r, z: outerZ - s * r });
  }

  // Rechte Rundung: Zentrum (gx2 - r, outerZ), Winkel pi/2 -> 0.
  for (let i = 1; i <= arcSegments; i++) {
    const angle = Math.PI * 0.5 - (i / arcSegments) * Math.PI * 0.5;
    const px = (gx2 - r) + r * Math.cos(angle);
    const pz = outerZ - s * r * Math.sin(angle);
    path.push({ x: px, z: pz });
  }

  if (gx2 < halfW - 0.00001) {
    path.push({ x: halfW, z: outerZ });
  }

  // Ribbon extrudieren entlang Y (Buchhöhe).
  const count = path.length;
  const positions = new Float32Array(count * 6);
  const uvs = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = path[i];
    positions[i * 6 + 0] = p.x;
    positions[i * 6 + 1] = -halfH;
    positions[i * 6 + 2] = p.z + zLift;
    positions[i * 6 + 3] = p.x;
    positions[i * 6 + 4] = halfH;
    positions[i * 6 + 5] = p.z + zLift;
    // U nach X-Projektion, dann ins aktuelle Druckbogen-Rechteck gemappt.
    // Vorderdeckel: +X (weg vom Rücken) liegt auf dem rechten Ende des U1-Rechtecks.
    // Rückdeckel: -X (weg vom Rücken) liegt auf dem linken Ende des U4-Rechtecks.
    const t = s > 0 ? (p.x + halfW) / size.width : (halfW - p.x) / size.width;
    const u = uStart + t * (uEnd - uStart);
    uvs[i * 4 + 0] = u;
    uvs[i * 4 + 1] = vStart;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = vEnd;
  }

  const indices = [];
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2 + 1;
    const dv = (i + 1) * 2;
    if (s > 0) {
      indices.push(a, dv, b, b, dv, c);
    } else {
      indices.push(a, b, dv, b, c, dv);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function clamp01mmToU(Wmm, mm) {
  return THREE.MathUtils.clamp(mm / Math.max(0.001, Wmm), 0, 1);
}

function clamp01mmToV(Hmm, mm) {
  return THREE.MathUtils.clamp(mm / Math.max(0.001, Hmm), 0, 1);
}

/** YZ-Flaeche bei festem x; u laeuft mit Z, v mit Y. normalXSign +1/-1. */
function buildBoardEdgeYZAtX(xPlane, halfH, halfD, normalXSign, uAtNegZ, uAtPosZ, vLo, vHi) {
  const x = xPlane;
  const positions = new Float32Array([
    x, -halfH, -halfD,
    x, halfH, -halfD,
    x, halfH, halfD,
    x, -halfH, halfD,
  ]);
  const uvs = new Float32Array([
    uAtNegZ, vLo,
    uAtNegZ, vHi,
    uAtPosZ, vHi,
    uAtPosZ, vLo,
  ]);
  const indices = normalXSign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** XZ-Flaeche bei festem y; u laeuft mit X, v mit Z. normalYSign +1/-1. */
function buildBoardEdgeXZAtY(yPlane, halfW, halfD, normalYSign, uLo, uHi, vLo, vHi) {
  const y = yPlane;
  const positions = new Float32Array([
    -halfW, y, -halfD,
    halfW, y, -halfD,
    halfW, y, halfD,
    -halfW, y, halfD,
  ]);
  const uvs = new Float32Array([
    uLo, vLo,
    uHi, vLo,
    uHi, vHi,
    uLo, vHi,
  ]);
  const indices = normalYSign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Pappdeckel: vier Kantenstreifen aus dem Bogen (Pappendicke t).
 * Front: Falz -X [fx1-t, fx1], Schnitt +X [fx2, fx2+t], Kopf/Fuss v.
 * Back: Schnitt -X [bx1-t, bx1], Falz +X [bx2, bx2+t].
 */
function addCoverBoardEdgeStripsFromSheet(board, outerMaterial, o) {
  if (!outerMaterial?.map) {
    return;
  }
  // Eigenes Material: polygonOffset verhindert Z-Fighting mit RoundedBox-+Y
  // (dort edgeWrap); gleiche Textur-Referenz wie der Deckel.
  const stripMaterial = outerMaterial.clone();
  stripMaterial.polygonOffset = true;
  stripMaterial.polygonOffsetFactor = -4;
  stripMaterial.polygonOffsetUnits = -4;
  // Die Kantenstreifen sind duenne Planes. Bei FrontSide-only verschwinden
  // sie je nach Kamerawinkel (Backface-Culling) und die dunkle Pappe scheint durch.
  stripMaterial.side = THREE.DoubleSide;
  stripMaterial.depthWrite = true;

  const {
    variant,
    halfWm,
    halfHm,
    halfDm,
    sheetW,
    sheetH,
    frontX1MM: fx1,
    frontX2MM: fx2,
    backX1MM: bx1,
    backX2MM: bx2,
    y1MM,
    y2MM,
    thicknessMm,
  } = o;
  const W = Math.max(0.001, sheetW);
  const H = Math.max(0.001, sheetH);
  const t = Math.max(0.0001, thicknessMm);
  // Mikro-Offset gegen moegliches Z-Fighting; zuvor 0.0009 m (=0.9 mm)
  // liess die 2-mm-Kantenstreifen sichtbar vor der Pappe schweben.
  const pe = 0.00003;
  const vLo = clamp01mmToV(H, y1MM);
  const vHi = clamp01mmToV(H, y2MM);

  const addMesh = (geom) => {
    const m = new THREE.Mesh(geom, stripMaterial);
    m.name = "CoverBoardEdgeStrip";
    m.renderOrder = 15;
    board.add(m);
  };

  if (variant === "front") {
    const uForeIn = clamp01mmToU(W, fx2);
    const uForeOut = clamp01mmToU(W, fx2 + t);
    const uHinIn = clamp01mmToU(W, fx1 - t);
    const uHinOut = clamp01mmToU(W, fx1);
    addMesh(buildBoardEdgeYZAtX(halfWm + pe, halfHm, halfDm, 1, uForeIn, uForeOut, vLo, vHi));
    addMesh(buildBoardEdgeYZAtX(-(halfWm + pe), halfHm, halfDm, -1, uHinIn, uHinOut, vLo, vHi));
    const uXL = clamp01mmToU(W, fx1);
    const uXR = clamp01mmToU(W, fx2);
    const vTopLo = clamp01mmToV(H, y2MM);
    const vTopHi = clamp01mmToV(H, y2MM + t);
    const vBotLo = clamp01mmToV(H, y1MM - t);
    const vBotHi = clamp01mmToV(H, y1MM);
    addMesh(buildBoardEdgeXZAtY(halfHm + pe, halfWm, halfDm, 1, uXL, uXR, vTopLo, vTopHi));
    addMesh(buildBoardEdgeXZAtY(-(halfHm + pe), halfWm, halfDm, -1, uXL, uXR, vBotLo, vBotHi));
  } else {
    const uForeIn = clamp01mmToU(W, bx1 - t);
    const uForeOut = clamp01mmToU(W, bx1);
    // Falz +X: wie Front Falz -X — letzte Pappendicke **auf** dem Back-Rechteck, nicht im Spine.
    const uHinIn = clamp01mmToU(W, bx2 - t);
    const uHinOut = clamp01mmToU(W, bx2);
    addMesh(buildBoardEdgeYZAtX(-(halfWm + pe), halfHm, halfDm, -1, uForeIn, uForeOut, vLo, vHi));
    addMesh(buildBoardEdgeYZAtX(halfWm + pe, halfHm, halfDm, 1, uHinIn, uHinOut, vLo, vHi));
    const uXL = clamp01mmToU(W, bx1);
    const uXR = clamp01mmToU(W, bx2);
    const vTopLo = clamp01mmToV(H, y2MM);
    const vTopHi = clamp01mmToV(H, y2MM + t);
    const vBotLo = clamp01mmToV(H, y1MM - t);
    const vBotHi = clamp01mmToV(H, y1MM);
    // Rueckdeckel: Aussenseite liegt bei -Z (siehe outerSideSign -1). vLo sitzt auf z=-halfD,
    // vHi auf z=+halfD — daher v zur Vorderseite spiegeln, sonst Kopf/Fuss falsch aus dem Bogen.
    addMesh(buildBoardEdgeXZAtY(halfHm + pe, halfWm, halfDm, 1, uXL, uXR, vTopHi, vTopLo));
    addMesh(buildBoardEdgeXZAtY(-(halfHm + pe), halfWm, halfDm, -1, uXL, uXR, vBotHi, vBotLo));
  }
}

/** Rueckeneinlage Kopf/Fuss: u entlang Spinebreite, v um Pappendicke. */
function buildSpineCapStripXZAtY({
  halfInsertM,
  halfZM,
  yPlane,
  uSpineL,
  uSpineR,
  vStripLo,
  vStripHi,
  normalY,
}) {
  const y = yPlane;
  const positions = new Float32Array([
    -halfInsertM, y, -halfZM,
    halfInsertM, y, -halfZM,
    halfInsertM, y, halfZM,
    -halfInsertM, y, halfZM,
  ]);
  const uvs = new Float32Array([
    uSpineL, vStripLo,
    uSpineL, vStripHi,
    uSpineR, vStripHi,
    uSpineR, vStripLo,
  ]);
  const indices = normalY > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Duenne Streifen auf den Flächen +/-Z der Rueckeneinlage (Spinekarton-
 * Kanten). UV: aus dem PNG wie angefordert — links [spineX1, spineX1+t],
 * rechts [spineX2-t, spineX2], gleiche v wie Hauptspine (y1..y2).
 */
function buildSpineLateralStripGeometry({
  halfInsertM,
  halfHM,
  zM,
  uAtNegXM,
  uAtPosXM,
  vStart,
  vEnd,
  normalZ,
}) {
  const z = zM;
  const positions = new Float32Array([
    -halfInsertM, -halfHM, z,
    halfInsertM, -halfHM, z,
    halfInsertM, halfHM, z,
    -halfInsertM, halfHM, z,
  ]);
  const uvs = new Float32Array([
    uAtNegXM, vStart,
    uAtPosXM, vStart,
    uAtPosXM, vEnd,
    uAtNegXM, vEnd,
  ]);
  const indices = normalZ < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createSpineMesh(
  size,
  outerMaterial,
  innerMaterial,
  edgeMaterial,
  uvRect = FULL_UV_RECT,
  visibleOuterDepth = size.depth,
  spineEdgeMapping = null,
) {
  const group = new THREE.Group();
  group.name = "Spine";

  // Grundkörper: dunkles Kantenmaterial auf allen Flächen, wird größtenteils
  // von der Außenhaut verdeckt.
  const bodyGeom = new RoundedBoxGeometry(
    size.width,
    size.height,
    size.depth,
    3,
    Math.min(size.depth * 0.11, 0.0006),
  );
  // Three Box/RoundedBox: +X,-X,+Y,-Y,+Z,-Z. Rueckeneinlage: +X zeigt zum Buchblock
  // (Innenkante); -X liegt unter der Aussenhaut. +/-Z sind die schmalen Kanten
  // zu Rueck-/Vorderdeckel — dort darf NICHT innerMaterial (Papier) sitzen, sonst
  // Streifen neben den bedruckten Spine-Kantenstreifen.
  const bodyMaterials = [
    innerMaterial,
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
  ];
  const body = new THREE.Mesh(bodyGeom, bodyMaterials);
  body.name = "SpineBody";
  group.add(body);

  // Außenhaut des Rückens: flaches Panel mit zugeschnittenen UVs auf dem
  // Spine-Ausschnitt des Druckbogens (bzw. voller Bereich im Legacy-Modus).
  const skinGeom = buildSpineOuterSkin(size, uvRect, visibleOuterDepth);
  const skin = new THREE.Mesh(skinGeom, outerMaterial);
  skin.name = "SpineSkin";
  group.add(skin);

  if (spineEdgeMapping && outerMaterial?.map) {
    const W = Math.max(0.001, spineEdgeMapping.sheetWidthMM);
    const H = Math.max(0.001, spineEdgeMapping.sheetHeightMM);
    const x1 = spineEdgeMapping.spineX1MM;
    const x2 = spineEdgeMapping.spineX2MM;
    const y1 = spineEdgeMapping.y1MM;
    const y2 = spineEdgeMapping.y2MM;

    const halfInsert = size.width * 0.5;
    const halfH = size.height * 0.5;
    const halfZ = size.depth * 0.5;
    // Mikro-Offset gegen Z-Fighting; 0.1 mm war an der Fuge sichtbar.
    const zEps = 0.000015;

    const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
    const vStart = clamp01(y1 / H);
    const vEnd = clamp01(y2 / H);

    // Eine Spine-Flaeche im PNG: [spineX1, spineX2] x [y1, y2] (wie uvRect / SpineSkin).
    const uSpL = clamp01(x1 / W);
    const uSpR = clamp01(x2 / W);
    const spineEdgeMaterial = outerMaterial.clone();
    spineEdgeMaterial.side = THREE.DoubleSide;
    spineEdgeMaterial.depthWrite = true;
    spineEdgeMaterial.polygonOffset = true;
    spineEdgeMaterial.polygonOffsetFactor = -3;
    spineEdgeMaterial.polygonOffsetUnits = -3;

    // Lange schmale Kanten +/-Z: physische Breite = Einlagedicke, aber im PNG darf
    // nicht nur 1 mm in U gestreckt werden (Streifen/Moire). U muss mit der **Kante**
    // der grossen Spine-Flaeche uebereinstimmen: Rueckseite (-Z) = linker Bogenrand
    // uSpL, Vorderseite (+Z) = rechter Rand uSpR (wie buildSpineOuterSkin an z=+/-).
    const geomBack = buildSpineLateralStripGeometry({
      halfInsertM: halfInsert,
      halfHM: halfH,
      zM: -halfZ - zEps,
      uAtNegXM: uSpL,
      uAtPosXM: uSpL,
      vStart,
      vEnd,
      normalZ: -1,
    });
    const meshBack = new THREE.Mesh(geomBack, spineEdgeMaterial);
    meshBack.name = "SpineEdgeSkinBack";
    meshBack.renderOrder = 16;
    group.add(meshBack);

    const geomFront = buildSpineLateralStripGeometry({
      halfInsertM: halfInsert,
      halfHM: halfH,
      zM: halfZ + zEps,
      uAtNegXM: uSpR,
      uAtPosXM: uSpR,
      vStart,
      vEnd,
      normalZ: 1,
    });
    const meshFront = new THREE.Mesh(geomFront, spineEdgeMaterial);
    meshFront.name = "SpineEdgeSkinFront";
    meshFront.renderOrder = 16;
    group.add(meshFront);

    // Kopf/Fuss: schmale Bogen-Streifen in v mit **Rueckeneinlage**-Dicke (t), nicht Pappdeckel.
    const capMm = Math.max(0.0001, spineEdgeMapping.insertThicknessMM);
    const vTopLo = clamp01(y2 / H);
    const vTopHi = clamp01((y2 + capMm) / H);
    const vBotLo = clamp01((y1 - capMm) / H);
    const vBotHi = clamp01(y1 / H);
    // Gleiches fuer Kopf/Fuss-Streifen.
    const yEps = 0.000015;

    const geomTop = buildSpineCapStripXZAtY({
      halfInsertM: halfInsert,
      halfZM: halfZ,
      yPlane: halfH + yEps,
      uSpineL: uSpL,
      uSpineR: uSpR,
      vStripLo: vTopLo,
      vStripHi: vTopHi,
      normalY: 1,
    });
    const meshTop = new THREE.Mesh(geomTop, spineEdgeMaterial);
    meshTop.name = "SpineEdgeSkinTop";
    meshTop.renderOrder = 16;
    group.add(meshTop);

    const geomBot = buildSpineCapStripXZAtY({
      halfInsertM: halfInsert,
      halfZM: halfZ,
      yPlane: -halfH - yEps,
      uSpineL: uSpL,
      uSpineR: uSpR,
      vStripLo: vBotLo,
      vStripHi: vBotHi,
      normalY: -1,
    });
    const meshBot = new THREE.Mesh(geomBot, spineEdgeMaterial);
    meshBot.name = "SpineEdgeSkinBottom";
    meshBot.renderOrder = 16;
    group.add(meshBot);
  }

  return group;
}

function buildSpineOuterSkin(size, uvRect, visibleDepth = size.depth) {
  // Das sichtbare Außenrund des Spines ist die -X Fläche.
  // Vom Betrachter bei -X: rechts = +Z (Front-Seite), links = -Z (Back-Seite).
  // UV u soll also bei z=-depth/2 den Back-Seiten-Wert (uStart) haben und
  // bei z=+depth/2 den Front-Seiten-Wert (uEnd).
  const halfH = size.height * 0.5;
  const clampedVisibleDepth = THREE.MathUtils.clamp(visibleDepth, 0.0001, size.depth);
  const halfVisibleD = clampedVisibleDepth * 0.5;
  // Sehr kleiner Offset fuer stabile Zeichnungsreihenfolge ohne sichtbare Fuge.
  const x = -size.width * 0.5 - 0.00002;

  const positions = new Float32Array([
    x, -halfH, -halfVisibleD,
    x, -halfH, halfVisibleD,
    x, halfH, halfVisibleD,
    x, halfH, -halfVisibleD,
  ]);
  const uvs = new Float32Array([
    uvRect.uStart, uvRect.vStart,
    uvRect.uEnd, uvRect.vStart,
    uvRect.uEnd, uvRect.vEnd,
    uvRect.uStart, uvRect.vEnd,
  ]);
  // Windung so, dass die Frontface-Normale in -X zeigt (nach außen zur
  // Buchrücken-Aussenseite). Vorher zeigte +X -> Backface-Culling, nur
  // dunkler RoundedBox-Koerper sichtbar.
  const indices = [0, 2, 3, 0, 1, 2];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createTextBlock(widthMM, heightMM, depthMM, paperFaceTexture = null, style = {}) {
  const geometry = new RoundedBoxGeometry(
    widthMM * MM_TO_M,
    heightMM * MM_TO_M,
    Math.max(depthMM - 0.12, 1) * MM_TO_M,
    2,
    0.0002,
  );

  const edgeTextures = getPaperEdgeTextures();
  const pageFaceColorMap = paperFaceTexture ?? edgeTextures.capColor;
  const lineStrength = THREE.MathUtils.clamp(style.lineStrength ?? 0.88, 0, 1);
  const grainStrength = THREE.MathUtils.clamp(style.grainStrength ?? 0.78, 0, 1);
  const lineContrast = THREE.MathUtils.lerp(0.6, 2.4, lineStrength);
  const grainAmount = THREE.MathUtils.lerp(0.16, 1.05, grainStrength);
  // +X (Vorderschnitt): 90°-Variante mit separatem U-Repeat, damit die Lagen längs laufen.
  const foreRepeatU = THREE.MathUtils.lerp(0.035, 0.1, lineStrength);
  edgeTextures.foreColor.repeat.set(foreRepeatU, 1);
  edgeTextures.foreBump.repeat.set(foreRepeatU, 1);
  // +Y/-Y (Kopf/Fuß): Linien entlang Breite, Variation über die Blockdicke.
  const capRepeatY = THREE.MathUtils.lerp(0.02, 0.055, lineStrength);
  edgeTextures.capColor.repeat.set(1, capRepeatY);
  edgeTextures.capBump.repeat.set(1, capRepeatY);
  const foreColor = new THREE.Color(0xf9f9f7).lerp(new THREE.Color(0xe6e6e1), lineStrength);
  const topBottomColor = new THREE.Color(0xf7f7f5).lerp(new THREE.Color(0xe2e2dd), lineStrength * 0.9);
  const spineColor = new THREE.Color(0xf1f1ef).lerp(new THREE.Color(0xdcdcd6), lineStrength * 0.75);
  const pageColor = new THREE.Color(0xfcfcfa).lerp(new THREE.Color(0xf0f0eb), grainStrength * 0.4);

  // Box-Materialreihenfolge: +X, -X, +Y, -Y, +Z, -Z.
  const materials = [
    new THREE.MeshStandardMaterial({
      color: foreColor,
      roughness: 0.8,
      metalness: 0.0,
      map: edgeTextures.foreColor,
      roughnessMap: edgeTextures.foreBump,
      bumpMap: edgeTextures.foreBump,
      bumpScale: 0.012 + 0.06 * lineContrast + 0.015 * grainAmount,
    }),
    new THREE.MeshStandardMaterial({
      color: spineColor,
      roughness: 0.95,
      metalness: 0.0,
      roughnessMap: edgeTextures.capBump,
      bumpMap: edgeTextures.capBump,
      bumpScale: 0.004 + 0.012 * lineContrast + 0.012 * grainAmount,
    }),
    new THREE.MeshStandardMaterial({
      color: topBottomColor,
      roughness: 0.84,
      metalness: 0.0,
      map: edgeTextures.capColor,
      roughnessMap: edgeTextures.capBump,
      bumpMap: edgeTextures.capBump,
      bumpScale: 0.008 + 0.03 * lineContrast + 0.012 * grainAmount,
    }),
    new THREE.MeshStandardMaterial({
      color: topBottomColor.clone(),
      roughness: 0.84,
      metalness: 0.0,
      map: edgeTextures.capColor,
      roughnessMap: edgeTextures.capBump,
      bumpMap: edgeTextures.capBump,
      bumpScale: 0.008 + 0.03 * lineContrast + 0.012 * grainAmount,
    }),
    new THREE.MeshStandardMaterial({
      color: pageColor,
      roughness: 0.88,
      metalness: 0.0,
      map: pageFaceColorMap,
      roughnessMap: edgeTextures.capBump,
      bumpMap: edgeTextures.capBump,
      bumpScale: 0.003 + 0.01 * grainAmount,
    }),
    new THREE.MeshStandardMaterial({
      color: pageColor.clone(),
      roughness: 0.88,
      metalness: 0.0,
      map: pageFaceColorMap,
      roughnessMap: edgeTextures.capBump,
      bumpMap: edgeTextures.capBump,
      bumpScale: 0.003 + 0.01 * grainAmount,
    }),
  ];

  return new THREE.Mesh(geometry, materials);
}

function faceMaterialsForBoard(outerSideSign, outerMaterial, innerMaterial, edgeMaterial) {
  const plusZ = outerSideSign > 0 ? outerMaterial : innerMaterial;
  const minusZ = outerSideSign > 0 ? innerMaterial : outerMaterial;
  return [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, plusZ, minusZ];
}

/**
 * Einschlaege in **Deckel-Lokalkoordinaten** (Deckel-Mitte = 0,0,0).
 * @param {THREE.Object3D} parentBoard Deckel-Group oder -Mesh
 * @param {number} zLocalM z der Flaeche leicht zur Buchmitte versetzt (Front: negativ, Rueck: positiv)
 */
function addTurnIns(parentBoard, outerWidthMM, outerHeightMM, bleedMM, zLocalM, turnInMats) {
  const innerWidthMM = Math.max(outerWidthMM - bleedMM * 2, 1);
  const innerHeightMM = Math.max(outerHeightMM - bleedMM * 2, 1);

  const top = createTurnInPlane(innerWidthMM, bleedMM, turnInMats.top);
  top.position.set(0, (outerHeightMM * 0.5 - bleedMM * 0.5) * MM_TO_M, zLocalM);
  parentBoard.add(top);

  const bottom = createTurnInPlane(innerWidthMM, bleedMM, turnInMats.bottom);
  bottom.position.set(0, -(outerHeightMM * 0.5 - bleedMM * 0.5) * MM_TO_M, zLocalM);
  parentBoard.add(bottom);

  const left = createTurnInPlane(bleedMM, innerHeightMM, turnInMats.left);
  left.position.set(-(outerWidthMM * 0.5 - bleedMM * 0.5) * MM_TO_M, 0, zLocalM);
  parentBoard.add(left);

  const right = createTurnInPlane(bleedMM, innerHeightMM, turnInMats.right);
  right.position.set((outerWidthMM * 0.5 - bleedMM * 0.5) * MM_TO_M, 0, zLocalM);
  parentBoard.add(right);
}

function createTurnInPlane(widthMM, heightMM, material) {
  const geometry = new THREE.PlaneGeometry(widthMM * MM_TO_M, heightMM * MM_TO_M);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = Math.PI;
  mesh.renderOrder = 12;
  mesh.frustumCulled = false;
  return mesh;
}
