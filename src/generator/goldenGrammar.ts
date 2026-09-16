import type { CarvingDocument, OrnamentShape, Point, ScrollDesign } from "../types";
import { LONG_ACANTHUS_LEAF } from "./motifTemplates";

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_SPIRAL_RATE = 2 * Math.log(PHI) / Math.PI;
const GOLDEN_RATIOS = [1, 1 / PHI, 1 / PHI ** 2, 1 / PHI ** 3];

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount });
const magnitude = (point: Point): number => Math.hypot(point.x, point.y);
const normalize = (point: Point): Point => {
  const length = magnitude(point) || 1;
  return scale(point, 1 / length);
};
const perpendicular = (point: Point): Point => ({ x: -point.y, y: point.x });
const rotate = (point: Point, angle: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});
const distance = (a: Point, b: Point): number => magnitude(subtract(a, b));
const rounded = (value: number): number => Number(value.toFixed(4));

function polylineLength(points: Point[]): number {
  return points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);
}

function smoothPath(points: Point[], closed = false): string {
  if (points.length < 2) return "";
  const commands = [`M ${rounded(points[0].x)} ${rounded(points[0].y)}`];
  const lastIndex = points.length - 1;
  const segmentCount = closed ? points.length : lastIndex;
  for (let index = 0; index < segmentCount; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const previous = points[index === 0 ? (closed ? lastIndex : 0) : index - 1];
    const afterIndex = index + 2;
    const after = points[afterIndex > lastIndex ? (closed ? afterIndex % points.length : lastIndex) : afterIndex];
    const control1 = add(current, scale(subtract(next, previous), 1 / 6));
    const control2 = subtract(next, scale(subtract(after, current), 1 / 6));
    commands.push(`C ${rounded(control1.x)} ${rounded(control1.y)} ${rounded(control2.x)} ${rounded(control2.y)} ${rounded(next.x)} ${rounded(next.y)}`);
  }
  if (closed) commands.push("Z");
  return commands.join(" ");
}

function ornament(id: string, role: OrnamentShape["role"], points: Point[], closed = false): OrnamentShape {
  return { id, role, points, closed, pathData: smoothPath(points, closed) };
}

function goldenSpiral(center: Point, start: Point, turns: number, count = 96): Point[] {
  const startVector = subtract(start, center);
  const startRadius = magnitude(startVector);
  const startAngle = Math.atan2(startVector.y, startVector.x);
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const angleTravel = Math.PI * 2 * turns * progress;
    const angle = startAngle - angleTravel;
    const radius = startRadius * Math.exp(-GOLDEN_SPIRAL_RATE * angleTravel);
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}

function frameAt(points: Point[], progress: number): { point: Point; tangent: Point } {
  const clamped = clamp(progress, 0, 0.99999);
  const scaledIndex = clamped * (points.length - 1);
  const index = Math.floor(scaledIndex);
  const amount = scaledIndex - index;
  const point = add(points[index], scale(subtract(points[index + 1], points[index]), amount));
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 2)];
  return { point, tangent: normalize(subtract(after, before)) };
}

function ribbonOutline(centerline: Point[], width: number): Point[] {
  const left: Point[] = [];
  const right: Point[] = [];
  centerline.forEach((point, index) => {
    const before = centerline[Math.max(0, index - 1)];
    const after = centerline[Math.min(centerline.length - 1, index + 1)];
    const normal = perpendicular(normalize(subtract(after, before)));
    const progress = index / (centerline.length - 1);
    // Every ribbon grows from a pointed root and resolves to a pointed tip.
    // The broad middle is what gives the scroll its carved, leaf-like mass;
    // zero-width ends prevent the rectangular caps and transverse seams that
    // appeared when independently closed ribbons met.
    const rootEnvelope = Math.sin(Math.PI * 0.5 * clamp(progress / 0.11, 0, 1));
    const tipEnvelope = Math.sin(Math.PI * 0.5 * clamp((1 - progress) / 0.14, 0, 1));
    const bodyTaper = 0.5 + 0.5 * (1 - progress) ** 0.42;
    const halfWidth = width * rootEnvelope * tipEnvelope * bodyTaper;
    left.push(add(point, scale(normal, halfWidth)));
    right.push(add(point, scale(normal, -halfWidth)));
  });
  return [...left, ...right.reverse()];
}

function similarityCopy(
  source: Point[],
  attachment: { point: Point; tangent: Point },
  ratio: number,
  mirror: number,
): Point[] {
  const sourceOrigin = source[0];
  const sourceTangent = normalize(subtract(source[1], source[0]));
  const sourceNormal = perpendicular(sourceTangent);
  const targetNormal = perpendicular(attachment.tangent);
  return source.map((point) => {
    const relative = subtract(point, sourceOrigin);
    const along = relative.x * sourceTangent.x + relative.y * sourceTangent.y;
    const across = (relative.x * sourceNormal.x + relative.y * sourceNormal.y) * mirror;
    return add(
      attachment.point,
      add(scale(attachment.tangent, along * ratio), scale(targetNormal, across * ratio)),
    );
  });
}

interface OccupiedScroll {
  points: Point[];
  halfWidth: number;
}

function placementScore(
  points: Point[],
  candidateHalfWidth: number,
  center: Point,
  limits: { left: number; right: number; top: number; bottom: number },
  occupied: OccupiedScroll[],
): number {
  const padding = candidateHalfWidth * 1.1;
  const outsidePenalty = points.reduce((penalty, point) => penalty + (
    point.x < limits.left + padding || point.x > limits.right - padding || point.y < limits.top + padding || point.y > limits.bottom - padding ? 1000 : 0
  ), 0);
  const interiorScore = points.reduce((total, point) => total + distance(point, center), 0) / points.length * 0.08;
  const sampled = points.slice(Math.floor(points.length * 0.2)).filter((_, index) => index % 3 === 0);
  const clearancePenalty = occupied.reduce((total, occupiedScroll) => {
    const obstacle = occupiedScroll.points.filter((_, index) => index % 4 === 0);
    const requiredClearance = candidateHalfWidth + occupiedScroll.halfWidth + (limits.bottom - limits.top) * 0.018;
    return total + sampled.reduce((pathPenalty, point) => {
      const nearest = obstacle.reduce((minimum, candidate) => Math.min(minimum, distance(point, candidate)), Number.POSITIVE_INFINITY);
      if (nearest < requiredClearance * 0.72) return pathPenalty + 90;
      if (nearest < requiredClearance) return pathPenalty + 18;
      if (nearest < requiredClearance * 1.35) return pathPenalty + 3;
      return pathPenalty;
    }, 0);
  }, 0);
  return outsidePenalty + clearancePenalty + interiorScore;
}

function chooseChild(
  source: Point[],
  parent: Point[],
  ratio: number,
  preferredProgress: number,
  hostHalfWidth: number,
  candidateHalfWidth: number,
  center: Point,
  limits: { left: number; right: number; top: number; bottom: number },
  occupied: OccupiedScroll[],
): Point[] {
  const candidates = [-0.08, -0.04, 0, 0.04, 0.08].flatMap((progressOffset) => {
    const attachment = frameAt(parent, preferredProgress + progressOffset);
    const normal = perpendicular(attachment.tangent);
    return [1, -1].map((mirror) => similarityCopy(source, {
      point: add(attachment.point, scale(normal, hostHalfWidth * mirror * 0.9)),
      tangent: attachment.tangent,
    }, ratio, mirror));
  });
  return candidates.reduce((best, candidate) =>
    placementScore(candidate, candidateHalfWidth, center, limits, occupied) < placementScore(best, candidateHalfWidth, center, limits, occupied) ? candidate : best
  );
}

function sGuide(root: Point, tangent: Point, towardInterior: Point, length: number, side: number): Point[] {
  const direction = normalize(add(scale(tangent, 0.38), scale(towardInterior, 0.62)));
  const normal = perpendicular(direction);
  return Array.from({ length: 32 }, (_, index) => {
    const progress = index / 31;
    const along = length * progress;
    const arch = Math.sin(Math.PI * progress);
    const reversal = Math.sin(Math.PI * 2 * progress);
    const transverse = side * length * (0.31 * arch - 0.12 * reversal) * (1 - progress * 0.22);
    return add(root, add(scale(direction, along), scale(normal, transverse)));
  });
}

function guideFrame(points: Point[], progress: number): { point: Point; tangent: Point; totalLength: number } {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  const totalLength = cumulative[cumulative.length - 1] || 1;
  if (progress >= 1) {
    const tangent = normalize(subtract(points[points.length - 1], points[points.length - 2]));
    return { point: add(points[points.length - 1], scale(tangent, (progress - 1) * totalLength)), tangent, totalLength };
  }
  const target = clamp(progress, 0, 1) * totalLength;
  let index = 1;
  while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
  const segmentLength = Math.max(0.000001, cumulative[index] - cumulative[index - 1]);
  const amount = (target - cumulative[index - 1]) / segmentLength;
  return {
    point: add(points[index - 1], scale(subtract(points[index], points[index - 1]), amount)),
    tangent: normalize(subtract(points[index], points[index - 1])),
    totalLength,
  };
}

function warpTemplatePath(
  path: typeof LONG_ACANTHUS_LEAF["outline"],
  guide: Point[],
  width: number,
  mirror: boolean,
): { pathData: string; points: Point[] } {
  const transform = (local: Point): Point => {
    const frame = guideFrame(guide, local.x);
    const normal = perpendicular(frame.tangent);
    return add(frame.point, scale(normal, local.y * width * (mirror ? -1 : 1)));
  };
  const start = transform(path.start);
  const points = [start];
  const commands = [`M ${rounded(start.x)} ${rounded(start.y)}`];
  path.segments.forEach((segment) => {
    const control1 = transform(segment.control1);
    const control2 = transform(segment.control2);
    const end = transform(segment.end);
    points.push(control1, control2, end);
    commands.push(`C ${rounded(control1.x)} ${rounded(control1.y)} ${rounded(control2.x)} ${rounded(control2.y)} ${rounded(end.x)} ${rounded(end.y)}`);
  });
  if (path.closed) commands.push("Z");
  return { pathData: commands.join(" "), points };
}

function warpedMotif(
  id: string,
  template: typeof LONG_ACANTHUS_LEAF,
  guide: Point[],
  width: number,
  mirror: boolean,
  role: "leaf-major" | "leaf-supporting",
): OrnamentShape[] {
  const outline = warpTemplatePath(template.outline, guide, width, mirror);
  const rib = warpTemplatePath(template.rib, guide, width, mirror);
  return [{ id, role, points: outline.points, closed: true, pathData: outline.pathData }, {
    id: `${id}-rib`, role: "leaf-rib", points: rib.points, closed: false, pathData: rib.pathData,
  }];
}

export function generateGoldenGrammarStudy(document: CarvingDocument): ScrollDesign {
  const size = Math.max(1, document.height - document.margin * 2);
  const left = document.width * 0.5 - document.height * 0.5 + document.margin;
  const top = document.margin;
  const point = (x: number, y: number): Point => ({ x: left + x * size, y: top + y * size });
  const center = point(0.45, 0.51);
  const origin = point(0.88, 0.16);
  const limits = { left, right: left + size, top, bottom: top + size };
  const turns = clamp(document.settings.studySpiralTurns ?? 1.1, 0.88, 1.38);
  const familyCount = Math.max(1, Math.min(4, Math.round(document.settings.studyLeafFamilies ?? 3)));
  const insideBalance = clamp(document.settings.studyInsideBalance ?? 0.55, 0.15, 0.9);
  const parent = goldenSpiral(center, origin, turns);
  const scrolls: Point[][] = [parent];
  const scrollHalfWidths = [size * 0.032];
  const occupied: OccupiedScroll[] = [{ points: parent, halfWidth: scrollHalfWidths[0] }];
  // Each generation grows from the preceding generation. This produces a
  // readable hierarchy instead of three unrelated spirals competing for the
  // same center.
  const parentAttachments = [0.38, 0.46, 0.52];

  for (let index = 1; index < GOLDEN_RATIOS.length; index += 1) {
    const host = scrolls[index - 1];
    const candidateHalfWidth = size * 0.032 * GOLDEN_RATIOS[index] ** 0.55;
    const child = chooseChild(
      parent,
      host,
      GOLDEN_RATIOS[index],
      parentAttachments[index - 1],
      scrollHalfWidths[index - 1],
      candidateHalfWidth,
      center,
      limits,
      occupied,
    );
    scrolls.push(child);
    scrollHalfWidths.push(candidateHalfWidth);
    occupied.push({ points: child, halfWidth: candidateHalfWidth });
  }

  const ornaments: OrnamentShape[] = [];
  scrolls.forEach((scroll, index) => {
    const ratio = GOLDEN_RATIOS[index];
    ornaments.push(ornament(
      index === 0 ? "golden-parent-scroll" : `golden-child-scroll-${index}`,
      "stem-ribbon",
      ribbonOutline(scroll, scrollHalfWidths[index]),
      true,
    ));
    ornaments.push(ornament(
      index === 0 ? "golden-guide-parent" : `golden-guide-child-${index}`,
      "leaf-rib",
      scroll,
      false,
    ));
  });

  // Acanthus tiers share one origin and open as a fan. Their lengths use the
  // carver's established 100 / 66 / 33 cadence; the spiral hierarchy above
  // retains the exact golden similarity ratios.
  const tierRatios = [1, 2 / 3, 1 / 3, 0.22];
  const tierAngles = [-0.82, -0.12, 0.58, 0.9];
  const leafFrame = frameAt(parent, 0.075);
  const towardInterior = normalize(subtract(center, leafFrame.point));
  const root = add(leafFrame.point, scale(towardInterior, size * 0.018));
  const baseDirection = normalize(add(scale(leafFrame.tangent, 0.28), scale(towardInterior, 0.72)));
  const normalizedMotifScale = clamp((document.settings.leafScale - 0.12) / (0.65 - 0.12), 0, 1);
  const openingLength = distance(root, center) * 1.04;
  // Even at the lowest UI setting the primary leaf must still occupy enough
  // of the spiral opening to read as structure. The slider now adjusts within
  // an ornamental range instead of being allowed to shrink the family away.
  const primaryLeafLength = clamp(
    size * (0.29 + normalizedMotifScale * 0.15),
    size * 0.28,
    Math.max(size * 0.3, openingLength),
  );

  for (let index = 0; index < familyCount; index += 1) {
    const ratio = tierRatios[index];
    const tierDirection = rotate(baseDirection, tierAngles[index]);
    const guide = sGuide(
      root,
      tierDirection,
      tierDirection,
      primaryLeafLength * ratio,
      1,
    );
    ornaments.push(...warpedMotif(
      index === 0 ? "golden-leaf-100" : `golden-leaf-${Math.round(ratio * 100)}`,
      LONG_ACANTHUS_LEAF,
      guide,
      polylineLength(guide) * (0.23 + insideBalance * 0.055),
      false,
      index === 0 ? "leaf-major" : "leaf-supporting",
    ));
  }

  return { paths: [], ornaments };
}

export { GOLDEN_RATIOS };
