export function createPrintTemplateDimensions(params) {
  const overhangMM = params.overhangMM ?? params.bleedMM ?? 2.5;
  const boardThicknessMM = Math.max(0.5, params.boardThicknessMM ?? 2);
  const blockThicknessMM = params.blockThicknessMM ?? 10;
  const outerWidthMM = params.coverWidthMM ?? (params.bookWidthMM + overhangMM);
  const outerHeightMM = params.coverHeightMM ?? (params.bookHeightMM + overhangMM * 2);
  const spineWidthMM = params.spineOuterWidthMM ?? (blockThicknessMM + boardThicknessMM * 2);

  const sheetW = params.sheetWidthMM ?? 488;
  const sheetH = params.sheetHeightMM ?? 330;
  const insertTh = Math.max(0.1, params.spineInsertThicknessMM ?? 1);
  const halfInsertAndCoreMM = blockThicknessMM * 0.5 + insertTh * 0.5;
  const frontX1MM = params.frontX1MM ?? sheetW * 0.5 + halfInsertAndCoreMM;
  const frontX2MM = params.frontX2MM ?? frontX1MM + outerWidthMM;
  const backX2MM = params.backX2MM ?? sheetW * 0.5 - halfInsertAndCoreMM;
  const backX1MM = params.backX1MM ?? backX2MM - outerWidthMM;
  const y1MM = params.y1MM ?? (sheetH - outerHeightMM) * 0.5;
  const y2MM = params.y2MM ?? y1MM + outerHeightMM;

  return {
    outerWidthMM,
    outerHeightMM,
    bleedMM: overhangMM,
    spineWidthMM,
    // Klassisches Drucklayout von links nach rechts: Back -> Spine -> Front
    flatTemplateWidthMM: outerWidthMM * 2 + spineWidthMM,
    flatTemplateHeightMM: outerHeightMM,
    /** Absolut-mm-Rechtecke auf dem Druckbogen fuer Turn-In-Streifen (Einschlag). */
    sheetTurnInLayout: {
      sheetWidthMM: sheetW,
      sheetHeightMM: sheetH,
      frontX1MM,
      frontX2MM,
      backX1MM,
      backX2MM,
      y1MM,
      y2MM,
      bleedMM: overhangMM,
    },
  };
}

export function uvRangeForSpine(template) {
  const total = template.flatTemplateWidthMM;
  const spineStart = template.outerWidthMM / total;
  const spineEnd = (template.outerWidthMM + template.spineWidthMM) / total;
  return { uMin: spineStart, uMax: spineEnd };
}
