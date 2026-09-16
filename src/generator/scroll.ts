import type { CarvingDocument, CubicCurve, Point, ScrollDesign, ScrollPath } from "../types";
import { between, createRandom } from "./random";
import { generateOrnaments } from "./ornament";

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const vectorLength = (point: Point): number => Math.hypot(point.x, point.y);
const normalize = (point: Point): Point => {
  const magnitude = vectorLength(point) || 1;
  return scale(point, 1 / magnitude);
};
const perpendicular = (point: Point, side: number): Point => ({ x: -point.y * side, y: point.x * side });
const rotate = (point: Point, angle: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});
const mirrorY = (point: Point, height: number): Point => ({ x: point.x, y: height - point.y });

function pointOnCurve(curve: CubicCurve, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * curve.start.x + 3 * inverse ** 2 * t * curve.control1.x + 3 * inverse * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
    y: inverse ** 3 * curve.start.y + 3 * inverse ** 2 * t * curve.control1.y + 3 * inverse * t ** 2 * curve.control2.y + t ** 3 * curve.end.y,
  };
}

function tangentOnCurve(curve: CubicCurve, t: number): Point {
  const inverse = 1 - t;
  return normalize({
    x: 3 * inverse ** 2 * (curve.control1.x - curve.start.x) + 6 * inverse * t * (curve.control2.x - curve.control1.x) + 3 * t ** 2 * (curve.end.x - curve.control2.x),
    y: 3 * inverse ** 2 * (curve.control1.y - curve.start.y) + 6 * inverse * t * (curve.control2.y - curve.control1.y) + 3 * t ** 2 * (curve.end.y - curve.control2.y),
  });
}

function sampleCurves(curves: CubicCurve[], samplesPerCurve = 12, startT = 0): Point[] {
  return curves.flatMap((curve) => Array.from({ length: samplesPerCurve + 1 }, (_, index) => {
    const t = startT + (1 - startT) * (index / samplesPerCurve);
    return pointOnCurve(curve, t);
  }));
}

function curvesLength(curves: CubicCurve[]): number {
  const samples = sampleCurves(curves, 18);
  return samples.slice(1).reduce((length, point, index) => length + distance(samples[index], point), 0);
}

function scaleCurvesFromOrigin(curves: CubicCurve[], origin: Point, amount: number): CubicCurve[] {
  const transform = (point: Point): Point => add(origin, scale(subtract(point, origin), amount));
  return curves.map((curve) => ({
    start: transform(curve.start),
    control1: transform(curve.control1),
    control2: transform(curve.control2),
    end: transform(curve.end),
  }));
}

function hermiteCurve(start: Point, end: Point, startTangent: Point, endTangent: Point): CubicCurve {
  const handleLength = distance(start, end) / 3;
  return {
    start,
    control1: add(start, scale(normalize(startTangent), handleLength)),
    control2: subtract(end, scale(normalize(endTangent), handleLength)),
    end,
  };
}

function progressiveCurl(
  start: Point,
  startTangent: Point,
  radius: number,
  intensity: number,
  turnDirection = 1,
  targetTurnOverride?: number,
): CubicCurve[] {
  const segmentCount = 16;
  const targetTurn = targetTurnOverride ?? 5.25 + intensity * 1.7;
  const initialCurvature = 0.52 / radius;
  const finalCurvature = (1.72 + intensity * 0.3) / radius;
  const travel = targetTurn / ((initialCurvature + finalCurvature) / 2);
  const stepLength = travel / segmentCount;
  const curves: CubicCurve[] = [];
  let point = start;
  let heading = Math.atan2(startTangent.y, startTangent.x);

  for (let index = 0; index < segmentCount; index += 1) {
    const progress = (index + 0.5) / segmentCount;
    const easedProgress = progress * progress * (3 - 2 * progress);
    const curvature = initialCurvature + (finalCurvature - initialCurvature) * easedProgress;
    const turn = curvature * stepLength * turnDirection;
    const nextHeading = heading + turn;
    const averageHeading = heading + turn / 2;
    const nextPoint = {
      x: point.x + Math.cos(averageHeading) * stepLength,
      y: point.y + Math.sin(averageHeading) * stepLength,
    };
    curves.push(hermiteCurve(
      point,
      nextPoint,
      { x: Math.cos(heading), y: Math.sin(heading) },
      { x: Math.cos(nextHeading), y: Math.sin(nextHeading) },
    ));
    point = nextPoint;
    heading = nextHeading;
  }
  return curves;
}

function mirrorPath(path: ScrollPath, height: number): ScrollPath {
  return {
    ...path,
    id: `${path.id}-mirror`,
    curves: path.curves.map((curve) => ({
      start: mirrorY(curve.start, height),
      control1: mirrorY(curve.control1, height),
      control2: mirrorY(curve.control2, height),
      end: mirrorY(curve.end, height),
    })),
  };
}

function mirrorPathVertically(path: ScrollPath, axisX: number): ScrollPath {
  const mirror = (point: Point): Point => ({ x: axisX * 2 - point.x, y: point.y });
  return {
    ...path,
    id: `${path.id}-mirror`,
    curves: path.curves.map((curve) => ({
      start: mirror(curve.start),
      control1: mirror(curve.control1),
      control2: mirror(curve.control2),
      end: mirror(curve.end),
    })),
  };
}

function rotatePathAroundPoint(path: ScrollPath, center: Point): ScrollPath {
  const rotate = (point: Point): Point => ({ x: center.x * 2 - point.x, y: center.y * 2 - point.y });
  return {
    ...path,
    id: `${path.id}-mirror`,
    curves: path.curves.map((curve) => ({
      start: rotate(curve.start),
      control1: rotate(curve.control1),
      control2: rotate(curve.control2),
      end: rotate(curve.end),
    })),
  };
}

function resamplePolyline(points: Point[], count: number): Point[] {
  if (points.length <= 1 || count <= 1) return points;
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  }
  const totalLength = cumulative[cumulative.length - 1];
  if (totalLength <= 0.000001) return Array.from({ length: count }, () => points[0]);

  let segment = 1;
  return Array.from({ length: count }, (_, index) => {
    const target = totalLength * (index / (count - 1));
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1;
    const startDistance = cumulative[segment - 1];
    const segmentLength = Math.max(0.000001, cumulative[segment] - startDistance);
    const amount = (target - startDistance) / segmentLength;
    return {
      x: points[segment - 1].x + (points[segment].x - points[segment - 1].x) * amount,
      y: points[segment - 1].y + (points[segment].y - points[segment - 1].y) * amount,
    };
  });
}

function interpretedVersion(points: Point[]): Point[] {
  let controls = resamplePolyline(points, Math.min(10, Math.max(6, Math.round(points.length / 8))));
  for (let pass = 0; pass < 4; pass += 1) {
    controls = controls.map((point, index, source) => {
      if (index === 0 || index === source.length - 1) return point;
      return {
        x: point.x * 0.5 + (source[index - 1].x + source[index + 1].x) * 0.25,
        y: point.y * 0.5 + (source[index - 1].y + source[index + 1].y) * 0.25,
      };
    });
  }
  return resamplePolyline(controls, points.length);
}

function smoothDrawnPoints(points: Point[], document: CarvingDocument): Point[] {
  const origin = points[0];
  const scaled = points.map((point) => ({
    x: origin.x + (point.x - origin.x) * document.settings.customScaleX,
    y: origin.y + (point.y - origin.y) * document.settings.customScaleY,
  }));
  const scaledEnd = scaled[scaled.length - 1];
  const shaped = scaled.map((point, index) => {
    if (index === 0 || index === scaled.length - 1) return point;
    const progress = index / (scaled.length - 1);
    const baseline = {
      x: origin.x + (scaledEnd.x - origin.x) * progress,
      y: origin.y + (scaledEnd.y - origin.y) * progress,
    };
    return add(baseline, scale(subtract(point, baseline), document.settings.customStrength));
  });
  const minimumSpacing = Math.min(document.width, document.height) * 0.008;
  const spaced: Point[] = [shaped[0]];
  for (let index = 1; index < shaped.length - 1; index += 1) {
    if (distance(shaped[index], spaced[spaced.length - 1]) >= minimumSpacing) {
      spaced.push(shaped[index]);
    }
  }
  if (distance(shaped[shaped.length - 1], spaced[spaced.length - 1]) > 0.000001) {
    spaced.push(shaped[shaped.length - 1]);
  }
  let smoothed = spaced;
  const smoothingPasses = Math.round(document.settings.customSmoothing * 3);
  for (let pass = 0; pass < smoothingPasses; pass += 1) {
    smoothed = smoothed.map((point, index, source) => {
      if (index === 0 || index === source.length - 1) return point;
      const incoming = normalize(subtract(point, source[index - 1]));
      const outgoing = normalize(subtract(source[index + 1], point));
      const directionalAgreement = Math.max(-1, Math.min(1, incoming.x * outgoing.x + incoming.y * outgoing.y));
      const curvatureProtection = (directionalAgreement + 1) / 2;
      const smoothingWeight = document.settings.customSmoothing * 0.32 * curvatureProtection;
      const neighborAverage = {
        x: (source[index - 1].x + source[index + 1].x) / 2,
        y: (source[index - 1].y + source[index + 1].y) / 2,
      };
      return {
        x: point.x + (neighborAverage.x - point.x) * smoothingWeight,
        y: point.y + (neighborAverage.y - point.y) * smoothingWeight,
      };
    });
  }
  const interpreted = interpretedVersion(smoothed);
  const fidelity = document.settings.customFidelity;
  return smoothed.map((point, index) => ({
    x: interpreted[index].x + (point.x - interpreted[index].x) * fidelity,
    y: interpreted[index].y + (point.y - interpreted[index].y) * fidelity,
  }));
}

function drawnPointsToCurves(points: Point[], document: CarvingDocument): CubicCurve[] {
  const smoothed = smoothDrawnPoints(points, document);
  const curves: CubicCurve[] = [];
  for (let index = 0; index < smoothed.length - 1; index += 1) {
    const previous = smoothed[Math.max(0, index - 1)];
    const start = smoothed[index];
    const end = smoothed[index + 1];
    const next = smoothed[Math.min(smoothed.length - 1, index + 2)];
    curves.push({
      start,
      control1: add(start, scale(subtract(end, previous), 1 / 6)),
      control2: subtract(end, scale(subtract(next, start), 1 / 6)),
      end,
    });
  }
  return curves;
}

function pointAndTangentOnPath(curves: CubicCurve[], progress: number): { point: Point; tangent: Point } {
  const scaledProgress = Math.min(0.999999, Math.max(0, progress)) * curves.length;
  const curveIndex = Math.min(curves.length - 1, Math.floor(scaledProgress));
  const t = scaledProgress - curveIndex;
  return {
    point: pointOnCurve(curves[curveIndex], t),
    tangent: tangentOnCurve(curves[curveIndex], t),
  };
}

interface PrimaryResult {
  path: ScrollPath;
  backboneCurveCount: number;
}

function makePrimary(document: CarvingDocument): PrimaryResult {
  const random = createRandom(document.seed, "primary-flow");
  const { width, height, margin, settings } = document;
  const usableWidth = Math.max(width - margin * 2, width * 0.2);
  const usableHeight = Math.max(height - margin * 2, height * 0.2);
  let backboneCurves: CubicCurve[];

  if (document.backboneMode === "drawn" && document.backbonePoints.length >= 4) {
    backboneCurves = drawnPointsToCurves(document.backbonePoints, document);
  } else {
    const start: Point = { x: margin, y: margin + usableHeight * between(random, 0.66, 0.71) };
    const end: Point = {
      x: margin + usableWidth * settings.backboneReach,
      y: margin + usableHeight * settings.terminalHeight,
    };
    const crestY = Math.max(margin + usableHeight * 0.07, start.y - usableHeight * (0.25 + settings.backboneSweep * 0.48));
    const firstControl: Point = {
      x: margin + usableWidth * settings.crestPosition * between(random, 0.48, 0.56),
      y: crestY,
    };
    const secondControl: Point = {
      x: margin + usableWidth * (settings.crestPosition + (settings.backboneReach - settings.crestPosition) * between(random, 0.46, 0.54)),
      y: crestY + usableHeight * between(random, 0.01, 0.055),
    };
    backboneCurves = [{ start, control1: firstControl, control2: secondControl, end }];
  }

  const lastBackbone = backboneCurves[backboneCurves.length - 1];
  const curlStart = lastBackbone.end;
  const curlTangent = tangentOnCurve(lastBackbone, 1);
  const radius = Math.min(usableWidth, usableHeight) * between(random, 0.115, 0.135);
  const preserveDrawnTerminal = document.backboneMode === "drawn" && settings.customTerminal === "preserve";
  const terminalCurves = preserveDrawnTerminal ? [] : progressiveCurl(curlStart, curlTangent, radius, settings.curlIntensity);
  return {
    path: {
      id: "primary",
      role: "primary",
      curves: [...backboneCurves, ...terminalCurves],
      backboneCurveCount: backboneCurves.length,
    },
    backboneCurveCount: backboneCurves.length,
  };
}

function makeBranch(
  backbone: CubicCurve[],
  progress: number,
  side: number,
  reach: number,
  curlAmount: number,
  longitudinal: number,
  transverse: number,
  id: string,
  generation = 1,
  parentId?: string,
  hierarchyRootSpan = reach,
  childAngleDegrees = 65,
  looseness = 1,
  hierarchyRootLength?: number,
): ScrollPath {
  const { point: start, tangent: parentTangent } = pointAndTangentOnPath(backbone, progress);
  const normal = perpendicular(parentTangent, side);
  const isChild = generation > 1;
  const childAngle = childAngleDegrees * Math.PI / 180;
  const end = isChild
    ? add(start, scale(rotate(parentTangent, side * childAngle), reach * 0.42))
    : add(start, add(scale(parentTangent, reach * longitudinal), scale(normal, reach * transverse)));
  const endTangent = isChild
    ? rotate(parentTangent, side * childAngle * 0.72)
    : normalize(add(scale(normal, Math.max(0.08, 1 - curlAmount * 0.62)), scale(parentTangent, -curlAmount)));
  const stem = hermiteCurve(start, end, parentTangent, endTangent);
  const curlRadiusRatio = isChild
    ? 0.095 + Math.min(1.8, looseness) * 0.012
    : 0.105 + Math.min(1.5, curlAmount) * 0.035;
  const curlRadius = Math.max(reach * curlRadiusRatio, 0.08);
  const childTurn = isChild
    ? Math.PI * (1.65 + Math.min(1.8, looseness) * 0.08)
    : undefined;
  const terminal = curlAmount <= 0.02
    ? []
    : progressiveCurl(end, endTangent, curlRadius, curlAmount * 0.62, side, childTurn);
  const rawCurves = [stem, ...terminal];
  const rawLength = curvesLength(rawCurves);
  const rootLength = hierarchyRootLength ?? rawLength;
  const hierarchyRatio = [1, 0.66, 0.33][generation - 1] ?? 0.33;
  const targetLength = generation === 1 ? rawLength : rootLength * hierarchyRatio;
  const curves = generation === 1 || rawLength <= 0.000001
    ? rawCurves
    : scaleCurvesFromOrigin(rawCurves, start, targetLength / rawLength);
  return {
    id,
    role: "secondary",
    curves,
    backboneCurveCount: 1,
    generation,
    parentId,
    hierarchyRatio,
    hierarchyRootSpan,
    hierarchyRootLength: rootLength,
  };
}

function branchCollides(
  branch: ScrollPath,
  primary: ScrollPath,
  backboneCurveCount: number,
  accepted: ScrollPath[],
  document: CarvingDocument,
): boolean {
  const branchTail = sampleCurves(branch.curves, 14, 0.3);
  const obstacles = [
    ...sampleCurves(primary.curves.slice(backboneCurveCount), 10),
    ...accepted.flatMap((path) => sampleCurves(path.curves, 12)),
  ];
  const clearance = Math.max(document.height * 0.045, document.width * 0.012);
  const outside = branchTail.some((point) =>
    point.x < document.margin || point.x > document.width - document.margin ||
    point.y < document.margin || point.y > document.height - document.margin,
  );
  return outside || branchTail.some((point) => obstacles.some((obstacle) => distance(point, obstacle) < clearance));
}

function makeBranches(document: CarvingDocument, primary: ScrollPath, backboneCurveCount: number): ScrollPath[] {
  const random = createRandom(document.seed, "secondary-branches");
  const requestedCount = Math.max(1, Math.round(document.settings.density * 3));
  const reachBase = Math.min(document.width - document.margin * 2, document.height - document.margin * 2);
  const attachments = [
    { t: 0.29, side: 1 },
    { t: 0.5, side: -1 },
    { t: 0.67, side: 1 },
  ];
  const accepted: ScrollPath[] = [];
  const backbone = primary.curves.slice(0, backboneCurveCount);
  const variation = document.settings.secondaryVariation;

  for (let index = 0; index < requestedCount; index += 1) {
    const attachment = attachments[index];
    const t = attachment.t + between(random, -0.025, 0.025);
    const reach = reachBase * document.settings.secondaryLength * between(random, 1 - variation * 0.35, 1 + variation * 0.35);
    const curlAmount = document.settings.secondaryCurl * between(random, 1 - variation * 0.25, 1 + variation * 0.25);
    const longitudinal = between(random, 0.42 - variation * 0.12, 0.68 + variation * 0.12);
    const transverse = between(random, 0.6 - variation * 0.12, 0.9 + variation * 0.12);
    const attempts = [
      { side: attachment.side, reach },
      { side: -attachment.side, reach: reach * 0.88 },
      { side: attachment.side, reach: reach * 0.68 },
    ];
    const candidate = attempts
      .map((attempt) => makeBranch(backbone, t, attempt.side, attempt.reach, curlAmount, longitudinal, transverse, `secondary-${index}`))
      .find((branch) => !branchCollides(branch, primary, backboneCurveCount, accepted, document));
    if (candidate) accepted.push(candidate);
  }
  return accepted;
}

function makeManualBranches(document: CarvingDocument, primary: ScrollPath, backboneCurveCount: number): ScrollPath[] {
  const backbone = primary.curves.slice(0, backboneCurveCount);
  const reachBase = Math.min(document.width - document.margin * 2, document.height - document.margin * 2);
  return document.manualSecondaries.map((secondary) => makeBranch(
    backbone,
    secondary.progress,
    secondary.side,
    reachBase * document.settings.secondaryLength * secondary.length,
    document.settings.secondaryCurl,
    0.58,
    0.78,
    secondary.id,
  ));
}

function backboneLength(path: ScrollPath): number {
  const curves = path.curves.slice(0, path.backboneCurveCount ?? path.curves.length);
  const samples = sampleCurves(curves, 18);
  return samples.slice(1).reduce((length, point, index) => length + distance(samples[index], point), 0);
}

function pathTurnSide(curves: CubicCurve[], progress: number): number {
  const before = pointAndTangentOnPath(curves, Math.max(0, progress - 0.06)).tangent;
  const after = pointAndTangentOnPath(curves, Math.min(0.999, progress + 0.06)).tangent;
  return before.x * after.y - before.y * after.x >= 0 ? 1 : -1;
}

function curlTurnSide(curves: CubicCurve[]): number {
  const curlCurves = curves.slice(1);
  const signedTurn = curlCurves.reduce((total, curve) => {
    const startTangent = normalize(subtract(curve.control1, curve.start));
    const endTangent = normalize(subtract(curve.end, curve.control2));
    return total + Math.atan2(
      startTangent.x * endTangent.y - startTangent.y * endTangent.x,
      startTangent.x * endTangent.x + startTangent.y * endTangent.y,
    );
  }, 0);
  return signedTurn >= 0 ? 1 : -1;
}

function makeScaledChildCurl(
  root: ScrollPath,
  progress: number,
  side: number,
  ratio: number,
  id: string,
  generation: number,
  childAngleDegrees: number,
  looseness: number,
): ScrollPath {
  const rootBackbone = root.curves.slice(0, root.backboneCurveCount ?? 1);
  const { point: start, tangent: parentTangent } = pointAndTangentOnPath(rootBackbone, progress);
  const sourceStart = root.curves[0].start;
  const sourceTangent = tangentOnCurve(root.curves[0], 0);
  const sourceNormal = perpendicular(sourceTangent, 1);
  const desiredTangent = rotate(parentTangent, side * childAngleDegrees * Math.PI / 180);
  const desiredNormal = perpendicular(desiredTangent, 1);
  const mirror = curlTurnSide(root.curves) === side ? 1 : -1;
  const acrossScale = 0.86 + Math.min(1.8, Math.max(0.75, looseness)) * 0.11;
  const transform = (point: Point): Point => {
    const relative = subtract(point, sourceStart);
    const along = relative.x * sourceTangent.x + relative.y * sourceTangent.y;
    const across = (relative.x * sourceNormal.x + relative.y * sourceNormal.y) * mirror * acrossScale;
    return add(start, add(scale(desiredTangent, along * ratio), scale(desiredNormal, across * ratio)));
  };
  const transformed = root.curves.map((curve) => ({
    start: transform(curve.start),
    control1: transform(curve.control1),
    control2: transform(curve.control2),
    end: transform(curve.end),
  }));
  const rootLength = root.hierarchyRootLength ?? curvesLength(root.curves);
  const transformedLength = curvesLength(transformed);
  const curves = transformedLength <= 0.000001
    ? transformed
    : scaleCurvesFromOrigin(transformed, start, rootLength * ratio / transformedLength);
  return {
    id,
    role: "secondary",
    curves,
    backboneCurveCount: root.backboneCurveCount ?? 1,
    generation,
    parentId: root.id,
    hierarchyRatio: ratio,
    hierarchyRootSpan: root.hierarchyRootSpan ?? backboneLength(root),
    hierarchyRootLength: rootLength,
  };
}

function makeHierarchy(
  document: CarvingDocument,
  primary: ScrollPath,
  backboneCurveCount: number,
  roots: ScrollPath[],
): ScrollPath[] {
  const maximumGeneration = Math.max(1, Math.min(3, Math.round(document.settings.secondaryHierarchyLevels ?? 2)));
  if (maximumGeneration <= 1 || roots.length === 0) return roots;

  const random = createRandom(document.seed, "secondary-hierarchy");
  const accepted = [...roots];

  for (const root of roots) {
    const rootBackbone = root.curves.slice(0, root.backboneCurveCount ?? 1);
    const interiorSide = pathTurnSide(rootBackbone, 0.52);
    const children = [
      { generation: 2, ratio: 0.66, progress: 0.38, side: interiorSide },
      { generation: 3, ratio: 0.33, progress: 0.64, side: -interiorSide },
    ].slice(0, maximumGeneration - 1);

    for (const child of children) {
      const variation = (document.settings.secondaryVariation ?? 0) * 0.04;
      const progress = child.progress + between(random, -variation, variation);
      const attempts = [child.side, -child.side];
      const candidate = attempts
        .map((attemptSide) => makeScaledChildCurl(
          root,
          progress,
          attemptSide,
          child.ratio,
          `${root.id}-child-${child.generation}-0`,
          child.generation,
          document.settings.secondaryChildAngle ?? 65,
          document.settings.secondaryChildLooseness ?? 1.35,
        ))
        .find((branch) => !branchCollides(
          branch,
          primary,
          backboneCurveCount,
          accepted.filter((path) => path.id !== root.id),
          document,
        ));
      if (candidate) accepted.push(candidate);
    }
  }
  return accepted;
}

function transformPoint(point: Point, origin: Point, scaleAmount: number, offset: Point): Point {
  return {
    x: origin.x + (point.x - origin.x) * scaleAmount + offset.x,
    y: origin.y + (point.y - origin.y) * scaleAmount + offset.y,
  };
}

interface FitRegion {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function fitDesignToRegion(design: ScrollDesign, limits: FitRegion): ScrollDesign {
  const sampled = design.paths.flatMap((path) => sampleCurves(path.curves, 24));
  if (sampled.length === 0) return design;
  const bounds = sampled.reduce((result, point) => ({
    left: Math.min(result.left, point.x),
    right: Math.max(result.right, point.x),
    top: Math.min(result.top, point.y),
    bottom: Math.max(result.bottom, point.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  const width = Math.max(0.000001, bounds.right - bounds.left);
  const height = Math.max(0.000001, bounds.bottom - bounds.top);
  const availableWidth = Math.max(0.000001, limits.right - limits.left);
  const availableHeight = Math.max(0.000001, limits.bottom - limits.top);
  const scaleAmount = Math.min(1, availableWidth / width, availableHeight / height);
  const origin = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const scaledBounds = {
    left: origin.x + (bounds.left - origin.x) * scaleAmount,
    right: origin.x + (bounds.right - origin.x) * scaleAmount,
    top: origin.y + (bounds.top - origin.y) * scaleAmount,
    bottom: origin.y + (bounds.bottom - origin.y) * scaleAmount,
  };
  const offset = { x: 0, y: 0 };
  if (scaledBounds.left < limits.left) offset.x = limits.left - scaledBounds.left;
  if (scaledBounds.right + offset.x > limits.right) offset.x += limits.right - (scaledBounds.right + offset.x);
  if (scaledBounds.top < limits.top) offset.y = limits.top - scaledBounds.top;
  if (scaledBounds.bottom + offset.y > limits.bottom) offset.y += limits.bottom - (scaledBounds.bottom + offset.y);

  return {
    paths: design.paths.map((path) => ({
      ...path,
      curves: path.curves.map((curve) => ({
        start: transformPoint(curve.start, origin, scaleAmount, offset),
        control1: transformPoint(curve.control1, origin, scaleAmount, offset),
        control2: transformPoint(curve.control2, origin, scaleAmount, offset),
        end: transformPoint(curve.end, origin, scaleAmount, offset),
      })),
    })),
  };
}

function documentFitRegion(document: CarvingDocument): FitRegion {
  const strokeClearance = document.height * 0.012;
  return {
    left: document.margin + strokeClearance,
    right: document.width - document.margin - strokeClearance,
    top: document.margin + strokeClearance,
    bottom: document.height - document.margin - strokeClearance,
  };
}

function createHorizontalSymmetry(design: ScrollDesign, document: CarvingDocument): ScrollDesign {
  const fullRegion = documentFitRegion(document);
  const minimumCenter = document.margin + (document.height - document.margin * 2) * 0.15;
  const maximumCenter = document.height - document.margin - (document.height - document.margin * 2) * 0.15;
  const centerY = Math.min(maximumCenter, Math.max(minimumCenter, document.height * document.settings.symmetryCenter));
  const usableHeight = document.height - document.margin * 2;
  const halfGap = usableHeight * document.settings.symmetrySpacing / 2;
  const availableAbove = centerY - halfGap - fullRegion.top;
  const availableBelow = fullRegion.bottom - (centerY + halfGap);
  const mirroredHalfHeight = Math.max(document.height * 0.05, Math.min(availableAbove, availableBelow));
  const topRegion: FitRegion = {
    left: fullRegion.left,
    right: fullRegion.right,
    top: centerY - halfGap - mirroredHalfHeight,
    bottom: centerY - halfGap - document.height * 0.012,
  };
  const topDesign = fitDesignToRegion(design, topRegion);
  const mirroredPaths = topDesign.paths.map((path) => mirrorPath(path, centerY * 2));
  return { paths: [...topDesign.paths, ...mirroredPaths] };
}

function createVerticalSymmetry(design: ScrollDesign, document: CarvingDocument): ScrollDesign {
  const fullRegion = documentFitRegion(document);
  const usableWidth = document.width - document.margin * 2;
  const minimumCenter = document.margin + usableWidth * 0.15;
  const maximumCenter = document.width - document.margin - usableWidth * 0.15;
  const centerX = Math.min(maximumCenter, Math.max(minimumCenter, document.width * document.settings.symmetryCenterX));
  const halfGap = usableWidth * document.settings.symmetrySpacing / 2;
  const availableLeft = centerX - halfGap - fullRegion.left;
  const availableRight = fullRegion.right - (centerX + halfGap);
  const mirroredHalfWidth = Math.max(document.width * 0.05, Math.min(availableLeft, availableRight));
  const leftRegion: FitRegion = {
    left: centerX - halfGap - mirroredHalfWidth,
    right: centerX - halfGap - document.height * 0.012,
    top: fullRegion.top,
    bottom: fullRegion.bottom,
  };
  const leftDesign = fitDesignToRegion(design, leftRegion);
  const mirroredPaths = leftDesign.paths.map((path) => mirrorPathVertically(path, centerX));
  return { paths: [...leftDesign.paths, ...mirroredPaths] };
}

function createPointSymmetry(design: ScrollDesign, document: CarvingDocument): ScrollDesign {
  const fullRegion = documentFitRegion(document);
  const usableWidth = document.width - document.margin * 2;
  const usableHeight = document.height - document.margin * 2;
  const center = {
    x: Math.min(document.width - document.margin - usableWidth * 0.15, Math.max(document.margin + usableWidth * 0.15, document.width * document.settings.symmetryCenterX)),
    y: Math.min(document.height - document.margin - usableHeight * 0.15, Math.max(document.margin + usableHeight * 0.15, document.height * document.settings.symmetryCenter)),
  };
  let sourceRegion: FitRegion;

  if (document.width >= document.height) {
    const halfGap = usableWidth * document.settings.symmetrySpacing / 2;
    const halfWidth = Math.max(document.width * 0.05, Math.min(
      center.x - halfGap - fullRegion.left,
      fullRegion.right - (center.x + halfGap),
    ));
    const halfHeight = Math.max(document.height * 0.05, Math.min(center.y - fullRegion.top, fullRegion.bottom - center.y));
    sourceRegion = {
      left: center.x - halfGap - halfWidth,
      right: center.x - halfGap - document.height * 0.012,
      top: center.y - halfHeight,
      bottom: center.y + halfHeight,
    };
  } else {
    const halfGap = usableHeight * document.settings.symmetrySpacing / 2;
    const halfHeight = Math.max(document.height * 0.05, Math.min(
      center.y - halfGap - fullRegion.top,
      fullRegion.bottom - (center.y + halfGap),
    ));
    const halfWidth = Math.max(document.width * 0.05, Math.min(center.x - fullRegion.left, fullRegion.right - center.x));
    sourceRegion = {
      left: center.x - halfWidth,
      right: center.x + halfWidth,
      top: center.y - halfGap - halfHeight,
      bottom: center.y - halfGap - document.height * 0.012,
    };
  }
  const sourceDesign = fitDesignToRegion(design, sourceRegion);
  const mirroredPaths = sourceDesign.paths.map((path) => rotatePathAroundPoint(path, center));
  return { paths: [...sourceDesign.paths, ...mirroredPaths] };
}

export function generateScrollDesign(document: CarvingDocument): ScrollDesign {
  const { path: primary, backboneCurveCount } = makePrimary(document);
  const rootBranches = [
    ...makeBranches(document, primary, backboneCurveCount),
    ...makeManualBranches(document, primary, backboneCurveCount),
  ];
  const paths = [
    primary,
    ...makeHierarchy(document, primary, backboneCurveCount, rootBranches),
  ];
  let layout: ScrollDesign;
  if (document.settings.symmetry === "horizontal") {
    layout = createHorizontalSymmetry({ paths }, document);
  } else if (document.settings.symmetry === "vertical") {
    layout = createVerticalSymmetry({ paths }, document);
  } else if (document.settings.symmetry === "point") {
    layout = createPointSymmetry({ paths }, document);
  } else {
    layout = fitDesignToRegion({ paths }, documentFitRegion(document));
  }
  return generateOrnaments(layout, document);
}
