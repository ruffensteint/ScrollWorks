import type { CarvingDocument, OrnamentShape, ScrollDesign } from "../types";
import { COMMA_LEAF, instantiateMotif, LONG_ACANTHUS_LEAF } from "./motifTemplates";

export function generateMotifStudy(document: CarvingDocument): ScrollDesign {
  const usableHeight = Math.max(1, document.height - document.margin * 2);
  const centerX = document.width * 0.5;
  const motifScale = usableHeight * document.settings.leafScale;
  const ornaments: OrnamentShape[] = [];

  // This is an anatomy proofing sheet, not a composition. Keeping the two
  // traced leaves separate makes silhouette defects impossible to hide behind
  // overlaps or a decorative stem.
  ornaments.push(...instantiateMotif(COMMA_LEAF, {
    id: "study-comma-leaf",
    origin: {
      x: centerX - usableHeight * 0.41,
      y: document.height * 0.34,
    },
    angle: -0.08,
    length: motifScale * 1.00,
    width: motifScale * 0.80,
  }));
  ornaments.push(...instantiateMotif(LONG_ACANTHUS_LEAF, {
    id: "study-long-acanthus-leaf",
    origin: {
      x: centerX - usableHeight * 0.41,
      y: document.height * 0.72,
    },
    angle: -0.08,
    length: motifScale * 1.18,
    width: motifScale * 0.64,
  }));

  return { paths: [], ornaments };
}
