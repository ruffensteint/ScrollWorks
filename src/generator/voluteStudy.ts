import type { CarvingDocument, OrnamentShape, Point, ScrollDesign } from "../types";
import { LONG_ACANTHUS_LEAF, instantiateMotif } from "./motifTemplates";

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount });
const length = (point: Point): number => Math.hypot(point.x, point.y);
const normalize = (point: Point): Point => {
  const amount = length(point) || 1;
  return scale(point, 1 / amount);
};
const perpendicular = (point: Point): Point => ({ x: -point.y, y: point.x });
const rounded = (value: number): number => Number(value.toFixed(4));

function smoothPath(points: Point[], closed = false): string {
  if (points.length < 2) return "";
  const commands = [`M ${rounded(points[0].x)} ${rounded(points[0].y)}`];
  const last = points.length - 1;
  const count = closed ? points.length : last;
  for (let index = 0; index < count; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const previous = points[index === 0 ? (closed ? last : 0) : index - 1];
    const afterIndex = index + 2;
    const after = points[afterIndex > last ? (closed ? afterIndex % points.length : last) : afterIndex];
    const control1 = add(current, scale(subtract(next, previous), 1 / 6));
    const control2 = subtract(next, scale(subtract(after, current), 1 / 6));
    commands.push(`C ${rounded(control1.x)} ${rounded(control1.y)} ${rounded(control2.x)} ${rounded(control2.y)} ${rounded(next.x)} ${rounded(next.y)}`);
  }
  if (closed) commands.push("Z");
  return commands.join(" ");
}

function variableRibbon(centerline: Point[], maximumWidth: number): Point[] {
  const left: Point[] = [];
  const right: Point[] = [];
  centerline.forEach((point, index) => {
    const progress = index / (centerline.length - 1);
    const before = centerline[Math.max(0, index - 1)];
    const after = centerline[Math.min(centerline.length - 1, index + 1)];
    const normal = perpendicular(normalize(subtract(after, before)));
    const endEnvelope = Math.sin(Math.PI * clamp(progress, 0, 1)) ** 0.38;
    const belly = 0.52 + 0.48 * Math.sin(Math.PI * clamp((progress - 0.08) / 0.78, 0, 1)) ** 0.7;
    const width = maximumWidth * endEnvelope * belly;
    left.push(add(point, scale(normal, width)));
    right.push(add(point, scale(normal, -width)));
  });
  return [...left, ...right.reverse()];
}

function closedShape(id: string, role: OrnamentShape["role"], points: Point[]): OrnamentShape {
  return { id, role, points, closed: true, pathData: smoothPath(points, true) };
}

function openCubic(id: string, role: OrnamentShape["role"], start: Point, segments: Array<{ c1: Point; c2: Point; end: Point }>): OrnamentShape {
  const points = [start];
  const commands = [`M ${rounded(start.x)} ${rounded(start.y)}`];
  segments.forEach((segment) => {
    points.push(segment.c1, segment.c2, segment.end);
    commands.push(`C ${rounded(segment.c1.x)} ${rounded(segment.c1.y)} ${rounded(segment.c2.x)} ${rounded(segment.c2.y)} ${rounded(segment.end.x)} ${rounded(segment.end.y)}`);
  });
  return { id, role, points, closed: false, pathData: commands.join(" ") };
}

export function generateVoluteStudy(document: CarvingDocument): ScrollDesign {
  const size = Math.max(1, document.height - document.margin * 2);
  const left = document.width * 0.5 - document.height * 0.5 + document.margin;
  const top = document.margin;
  const point = (x: number, y: number): Point => ({ x: left + x * size, y: top + y * size });
  const turns = clamp((document.settings.studySpiralTurns - 0.85) / 0.65, 0, 1);
  const inside = clamp(document.settings.studyInsideBalance, 0.15, 0.9);
  const origin = point(0.84, 0.18);

  // One continuous volute. The final points close inward, but no descendant is
  // represented as another ribbon; subdivision is carried by the cuts below.
  const centerline = [
    point(0.84, 0.18), point(0.74, 0.115), point(0.58, 0.095), point(0.40, 0.15),
    point(0.25, 0.265), point(0.16, 0.43), point(0.165, 0.61), point(0.27, 0.765),
    point(0.44, 0.825), point(0.60, 0.765), point(0.69, 0.635), point(0.675, 0.50),
    point(0.57, 0.415), point(0.47 - turns * 0.018, 0.455 + turns * 0.01),
  ];

  const primaryLength = size * (0.38 + clamp((document.settings.leafScale - 0.12) / 0.53, 0, 1) * 0.08);
  const fan = 0.36 + inside * 0.28;
  const leafPlacements = [
    { id: "volute-leaf-100", ratio: 1, angle: 2.42, width: 0.245, bend: 0.22, role: "leaf-major" as const },
    { id: "volute-leaf-66", ratio: 2 / 3, angle: 2.42 + fan * 0.72, width: 0.19, bend: 0.12, role: "leaf-supporting" as const },
    { id: "volute-leaf-33", ratio: 1 / 3, angle: 2.42 + fan * 1.38, width: 0.13, bend: 0.04, role: "leaf-supporting" as const },
  ].slice(0, Math.max(1, Math.min(3, Math.round(document.settings.studyLeafFamilies))));

  // Leaves are rendered before the volute. The main mass therefore masks their
  // shared root and they read as growth from one origin instead of pasted icons.
  const leaves = leafPlacements.flatMap((placement) => instantiateMotif(LONG_ACANTHUS_LEAF, {
    id: placement.id,
    origin,
    angle: placement.angle,
    length: primaryLength * placement.ratio,
    width: size * placement.width * placement.ratio ** 0.45,
    bend: placement.bend,
    mirror: false,
    role: placement.role,
  })).filter((shape) => !shape.id.endsWith("-rib"));

  const stemWidth = size * clamp(document.settings.stemWidth, 0.02, 0.052);
  const ornaments: OrnamentShape[] = [
    closedShape("volute-dominant-mass", "stem-ribbon", variableRibbon(centerline, stemWidth)),
    ...leaves,
    // The three basic cuts: a long C subdivision, an arch, and a reversing
    // S-cut. They share the marked origin and divide the single mass.
    openCubic("volute-c-cut", "leaf-rib", point(0.815, 0.192), [
      { c1: point(0.73, 0.22), c2: point(0.61, 0.31), end: point(0.535, 0.43) },
    ]),
    openCubic("volute-arch-cut", "leaf-rib", point(0.818, 0.187), [
      { c1: point(0.74, 0.16), c2: point(0.65, 0.18), end: point(0.585, 0.27) },
    ]),
    openCubic("volute-s-cut", "leaf-rib", point(0.813, 0.20), [
      { c1: point(0.76, 0.18), c2: point(0.71, 0.19), end: point(0.685, 0.225) },
      { c1: point(0.665, 0.255), c2: point(0.69, 0.28), end: point(0.715, 0.265) },
    ]),
    openCubic("volute-negative-space-curl", "leaf-supporting", point(0.56, 0.66), [
      { c1: point(0.44, 0.72), c2: point(0.36, 0.63), end: point(0.405, 0.535) },
      { c1: point(0.45, 0.445), c2: point(0.58, 0.45), end: point(0.60, 0.525) },
      { c1: point(0.615, 0.585), c2: point(0.56, 0.61), end: point(0.53, 0.575) },
    ]),
  ];

  return { paths: [], ornaments };
}
