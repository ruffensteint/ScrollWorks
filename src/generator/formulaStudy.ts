import type { CarvingDocument, OrnamentShape, Point, ScrollDesign } from "../types";
import { COMMA_LEAF, instantiateMotif, LONG_ACANTHUS_LEAF } from "./motifTemplates";

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount });
const length = (point: Point): number => Math.hypot(point.x, point.y);
const normalize = (point: Point): Point => {
  const magnitude = length(point) || 1;
  return scale(point, 1 / magnitude);
};
const rounded = (value: number): number => Number(value.toFixed(4));

function smoothPath(points: Point[], closed = false): string {
  if (points.length < 2) return "";
  const commands = [`M ${rounded(points[0].x)} ${rounded(points[0].y)}`];
  const lastIndex = points.length - 1;
  const segmentCount = closed ? points.length : lastIndex;
  for (let index = 0; index < segmentCount; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const previous = points[index === 0 ? (closed ? lastIndex : 0) : index - 1];
    const after = points[index + 2 > lastIndex ? (closed ? (index + 2) % points.length : lastIndex) : index + 2];
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

function spiralPoints(center: Point, start: Point, turns: number, endRadius: number, count = 72): Point[] {
  const startVector = subtract(start, center);
  const startRadius = length(startVector);
  const startAngle = Math.atan2(startVector.y, startVector.x);
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const eased = progress * progress * (3 - 2 * progress);
    const radius = startRadius + (endRadius - startRadius) * eased;
    const angle = startAngle - Math.PI * 2 * turns * progress;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}

function ribbonOutline(centerline: Point[], width: number): Point[] {
  const left: Point[] = [];
  const right: Point[] = [];
  centerline.forEach((point, index) => {
    const before = centerline[Math.max(0, index - 1)];
    const after = centerline[Math.min(centerline.length - 1, index + 1)];
    const tangent = normalize(subtract(after, before));
    const normal = { x: -tangent.y, y: tangent.x };
    const progress = index / (centerline.length - 1);
    const halfWidth = width * (0.38 + 0.62 * (1 - progress) ** 0.7);
    left.push(add(point, scale(normal, halfWidth)));
    right.push(add(point, scale(normal, -halfWidth)));
  });
  return [...left, ...right.reverse()];
}

function pathFrame(points: Point[], progress: number): { point: Point; tangent: Point } {
  const scaled = clamp(progress, 0, 0.9999) * (points.length - 1);
  const index = Math.floor(scaled);
  const amount = scaled - index;
  const point = add(points[index], scale(subtract(points[index + 1], points[index]), amount));
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 2)];
  return { point, tangent: normalize(subtract(after, before)) };
}

function progressiveCurl(start: Point, tangent: Point, radius: number, direction: number, turns: number): Point[] {
  const count = 42;
  const startHeading = Math.atan2(tangent.y, tangent.x);
  let point = start;
  let heading = startHeading;
  const points = [start];
  const targetTurn = Math.PI * 2 * turns;
  const initialCurvature = 0.52 / radius;
  const finalCurvature = 1.85 / radius;
  const travel = targetTurn / ((initialCurvature + finalCurvature) / 2);
  const step = travel / count;
  for (let index = 0; index < count; index += 1) {
    const progress = (index + 0.5) / count;
    const eased = progress * progress * (3 - 2 * progress);
    const curvature = initialCurvature + (finalCurvature - initialCurvature) * eased;
    const turn = curvature * step * direction;
    const averageHeading = heading + turn * 0.5;
    point = {
      x: point.x + Math.cos(averageHeading) * step,
      y: point.y + Math.sin(averageHeading) * step,
    };
    points.push(point);
    heading += turn;
  }
  return points;
}

function circlePath(center: Point, radius: number): string {
  return `M ${rounded(center.x + radius)} ${rounded(center.y)} A ${rounded(radius)} ${rounded(radius)} 0 1 0 ${rounded(center.x - radius)} ${rounded(center.y)} A ${rounded(radius)} ${rounded(radius)} 0 1 0 ${rounded(center.x + radius)} ${rounded(center.y)} Z`;
}

export function generateFormulaStudy(document: CarvingDocument): ScrollDesign {
  const size = Math.max(1, document.height - document.margin * 2);
  const left = document.width * 0.5 - document.height * 0.5 + document.margin;
  const top = document.margin;
  const point = (x: number, y: number): Point => ({ x: left + x * size, y: top + y * size });
  const origin = point(0.87, 0.15);
  const center = point(0.47, 0.49);
  const turns = clamp(document.settings.studySpiralTurns ?? 1.1, 0.85, 1.5);
  const insideBalance = clamp(document.settings.studyInsideBalance ?? 0.55, 0.15, 0.9);
  const familyCount = Math.max(1, Math.min(4, Math.round(document.settings.studyLeafFamilies ?? 3)));
  const centerline = spiralPoints(center, origin, turns, size * 0.045, 84);
  const ornaments: OrnamentShape[] = [
    ornament("formula-primary-c-ribbon", "stem-ribbon", ribbonOutline(centerline, size * 0.034), true),
  ];

  const towardCenter = normalize(subtract(center, origin));
  const baseAngle = Math.atan2(towardCenter.y, towardCenter.x);
  const fan = 0.2 + insideBalance * 0.28;
  const branchSpecs = [
    { radius: 0.145, turns: 0.82, angle: -fan },
    { radius: 0.108, turns: 0.76, angle: 0 },
    { radius: 0.078, turns: 0.7, angle: fan },
    { radius: 0.055, turns: 0.64, angle: fan * 1.65 },
  ];
  const branches = branchSpecs.map((spec, index) => {
    const angle = baseAngle + spec.angle;
    const rootOffset = scale({ x: -towardCenter.y, y: towardCenter.x }, size * (index - 1.25) * 0.008);
    const curl = progressiveCurl(
      add(origin, rootOffset),
      { x: Math.cos(angle), y: Math.sin(angle) },
      size * spec.radius,
      1,
      spec.turns,
    );
    ornaments.push(ornament(`formula-arch-${index + 1}`, "leaf-supporting", curl, false));
    return curl;
  });

  for (let index = 0; index < familyCount; index += 1) {
    const frame = pathFrame(branches[index], 0.4 + index * 0.075);
    const angle = Math.atan2(frame.tangent.y, frame.tangent.x);
    const scaleDown = [1, 0.76, 0.56, 0.4][index];
    const motifLength = size * document.settings.leafScale * 0.66 * scaleDown;
    ornaments.push(...instantiateMotif(index % 2 === 0 ? LONG_ACANTHUS_LEAF : COMMA_LEAF, {
      id: `formula-s-cut-${index + 1}`,
      origin: frame.point,
      angle,
      length: motifLength,
      width: motifLength * (0.58 + insideBalance * 0.22),
      bend: -(0.5 + insideBalance * 0.5),
      mirror: false,
      role: index === 0 ? "leaf-major" : "leaf-supporting",
    }));
  }

  const originRadius = size * 0.026;
  ornaments.push({
    id: "formula-origin-ring",
    role: "leaf-rib",
    points: [origin],
    closed: true,
    pathData: circlePath(origin, originRadius),
  });
  ornaments.push({
    id: "formula-origin-dot",
    role: "negative-space",
    points: [origin],
    closed: true,
    pathData: circlePath(origin, originRadius * 0.28),
  });
  return { paths: [], ornaments };
}
