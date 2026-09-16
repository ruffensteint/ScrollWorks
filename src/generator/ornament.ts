import type { CarvingDocument, CubicCurve, OrnamentShape, Point, ScrollDesign, ScrollPath } from "../types";
import { COMMA_LEAF, instantiateMotif, instantiateNegativePocket, LONG_ACANTHUS_LEAF } from "./motifTemplates";
import { between, createRandom } from "./random";

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount });
const normalize = (point: Point): Point => {
  const magnitude = Math.hypot(point.x, point.y) || 1;
  return scale(point, 1 / magnitude);
};
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const normal = (tangent: Point, side = 1): Point => ({ x: -tangent.y * side, y: tangent.x * side });
const rotate = (point: Point, angle: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});

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

function pointAndTangent(curves: CubicCurve[], progress: number): { point: Point; tangent: Point } {
  const scaled = Math.min(0.999999, Math.max(0, progress)) * curves.length;
  const index = Math.min(curves.length - 1, Math.floor(scaled));
  const t = scaled - index;
  return { point: pointOnCurve(curves[index], t), tangent: tangentOnCurve(curves[index], t) };
}

function ribbonFromPath(path: ScrollPath, document: CarvingDocument): OrnamentShape {
  const samples: Array<{ point: Point; tangent: Point }> = [];
  path.curves.forEach((curve, curveIndex) => {
    const count = 10;
    for (let step = curveIndex === 0 ? 0 : 1; step <= count; step += 1) {
      const t = step / count;
      samples.push({ point: pointOnCurve(curve, t), tangent: tangentOnCurve(curve, t) });
    }
  });
  const generation = path.generation ?? 1;
  const hierarchyRatio = path.hierarchyRatio ?? ([1, 0.66, 0.33][generation - 1] ?? 0.33);
  const hierarchyTaper = path.role === "primary" ? 1 : 0.62 * hierarchyRatio;
  const baseWidth = document.height * document.settings.stemWidth * hierarchyTaper;
  const left: Point[] = [];
  const right: Point[] = [];
  samples.forEach((sample, index) => {
    const progress = index / Math.max(1, samples.length - 1);
    const endTaper = Math.pow(Math.max(0, Math.sin(Math.PI * progress)), 0.34);
    const directionalTaper = path.role === "primary" ? 1 - progress * 0.42 : 1 - progress * 0.58;
    const halfWidth = baseWidth * endTaper * directionalTaper;
    const offset = scale(normal(sample.tangent), halfWidth);
    left.push(add(sample.point, offset));
    right.push(subtract(sample.point, offset));
  });
  return { id: `ribbon-${path.id}`, role: "stem-ribbon", points: [...left, ...right.reverse()], closed: true };
}

interface LeafOptions {
  id: string;
  base: Point;
  tangent: Point;
  side: number;
  length: number;
  lobes: number;
  lobeDepth: number;
  hook: number;
  arc: number;
  belly: number;
  role: "leaf-major" | "leaf-supporting";
}

const pathNumber = (value: number) => Number(value.toFixed(4));

function cubicCommand(control1: Point, control2: Point, end: Point): string {
  return `C ${pathNumber(control1.x)} ${pathNumber(control1.y)} ${pathNumber(control2.x)} ${pathNumber(control2.y)} ${pathNumber(end.x)} ${pathNumber(end.y)}`;
}

function leafShapes(options: LeafOptions): OrnamentShape[] {
  const flow = normalize(options.tangent);
  const away = normal(flow, options.side);
  const length = options.length;
  const hook = Math.min(1.2, options.hook);
  const arc = options.arc;
  const base = options.base;
  const tip = add(base, add(
    scale(flow, length * (0.8 - hook * 0.08)),
    scale(away, length * (0.38 + arc * 0.22)),
  ));

  // First construct the gesture of the leaf. Fullness is added later in the
  // leaf's local frame, rather than perpendicular to the parent stem.
  const centerline: CubicCurve = {
    start: base,
    control1: add(base, add(
      scale(flow, length * 0.4),
      scale(away, length * (0.035 + arc * 0.025)),
    )),
    control2: add(base, add(
      scale(flow, length * (0.88 + arc * 0.05)),
      scale(away, length * (0.26 + arc * 0.2)),
    )),
    end: tip,
  };

  const leafAxis = normalize(subtract(tip, base));
  let widthAxis = normal(leafAxis);
  if (dot(widthAxis, away) < 0) widthAxis = scale(widthAxis, -1);
  const halfBelly = length * (0.065 + Math.min(1.8, options.belly) * 0.13);

  const outerControl1 = add(centerline.control1, scale(widthAxis, halfBelly * 0.58));
  const outerControl2 = add(centerline.control2, scale(widthAxis, halfBelly));
  const commands = [
    `M ${pathNumber(base.x)} ${pathNumber(base.y)}`,
    cubicCommand(outerControl1, outerControl2, tip),
  ];
  const geometryPoints: Point[] = [base, outerControl1, outerControl2, tip];

  if (options.lobes <= 0) {
    const innerControl1 = subtract(centerline.control2, scale(widthAxis, halfBelly));
    const innerControl2 = subtract(centerline.control1, scale(widthAxis, halfBelly * 0.58));
    commands.push(cubicCommand(innerControl1, innerControl2, base));
    geometryPoints.push(innerControl1, innerControl2);
  } else {
    const firstCenter = pointOnCurve(centerline, 0.46);
    const firstTangent = tangentOnCurve(centerline, 0.46);
    const firstLobe = subtract(
      firstCenter,
      scale(widthAxis, halfBelly * (0.16 + options.lobeDepth * 0.42)),
    );
    const curlControl1 = subtract(centerline.control2, scale(widthAxis, halfBelly));
    const curlControl2 = add(firstLobe, scale(firstTangent, length * (0.1 + hook * 0.035)));
    commands.push(cubicCommand(curlControl1, curlControl2, firstLobe));
    geometryPoints.push(curlControl1, curlControl2, firstLobe);

    if (options.lobes > 1) {
      const secondCenter = pointOnCurve(centerline, 0.24);
      const secondTangent = tangentOnCurve(centerline, 0.24);
      const secondLobe = subtract(
        secondCenter,
        scale(widthAxis, halfBelly * (0.1 + options.lobeDepth * 0.27)),
      );
      const lobeControl1 = subtract(firstLobe, add(
        scale(firstTangent, length * 0.13),
        scale(widthAxis, halfBelly * 0.32),
      ));
      const lobeControl2 = add(secondLobe, scale(secondTangent, length * 0.08));
      commands.push(cubicCommand(lobeControl1, lobeControl2, secondLobe));
      geometryPoints.push(lobeControl1, lobeControl2, secondLobe);
      const baseControl1 = subtract(secondLobe, add(
        scale(secondTangent, length * 0.1),
        scale(widthAxis, halfBelly * 0.18),
      ));
      const baseControl2 = subtract(centerline.control1, scale(widthAxis, halfBelly * 0.58));
      commands.push(cubicCommand(baseControl1, baseControl2, base));
      geometryPoints.push(baseControl1, baseControl2);
    } else {
      const baseControl1 = subtract(firstLobe, add(
        scale(firstTangent, length * 0.17),
        scale(widthAxis, halfBelly * 0.26),
      ));
      const baseControl2 = subtract(centerline.control1, scale(widthAxis, halfBelly * 0.58));
      commands.push(cubicCommand(baseControl1, baseControl2, base));
      geometryPoints.push(baseControl1, baseControl2);
    }
  }
  commands.push("Z");

  const outline: OrnamentShape = {
    id: options.id,
    role: options.role,
    points: geometryPoints,
    closed: true,
    pathData: commands.join(" "),
  };
  const ribShape: OrnamentShape = {
    id: `${options.id}-rib`,
    role: "leaf-rib",
    points: Array.from({ length: 17 }, (_, index) => pointOnCurve(centerline, 0.04 + index / 18 * 0.74)),
    closed: false,
  };
  return [outline, ribShape];
}

function shapeInside(shape: OrnamentShape, document: CarvingDocument): boolean {
  const inset = document.margin + document.height * 0.01;
  return shape.points.every((point) =>
    point.x >= inset && point.x <= document.width - inset && point.y >= inset && point.y <= document.height - inset,
  );
}

function shapeBounds(shape: OrnamentShape) {
  return shape.points.reduce((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    right: Math.max(bounds.right, point.x),
    top: Math.min(bounds.top, point.y),
    bottom: Math.max(bounds.bottom, point.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
}

function overlapsOccupied(shape: OrnamentShape, occupied: OrnamentShape[], overlapLimit = 0.18): boolean {
  const bounds = shapeBounds(shape);
  const area = Math.max(0.000001, (bounds.right - bounds.left) * (bounds.bottom - bounds.top));
  return occupied.some((other) => {
    const otherBounds = shapeBounds(other);
    const overlapWidth = Math.max(0, Math.min(bounds.right, otherBounds.right) - Math.max(bounds.left, otherBounds.left));
    const overlapHeight = Math.max(0, Math.min(bounds.bottom, otherBounds.bottom) - Math.max(bounds.top, otherBounds.top));
    const otherArea = Math.max(0.000001, (otherBounds.right - otherBounds.left) * (otherBounds.bottom - otherBounds.top));
    return overlapWidth * overlapHeight / Math.min(area, otherArea) > overlapLimit;
  });
}

function createLeafAt(
  path: ScrollPath,
  curves: CubicCurve[],
  progress: number,
  preferredSide: number,
  baseLength: number,
  role: "leaf-major" | "leaf-supporting",
  id: string,
  document: CarvingDocument,
  occupied: OrnamentShape[],
  tangentTurn = 0,
  overlapLimit = 0.18,
): OrnamentShape[] {
  const random = createRandom(document.seed, `leaf:${id.replace("-mirror", "")}`);
  const attachment = pointAndTangent(curves, progress);
  const variation = document.settings.leafVariation;
  const length = baseLength * between(random, 1 - variation * 0.28, 1 + variation * 0.28);
  const options = {
    id,
    base: attachment.point,
    tangent: rotate(attachment.tangent, tangentTurn),
    side: path.id.endsWith("-mirror") ? -preferredSide : preferredSide,
    length,
    lobes: Math.max(0, Math.min(2, Math.round(document.settings.leafLobes + between(random, -variation * 0.75, variation * 0.75)))),
    lobeDepth: document.settings.leafLobeDepth * between(random, 1 - variation * 0.18, 1 + variation * 0.18),
    hook: document.settings.leafHook * between(random, 1 - variation * 0.22, 1 + variation * 0.22),
    arc: document.settings.leafArc * between(random, 1 - variation * 0.18, 1 + variation * 0.18),
    belly: document.settings.leafBelly * between(random, 1 - variation * 0.14, 1 + variation * 0.14),
    role,
  } as LeafOptions;
  const attempts = [
    options,
    { ...options, side: -options.side, length: options.length * 0.88 },
    { ...options, length: options.length * 0.68 },
  ];
  const template = random() < 0.48 ? COMMA_LEAF : LONG_ACANTHUS_LEAF;
  for (const attempt of attempts) {
    const widthRatio = template === COMMA_LEAF ? 0.78 : 0.62;
    const shapes = instantiateMotif(template, {
      id: attempt.id,
      origin: attempt.base,
      angle: Math.atan2(-attempt.tangent.y, -attempt.tangent.x) + attempt.side * (0.12 + attempt.arc * 0.08),
      length: attempt.length * (0.9 + attempt.arc * 0.12),
      width: attempt.length * widthRatio * (0.78 + Math.min(1.8, attempt.belly) * 0.2),
      bend: attempt.side * (document.settings.leafBend ?? 0.75) * 0.8,
      mirror: attempt.side > 0,
      role: attempt.role,
    });
    if (shapeInside(shapes[0], document) && !overlapsOccupied(shapes[0], occupied, overlapLimit)) return shapes;
  }
  return [];
}

function createMotifAt(
  path: ScrollPath,
  curves: CubicCurve[],
  progress: number,
  preferredSide: number,
  baseSize: number,
  id: string,
  document: CarvingDocument,
  occupied: OrnamentShape[],
  manual?: { angleOffset: number },
  maximumTiers = 3,
): OrnamentShape[] {
  const random = createRandom(document.seed, `motif:${id.replace("-mirror", "")}`);
  const attachment = pointAndTangent(curves, progress);
  const variation = document.settings.leafVariation;
  const size = manual ? baseSize : baseSize * between(random, 1 - variation * 0.16, 1 + variation * 0.16);
  const reflected = path.id.endsWith("-mirror") && document.settings.symmetry !== "point";
  const manualAngleOffset = reflected && manual ? -manual.angleOffset : manual?.angleOffset;
  const tangentTurn = manualAngleOffset ?? between(random, -variation * 0.08, variation * 0.08);
  const side = reflected ? -preferredSide : preferredSide;
  const complexity = document.settings.leafClusterComplexity ?? 0.85;
  const tierCount = Math.min(maximumTiers, 1 + Math.min(2, Math.floor(Math.max(0, complexity) * 2.999)));
  const tierRatios = [1, 0.66, 0.33].slice(0, tierCount);
  const options = { side, size };
  const attempts = manual
    ? [options, { ...options, size: options.size * 0.82 }, { ...options, size: options.size * 0.66 }]
    : [options, { ...options, size: options.size * 0.82 }, { ...options, side: -options.side, size: options.size * 0.7 }];
  const dominantTemplate = random() < 0.38 ? COMMA_LEAF : LONG_ACANTHUS_LEAF;
  for (const attempt of attempts) {
    // Acanthus leaves visually grow back along the supporting scroll rather
    // than pointing in the spline's stored drawing direction.
    const flow = manual
      ? rotate(attachment.tangent, tangentTurn)
      : scale(rotate(attachment.tangent, tangentTurn), -1);
    const flowAngle = Math.atan2(flow.y, flow.x);
    const bellyScale = 0.8 + Math.min(1.8, document.settings.leafBelly) * 0.18;
    const fan = document.settings.leafTierFan ?? 0.4;
    const fanAngles = manual
      ? [0, -fan, -fan * 2]
      : [fan * 2 + document.settings.leafArc * 0.08, fan, -0.04];
    const tierBendRatios = [1, 0.84, 0.68];
    const placements = tierRatios.map((ratio, tierIndex) => {
      const template = tierIndex === 0 ? dominantTemplate : tierIndex === 1
        ? (dominantTemplate === COMMA_LEAF ? LONG_ACANTHUS_LEAF : COMMA_LEAF)
        : COMMA_LEAF;
      const widthRatio = template === COMMA_LEAF ? 0.76 : 0.6;
      const placement = {
        id: `${id}-tier-${Math.round(ratio * 100)}-${template.name}`,
        origin: attachment.point,
        angle: flowAngle + attempt.side * fanAngles[tierIndex],
        length: attempt.size * ratio * (template === LONG_ACANTHUS_LEAF ? 1.06 : 0.98),
        width: attempt.size * ratio * widthRatio * bellyScale,
        bend: attempt.side * (document.settings.leafBend ?? 0.75) * tierBendRatios[tierIndex],
        mirror: attempt.side > 0,
        role: (tierIndex === 0 ? "leaf-major" : "leaf-supporting") as "leaf-major" | "leaf-supporting",
      };
      return { ratio, template, placement };
    });
    const members = placements.flatMap(({ template, placement }) => instantiateMotif(template, placement));
    const pocketDepth = document.settings.leafPocketDepth ?? 0.5;
    const pockets = pocketDepth <= 0.001 ? [] : placements.slice(1).map(({ ratio, placement }, pocketIndex) => {
      const previousAngle = placements[pocketIndex].placement.angle;
      const angle = (previousAngle + placement.angle) / 2;
      const pocketLength = attempt.size * ratio * (0.48 + pocketDepth * 0.2);
      const rootInset = attempt.size * (0.045 + pocketIndex * 0.015);
      return instantiateNegativePocket({
        id: `negative-pocket-${id}-${pocketIndex + 1}`,
        origin: add(attachment.point, { x: Math.cos(angle) * rootInset, y: Math.sin(angle) * rootInset }),
        angle,
        length: pocketLength,
        width: pocketLength * (0.28 + pocketDepth * 0.24),
        bend: attempt.side * (document.settings.leafBend ?? 0.75) * (0.82 - pocketIndex * 0.12),
        mirror: attempt.side < 0,
      });
    });
    const shapes = [
      ...members.filter((shape) => shape.closed),
      ...pockets,
      ...members.filter((shape) => !shape.closed),
    ];
    const outlines = shapes.filter((shape) => shape.closed);
    const inside = outlines.every((shape) => shapeInside(shape, document));
    const clear = manual || outlines.every((shape) => !overlapsOccupied(shape, occupied, 0.32));
    if (inside && clear) return shapes;
  }
  return [];
}

function curvatureSide(curves: CubicCurve[], progress: number): number {
  const before = pointAndTangent(curves, Math.max(0, progress - 0.025)).tangent;
  const after = pointAndTangent(curves, Math.min(0.999, progress + 0.025)).tangent;
  const cross = before.x * after.y - before.y * after.x;
  return cross >= 0 ? 1 : -1;
}

export function generateOrnaments(design: ScrollDesign, document: CarvingDocument): ScrollDesign {
  const ornaments: OrnamentShape[] = design.paths.map((path) => ribbonFromPath(path, document));
  const occupiedLeaves: OrnamentShape[] = [];
  const minimumDimension = Math.min(document.width - document.margin * 2, document.height - document.margin * 2);
  const majorLeafLength = minimumDimension * document.settings.leafScale;
  const primaryMotifCount = Math.max(1, Math.round(1 + document.settings.leafFrequency * 2));

  for (const path of design.paths.filter((candidate) => candidate.role === "primary")) {
    const backboneCurveCount = path.backboneCurveCount ?? path.curves.length;
    const backbone = path.curves.slice(0, backboneCurveCount);
    const manualFamilies = document.manualAcanthusFamilies ?? [];
    if (manualFamilies.length > 0) {
      for (const family of manualFamilies) {
        const motifShapes = createMotifAt(
          path,
          backbone,
          family.progress,
          family.side,
          minimumDimension * family.size,
          `manual-family-${path.id}-${family.id}`,
          document,
          occupiedLeaves,
          { angleOffset: family.angleOffset },
        );
        ornaments.push(...motifShapes);
        occupiedLeaves.push(...motifShapes.filter((shape) => shape.role === "leaf-major" || shape.role === "leaf-supporting"));
      }
      continue;
    }
    const hasTerminalCurl = path.curves.length > backboneCurveCount;
    const backboneModuleCount = hasTerminalCurl ? Math.max(0, primaryMotifCount - 1) : primaryMotifCount;
    const backboneZones = backboneModuleCount === 0
      ? []
      : backboneModuleCount === 1
        ? [0.32]
        : backboneModuleCount === 2
          ? [0.22, 0.58]
          : [0.18, 0.45, 0.72];
    const modules: Array<{ curves: CubicCurve[]; progress: number; terminal: boolean }> = backboneZones.map((progress) => ({
      curves: backbone,
      progress,
      terminal: false,
    }));
    if (hasTerminalCurl) {
      modules.push({
        curves: path.curves,
        progress: Math.max(0, (backboneCurveCount - 0.06) / path.curves.length),
        terminal: true,
      });
    }

    for (let index = 0; index < modules.length; index += 1) {
      const module = modules[index];
      const flowSide = curvatureSide(module.curves, Math.min(0.98, module.progress + (module.terminal ? 0.035 : 0)));
      const primarySide = index % 2 === 0 ? flowSide : -flowSide;
      const taper = module.terminal
        ? 0.82
        : 1 - index / Math.max(2, modules.length) * 0.2;
      const motifShapes = createMotifAt(
        path,
        module.curves,
        module.progress,
        primarySide,
        majorLeafLength * taper,
        `module-${path.id}-${module.terminal ? "terminal" : index}`,
        document,
        occupiedLeaves,
      );
      if (!motifShapes.length) continue;
      ornaments.push(...motifShapes);
      occupiedLeaves.push(...motifShapes.filter((shape) => shape.role === "leaf-major" || shape.role === "leaf-supporting"));
    }
  }

  for (const path of design.paths.filter((candidate) => candidate.role === "secondary")) {
    const random = createRandom(document.seed, `supporting:${path.id.replace("-mirror", "")}`);
    const generation = path.generation ?? 1;
    const hierarchyThreshold = generation === 1 ? 0.15 : generation === 2 ? 0.32 : 0.68;
    if (document.settings.leafFrequency < hierarchyThreshold) continue;
    const backbone = path.curves.slice(0, path.backboneCurveCount ?? 1);
    const side = random() > 0.5 ? curvatureSide(backbone, 0.58) : -curvatureSide(backbone, 0.58);
    const hierarchyScale = path.hierarchyRatio ?? ([1, 0.66, 0.33][generation - 1] ?? 0.33);
    const shapes = createMotifAt(
      path,
      backbone,
      between(random, 0.48, 0.7),
      side,
      majorLeafLength * 0.46 * hierarchyScale,
      `branch-family-${path.id}`,
      document,
      occupiedLeaves,
      undefined,
      generation >= 3 ? 1 : 2,
    );
    if (shapes.length) {
      occupiedLeaves.push(...shapes.filter((shape) => shape.role === "leaf-major" || shape.role === "leaf-supporting"));
      ornaments.push(...shapes);
    }
  }
  return { ...design, ornaments };
}
