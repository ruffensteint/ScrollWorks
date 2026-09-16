import { describe, expect, it } from "vitest";
import { generateScrollDesign } from "./scroll";
import { generateMotifStudy } from "./motifStudy";
import { generateFormulaStudy } from "./formulaStudy";
import { generateGoldenGrammarStudy, GOLDEN_RATIOS } from "./goldenGrammar";
import { generateVoluteStudy } from "./voluteStudy";

function approximatePolylineLength(points: { x: number; y: number }[]): number {
  return points.slice(1).reduce(
    (total, point, index) =>
      total + Math.hypot(point.x - points[index].x, point.y - points[index].y),
    0,
  );
}
import type { CarvingDocument } from "../types";

const document: CarvingDocument = {
  version: 1, units: "in", width: 24, height: 8, margin: 0.5, seed: 583214,
  backboneMode: "generated",
  backbonePoints: [],
  manualSecondaries: [],
  manualAcanthusFamilies: [],
  settings: {
    density: 0.5,
    curlIntensity: 1,
    backboneSweep: 0.55,
    crestPosition: 0.46,
    backboneReach: 0.74,
    terminalHeight: 0.52,
    customSmoothing: 0.55,
    customFidelity: 0.7,
    customStrength: 1,
    customScaleX: 1,
    customScaleY: 1,
    customTerminal: "preserve",
    symmetrySpacing: 0.08,
    symmetryCenterX: 0.5,
    symmetryCenter: 0.5,
    secondaryLength: 0.36,
    secondaryCurl: 0.75,
    secondaryVariation: 0.45,
    secondaryHierarchyLevels: 2,
    secondaryChildAngle: 65,
    secondaryChildLooseness: 1.35,
    stemWidth: 0.032,
    leafScale: 0.52,
    leafFrequency: 0.4,
    leafClusterComplexity: 0.85,
    leafLobes: 1,
    leafHook: 0.65,
    leafArc: 0.72,
    leafBelly: 0.78,
    leafLobeDepth: 0.58,
    leafVariation: 0.35,
    leafTierFan: 0.4,
    leafBend: 0.75,
    leafPocketDepth: 0.5,
    studySpiralTurns: 1.1,
    studyLeafFamilies: 3,
    studyInsideBalance: 0.55,
    symmetry: "none",
  },
};

function samplePathYValues(curves: ReturnType<typeof generateScrollDesign>["paths"][number]["curves"]): number[] {
  return curves.flatMap((curve) => Array.from({ length: 51 }, (_, step) => {
    const t = step / 50;
    const inverse = 1 - t;
    return inverse ** 3 * curve.start.y + 3 * inverse ** 2 * t * curve.control1.y + 3 * inverse * t ** 2 * curve.control2.y + t ** 3 * curve.end.y;
  }));
}

function approximatePathLength(curves: ReturnType<typeof generateScrollDesign>["paths"][number]["curves"]): number {
  const points = curves.flatMap((curve, curveIndex) => Array.from({ length: 31 }, (_, step) => {
    if (curveIndex > 0 && step === 0) return undefined;
    const t = step / 30;
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * curve.start.x + 3 * inverse ** 2 * t * curve.control1.x + 3 * inverse * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
      y: inverse ** 3 * curve.start.y + 3 * inverse ** 2 * t * curve.control1.y + 3 * inverse * t ** 2 * curve.control2.y + t ** 3 * curve.end.y,
    };
  }).filter((point): point is { x: number; y: number } => point !== undefined));
  return points.slice(1).reduce((length, point, index) =>
    length + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

function pathBoundsDiagonal(curves: ReturnType<typeof generateScrollDesign>["paths"][number]["curves"]): number {
  const points = curves.flatMap((curve) => [curve.start, curve.control1, curve.control2, curve.end]);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function pathTurnDegrees(curves: ReturnType<typeof generateScrollDesign>["paths"][number]["curves"]): number {
  return curves.reduce((total, curve) => {
    const start = { x: curve.control1.x - curve.start.x, y: curve.control1.y - curve.start.y };
    const end = { x: curve.end.x - curve.control2.x, y: curve.end.y - curve.control2.y };
    const startLength = Math.hypot(start.x, start.y) || 1;
    const endLength = Math.hypot(end.x, end.y) || 1;
    const dot = (start.x * end.x + start.y * end.y) / (startLength * endLength);
    const cross = (start.x * end.y - start.y * end.x) / (startLength * endLength);
    return total + Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
  }, 0);
}

function firstCurveHeadingDegrees(curves: ReturnType<typeof generateScrollDesign>["paths"][number]["curves"]): number {
  const first = curves[0];
  const chord = { x: first.end.x - first.start.x, y: first.end.y - first.start.y };
  return Math.atan2(chord.y, chord.x) * 180 / Math.PI;
}

function angleDifferenceDegrees(first: number, second: number): number {
  return Math.abs(((second - first + 540) % 360) - 180);
}

describe("scroll generator", () => {
  it("builds the volute as one dominant mass with shared-origin structural leaves", () => {
    const volute = generateVoluteStudy(document);
    const ornaments = volute.ornaments ?? [];
    expect(ornaments.filter((shape) => shape.role === "stem-ribbon")).toHaveLength(1);
    expect(ornaments.map((shape) => shape.id)).toEqual(expect.arrayContaining([
      "volute-dominant-mass",
      "volute-c-cut",
      "volute-arch-cut",
      "volute-s-cut",
      "volute-negative-space-curl",
      "volute-leaf-100",
      "volute-leaf-66",
      "volute-leaf-33",
    ]));
    const leafRoots = ["volute-leaf-100", "volute-leaf-66", "volute-leaf-33"].map((id) =>
      ornaments.find((shape) => shape.id === id)!.points[0]
    );
    expect(leafRoots[1]).toEqual(leafRoots[0]);
    expect(leafRoots[2]).toEqual(leafRoots[0]);
  });

  it("constructs exact golden-ratio similarity scrolls and S-guided leaves", () => {
    const golden = generateGoldenGrammarStudy(document);
    const ornaments = golden.ornaments ?? [];
    const parent = ornaments.find((shape) => shape.id === "golden-guide-parent")!;
    expect(parent).toBeDefined();
    GOLDEN_RATIOS.slice(1).forEach((ratio, index) => {
      const child = ornaments.find((shape) => shape.id === `golden-guide-child-${index + 1}`)!;
      expect(child).toBeDefined();
      expect(approximatePolylineLength(child.points) / approximatePolylineLength(parent.points)).toBeCloseTo(ratio, 3);
    });
    expect(ornaments.some((shape) => shape.id === "golden-leaf-100")).toBe(true);
    expect(ornaments.filter((shape) => shape.id.startsWith("golden-leaf-") && !shape.id.endsWith("-rib"))).toHaveLength(3);
  });

  it("tapers golden ribbons and preserves a readable leaf family at minimum scale", () => {
    const golden = generateGoldenGrammarStudy({
      ...document,
      settings: { ...document.settings, leafScale: 0.12 },
    });
    const ornaments = golden.ornaments ?? [];
    const parentRibbon = ornaments.find((shape) => shape.id === "golden-parent-scroll")!;
    const halfway = parentRibbon.points.length / 2;
    expect(Math.hypot(
      parentRibbon.points[0].x - parentRibbon.points.at(-1)!.x,
      parentRibbon.points[0].y - parentRibbon.points.at(-1)!.y,
    )).toBeLessThan(0.001);
    expect(Math.hypot(
      parentRibbon.points[halfway - 1].x - parentRibbon.points[halfway].x,
      parentRibbon.points[halfway - 1].y - parentRibbon.points[halfway].y,
    )).toBeLessThan(0.001);

    const primaryLeaf = ornaments.find((shape) => shape.id === "golden-leaf-100")!;
    const xs = primaryLeaf.points.map((point) => point.x);
    const ys = primaryLeaf.points.map((point) => point.y);
    const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    expect(diagonal).toBeGreaterThan(document.height * 0.14);
  });

  it("assembles the origin formula from C-curves, arches, and ranked S-cuts", () => {
    const formula = generateFormulaStudy(document);
    const ids = formula.ornaments?.map((shape) => shape.id) ?? [];
    expect(ids).toContain("formula-primary-c-ribbon");
    expect(ids).toContain("formula-origin-ring");
    expect(ids.filter((id) => id.startsWith("formula-arch-"))).toHaveLength(4);
    expect(ids.filter((id) => /^formula-s-cut-\d$/.test(id))).toHaveLength(3);
    expect(generateFormulaStudy({
      ...document,
      settings: { ...document.settings, studySpiralTurns: 1.75 },
    })).not.toEqual(formula);
  });

  it("builds an isolated spiral study with two canonical traced leaves", () => {
    const study = generateMotifStudy(document);
    expect(study.paths).toHaveLength(0);
    expect(study.ornaments?.filter((shape) => shape.role === "stem-ribbon")).toHaveLength(0);
    expect(study.ornaments?.filter((shape) => shape.role === "leaf-major")).toHaveLength(2);
    expect(study.ornaments?.filter((shape) => shape.role === "leaf-rib")).toHaveLength(2);
    expect(study.ornaments?.map((shape) => shape.id)).toContain("study-comma-leaf");
    expect(study.ornaments?.map((shape) => shape.id)).toContain("study-long-acanthus-leaf");
  });

  it("is deterministic for the same document", () => {
    expect(generateScrollDesign(document)).toEqual(generateScrollDesign(document));
  });

  it("changes when the seed changes", () => {
    expect(generateScrollDesign(document)).not.toEqual(generateScrollDesign({ ...document, seed: 42 }));
  });

  it("adds mirrored paths in horizontal symmetry mode", () => {
    const asymmetric = generateScrollDesign(document);
    const symmetric = generateScrollDesign({ ...document, settings: { ...document.settings, symmetry: "horizontal" } });
    expect(symmetric.paths).toHaveLength(asymmetric.paths.length * 2);
  });

  it("reserves a clear center gap for horizontal symmetry", () => {
    const spacing = 0.3;
    const symmetric = generateScrollDesign({
      ...document,
      settings: { ...document.settings, symmetry: "horizontal", symmetrySpacing: spacing },
    });
    const topY = symmetric.paths.filter((path) => !path.id.endsWith("-mirror")).flatMap((path) => samplePathYValues(path.curves));
    const bottomY = symmetric.paths.filter((path) => path.id.endsWith("-mirror")).flatMap((path) => samplePathYValues(path.curves));
    const actualGap = Math.min(...bottomY) - Math.max(...topY);
    const requestedGap = (document.height - document.margin * 2) * spacing;
    expect(actualGap).toBeGreaterThanOrEqual(requestedGap);
  });

  it("mirrors around a user-positioned symmetry center", () => {
    const center = 0.4;
    const symmetric = generateScrollDesign({
      ...document,
      settings: { ...document.settings, symmetry: "horizontal", symmetryCenter: center },
    });
    const originalStart = symmetric.paths.find((path) => path.id === "primary")!.curves[0].start;
    const mirroredStart = symmetric.paths.find((path) => path.id === "primary-mirror")!.curves[0].start;
    expect(originalStart.y + mirroredStart.y).toBeCloseTo(document.height * center * 2, 6);
  });

  it("mirrors around both coordinates of a clicked point", () => {
    const centerX = 0.62;
    const centerY = 0.38;
    const symmetric = generateScrollDesign({
      ...document,
      settings: { ...document.settings, symmetry: "point", symmetryCenterX: centerX, symmetryCenter: centerY },
    });
    const originalStart = symmetric.paths.find((path) => path.id === "primary")!.curves[0].start;
    const mirroredStart = symmetric.paths.find((path) => path.id === "primary-mirror")!.curves[0].start;
    expect(originalStart.x + mirroredStart.x).toBeCloseTo(document.width * centerX * 2, 6);
    expect(originalStart.y + mirroredStart.y).toBeCloseTo(document.height * centerY * 2, 6);
  });

  it("supports a user-positioned vertical mirror axis", () => {
    const centerX = 0.42;
    const symmetric = generateScrollDesign({
      ...document,
      settings: { ...document.settings, symmetry: "vertical", symmetryCenterX: centerX },
    });
    const originalStart = symmetric.paths.find((path) => path.id === "primary")!.curves[0].start;
    const mirroredStart = symmetric.paths.find((path) => path.id === "primary-mirror")!.curves[0].start;
    expect(originalStart.x + mirroredStart.x).toBeCloseTo(document.width * centerX * 2, 6);
    expect(originalStart.y).toBeCloseTo(mirroredStart.y, 6);
  });

  it("adds manually positioned secondary structures", () => {
    const automatic = generateScrollDesign(document);
    const manual = generateScrollDesign({
      ...document,
      manualSecondaries: [{ id: "manual-1", progress: 0.72, side: -1, length: 1 }],
    });
    expect(manual.paths.length).toBeGreaterThan(automatic.paths.length);
    expect(manual.paths.some((path) => path.id === "manual-1")).toBe(true);
    expect(manual.paths.some((path) => path.parentId === "manual-1" && path.generation === 2)).toBe(true);
  });

  it("grows tapered hierarchical curls from secondary scrolls", () => {
    const flat = generateScrollDesign({
      ...document,
      settings: { ...document.settings, secondaryHierarchyLevels: 1 },
    });
    const hierarchical = generateScrollDesign({
      ...document,
      settings: { ...document.settings, secondaryHierarchyLevels: 3 },
    });
    const flatSecondaries = flat.paths.filter((path) => path.role === "secondary");
    const hierarchicalSecondaries = hierarchical.paths.filter((path) => path.role === "secondary");
    expect(hierarchicalSecondaries.length).toBeGreaterThan(flatSecondaries.length);
    expect(flatSecondaries.every((path) => path.curves.length > (path.backboneCurveCount ?? 1))).toBe(true);
    expect(hierarchicalSecondaries.some((path) => path.generation === 2 && path.parentId)).toBe(true);
    expect(hierarchicalSecondaries.some((path) => path.generation === 3 && path.parentId)).toBe(true);
    expect(new Set(hierarchicalSecondaries.filter((path) => path.generation === 1).map((path) => path.hierarchyRatio))).toEqual(new Set([1]));
    expect(new Set(hierarchicalSecondaries.filter((path) => path.generation === 2).map((path) => path.hierarchyRatio))).toEqual(new Set([0.66]));
    expect(new Set(hierarchicalSecondaries.filter((path) => path.generation === 3).map((path) => path.hierarchyRatio))).toEqual(new Set([0.33]));
    const secondGeneration = hierarchicalSecondaries.find((path) => path.generation === 2)!;
    const rootGeneration = hierarchicalSecondaries.find((path) => path.id === secondGeneration.parentId)!;
    const thirdGeneration = hierarchicalSecondaries.find((path) => path.generation === 3)!;
    const thirdRoot = hierarchicalSecondaries.find((path) => path.id === thirdGeneration.parentId)!;
    expect(approximatePathLength(secondGeneration.curves) / approximatePathLength(rootGeneration.curves)).toBeCloseTo(0.66, 2);
    expect(approximatePathLength(thirdGeneration.curves) / approximatePathLength(thirdRoot.curves)).toBeCloseTo(0.33, 2);
    expect(secondGeneration.parentId).toBe(thirdGeneration.parentId);
    expect(pathBoundsDiagonal(secondGeneration.curves.slice(1))).toBeLessThan(pathBoundsDiagonal(rootGeneration.curves.slice(1)));
    expect(pathBoundsDiagonal(thirdGeneration.curves.slice(1))).toBeLessThan(pathBoundsDiagonal(secondGeneration.curves.slice(1)));
  });

  it("attaches reduced acanthus families to hierarchical branches", () => {
    const hierarchical = generateScrollDesign({
      ...document,
      settings: {
        ...document.settings,
        secondaryHierarchyLevels: 2,
        leafFrequency: 0.7,
        leafClusterComplexity: 1,
      },
    });
    const branchFamilyIds = hierarchical.ornaments
      ?.filter((shape) => shape.role === "leaf-major" && shape.id.startsWith("branch-family-"))
      .map((shape) => shape.id) ?? [];
    expect(branchFamilyIds.length).toBeGreaterThan(0);
    expect(branchFamilyIds.some((id) => id.includes("-child-2-"))).toBe(true);
  });

  it("gives child curls an independently adjustable loose inward gesture", () => {
    const compact = generateScrollDesign({
      ...document,
      settings: {
        ...document.settings,
        secondaryHierarchyLevels: 2,
        secondaryChildAngle: 35,
        secondaryChildLooseness: 0.75,
      },
    });
    const loose = generateScrollDesign({
      ...document,
      settings: {
        ...document.settings,
        secondaryHierarchyLevels: 2,
        secondaryChildAngle: 90,
        secondaryChildLooseness: 1.8,
      },
    });
    const compactChild = compact.paths.find((path) => path.generation === 2);
    const looseChild = loose.paths.find((path) => path.generation === 2);
    expect(compactChild).toBeDefined();
    expect(looseChild).toBeDefined();
    expect(looseChild?.curves).not.toEqual(compactChild?.curves);
    expect(looseChild?.hierarchyRatio).toBe(0.66);
    expect(angleDifferenceDegrees(
      firstCurveHeadingDegrees(compactChild!.curves),
      firstCurveHeadingDegrees(looseChild!.curves),
    )).toBeGreaterThan(45);
    expect(pathTurnDegrees(compactChild!.curves)).toBeGreaterThan(300);
  });

  it("builds tapered ribbons and procedural leaf outlines from the skeleton", () => {
    const design = generateScrollDesign(document);
    const ornaments = design.ornaments ?? [];
    expect(ornaments.some((shape) => shape.role === "stem-ribbon")).toBe(true);
    expect(ornaments.some((shape) => shape.role === "leaf-major")).toBe(true);
    expect(ornaments.some((shape) => shape.role === "leaf-rib")).toBe(true);
    for (const leaf of ornaments.filter((shape) => shape.role === "leaf-major" || shape.role === "leaf-supporting")) {
      expect(leaf.closed).toBe(true);
      expect(leaf.points.length).toBeGreaterThan(5);
      expect(leaf.pathData).toContain("C ");
    }
    const narrow = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafBelly: 0.2 },
    });
    const full = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafBelly: 1.8 },
    });
    const narrowLeaf = narrow.ornaments?.find((shape) => shape.role === "leaf-major");
    const fullLeaf = full.ornaments?.find((shape) => shape.role === "leaf-major");
    expect(fullLeaf?.pathData).not.toEqual(narrowLeaf?.pathData);
  });

  it("adds subordinate leaves as cluster complexity increases", () => {
    const simple = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafClusterComplexity: 0 },
    });
    const compound = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafClusterComplexity: 1 },
    });
    const supportingCount = (design: ReturnType<typeof generateScrollDesign>) =>
      design.ornaments?.filter((shape) => shape.role === "leaf-supporting").length ?? 0;
    expect(supportingCount(compound)).toBeGreaterThan(supportingCount(simple));
  });

  it("builds three-tier modules from one root at 100, 66, and 33 percent", () => {
    const design = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafClusterComplexity: 1 },
    });
    const tierOutlines = design.ornaments?.filter((shape) =>
      shape.closed && shape.id.startsWith("module-primary-0-tier-"),
    ) ?? [];
    expect(tierOutlines.map((shape) => shape.id).some((id) => id.includes("tier-100"))).toBe(true);
    expect(tierOutlines.map((shape) => shape.id).some((id) => id.includes("tier-66"))).toBe(true);
    expect(tierOutlines.map((shape) => shape.id).some((id) => id.includes("tier-33"))).toBe(true);
    expect(new Set(tierOutlines.map((shape) => `${shape.points[0].x},${shape.points[0].y}`)).size).toBe(1);
  });

  it("bends approved leaf silhouettes without separating their shared tier root", () => {
    const straight = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafBend: 0, leafClusterComplexity: 1 },
    });
    const bent = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafBend: 1.2, leafClusterComplexity: 1 },
    });
    const straightLeaf = straight.ornaments?.find((shape) => shape.id.startsWith("module-primary-0-tier-100"));
    const bentTiers = bent.ornaments?.filter((shape) => shape.closed && shape.id.startsWith("module-primary-0-tier-")) ?? [];
    const bentLeaf = bentTiers.find((shape) => shape.id.includes("tier-100"));
    expect(bentLeaf?.pathData).not.toEqual(straightLeaf?.pathData);
    expect(new Set(bentTiers.map((shape) => `${shape.points[0].x},${shape.points[0].y}`)).size).toBe(1);
  });

  it("places tapered negative-space pockets between adjacent acanthus tiers", () => {
    const compound = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafClusterComplexity: 1, leafPocketDepth: 0.7 },
    });
    const simple = generateScrollDesign({
      ...document,
      settings: { ...document.settings, leafClusterComplexity: 0, leafPocketDepth: 0.7 },
    });
    const compoundPockets = compound.ornaments?.filter((shape) => shape.role === "negative-space") ?? [];
    const simplePockets = simple.ornaments?.filter((shape) => shape.role === "negative-space") ?? [];
    expect(compoundPockets.length).toBeGreaterThan(0);
    expect(compoundPockets.every((shape) => shape.closed && shape.pathData?.includes("C "))).toBe(true);
    expect(simplePockets).toHaveLength(0);
  });

  it("uses manually directed acanthus families instead of automatic modules", () => {
    const design = generateScrollDesign({
      ...document,
      manualAcanthusFamilies: [{ id: "family-1", progress: 0.42, side: 1, size: 0.38, angleOffset: 0.55 }],
      settings: { ...document.settings, leafClusterComplexity: 1 },
    });
    const ids = design.ornaments?.map((shape) => shape.id) ?? [];
    expect(ids.some((id) => id.startsWith("manual-family-primary-family-1-tier-100"))).toBe(true);
    expect(ids.some((id) => id.startsWith("module-primary-"))).toBe(false);
  });

  it("keeps every multi-curve path positionally and tangentially continuous", () => {
    const design = generateScrollDesign(document);
    for (const path of design.paths) {
      for (let index = 1; index < path.curves.length; index += 1) {
        const previous = path.curves[index - 1];
        const current = path.curves[index];
        expect(current.start).toEqual(previous.end);

        const incoming = {
          x: previous.end.x - previous.control2.x,
          y: previous.end.y - previous.control2.y,
        };
        const outgoing = {
          x: current.control1.x - current.start.x,
          y: current.control1.y - current.start.y,
        };
        const crossProduct = incoming.x * outgoing.y - incoming.y * outgoing.x;
        const dotProduct = incoming.x * outgoing.x + incoming.y * outgoing.y;
        expect(Math.abs(crossProduct)).toBeLessThan(0.000001);
        expect(dotProduct).toBeGreaterThan(0);
      }
    }
  });

  it("builds a continuous design from a hand-drawn backbone", () => {
    const drawnDocument: CarvingDocument = {
      ...document,
      backboneMode: "drawn",
      backbonePoints: [
        { x: 1, y: 6 },
        { x: 5, y: 3 },
        { x: 10, y: 2 },
        { x: 15, y: 3.5 },
        { x: 18, y: 5 },
      ],
    };
    const drawn = generateScrollDesign(drawnDocument);
    expect(drawn.paths[0].curves.length).toBeGreaterThan(3);
    expect(drawn.paths[0].curves[0].start).toEqual({ x: 1, y: 6 });
    const stretched = generateScrollDesign({
      ...drawnDocument,
      settings: { ...drawnDocument.settings, customScaleX: 1.25 },
    });
    expect(stretched.paths[0]).not.toEqual(drawn.paths[0]);
  });

  it("preserves dense hand-drawn curls without collapsing their samples", () => {
    const spiralPoints = Array.from({ length: 72 }, (_, index) => {
      const progress = index / 71;
      const angle = progress * Math.PI * 3.6;
      const radius = 3.1 - progress * 1.9;
      return { x: 9 + Math.cos(angle) * radius, y: 4 + Math.sin(angle) * radius };
    });
    const spiral = generateScrollDesign({
      ...document,
      backboneMode: "drawn",
      backbonePoints: spiralPoints,
      settings: { ...document.settings, customSmoothing: 1, customFidelity: 1, customTerminal: "preserve" },
    });
    const primary = spiral.paths.find((path) => path.id === "primary")!;
    const backboneCurveCount = primary.backboneCurveCount!;
    expect(backboneCurveCount).toBeGreaterThan(45);
    expect(primary.curves).toHaveLength(backboneCurveCount);

    const interpreted = generateScrollDesign({
      ...document,
      backboneMode: "drawn",
      backbonePoints: spiralPoints,
      settings: { ...document.settings, customSmoothing: 1, customFidelity: 0, customTerminal: "preserve" },
    });
    expect(interpreted.paths[0].curves).toHaveLength(primary.curves.length);
    expect(interpreted.paths[0]).not.toEqual(primary);
  });

  it("fits an oversized custom design inside the document margin", () => {
    const oversized = generateScrollDesign({
      ...document,
      backboneMode: "drawn",
      backbonePoints: [
        { x: 0.5, y: 7.5 },
        { x: 4, y: 0.5 },
        { x: 12, y: 7.5 },
        { x: 19, y: 0.5 },
        { x: 23.5, y: 7.5 },
      ],
      settings: { ...document.settings, customScaleX: 1.75, customScaleY: 1.75 },
    });
    for (const path of oversized.paths) {
      for (const curve of path.curves) {
        for (let step = 0; step <= 50; step += 1) {
          const t = step / 50;
          const inverse = 1 - t;
          const point = {
            x: inverse ** 3 * curve.start.x + 3 * inverse ** 2 * t * curve.control1.x + 3 * inverse * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
            y: inverse ** 3 * curve.start.y + 3 * inverse ** 2 * t * curve.control1.y + 3 * inverse * t ** 2 * curve.control2.y + t ** 3 * curve.end.y,
          };
          expect(point.x).toBeGreaterThanOrEqual(document.margin);
          expect(point.x).toBeLessThanOrEqual(document.width - document.margin);
          expect(point.y).toBeGreaterThanOrEqual(document.margin);
          expect(point.y).toBeLessThanOrEqual(document.height - document.margin);
        }
      }
    }
  });
});
