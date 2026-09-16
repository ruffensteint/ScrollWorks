import type { OrnamentShape, Point } from "../types";

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount });
const normalize = (point: Point): Point => {
  const magnitude = Math.hypot(point.x, point.y) || 1;
  return scale(point, 1 / magnitude);
};
const rotate = (point: Point, angle: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});
const pathNumber = (value: number) => Number(value.toFixed(4));

interface BladeOptions {
  id: string;
  origin: Point;
  tangent: Point;
  side: number;
  size: number;
  width: number;
  arc: number;
  belly: number;
  hook: number;
  lobes: number;
  lobeDepth: number;
  role: "leaf-major" | "leaf-supporting";
}

export interface AcanthusMotifOptions {
  id: string;
  origin: Point;
  tangent: Point;
  side: number;
  size: number;
  complexity: number;
  arc: number;
  belly: number;
  hook: number;
  lobes: number;
  lobeDepth: number;
}

function transformPoint(local: Point, origin: Point, tangent: Point, side: number, size: number): Point {
  const flow = normalize(tangent);
  const away = { x: -flow.y * side, y: flow.x * side };
  return add(origin, add(scale(flow, local.x * size), scale(away, local.y * size)));
}

function cubicCommand(control1: Point, control2: Point, end: Point): string {
  return `C ${pathNumber(control1.x)} ${pathNumber(control1.y)} ${pathNumber(control2.x)} ${pathNumber(control2.y)} ${pathNumber(end.x)} ${pathNumber(end.y)}`;
}

function bladeShapes(options: BladeOptions): [OrnamentShape, OrnamentShape] {
  const width = options.width * (0.72 + Math.min(1.8, options.belly) * 0.32);
  const tipY = options.arc * 0.17;
  const hook = Math.min(1.5, options.hook);
  const local = (point: Point) => transformPoint(point, options.origin, options.tangent, options.side, options.size);
  const base = local({ x: 0, y: 0 });
  const outerControl1 = local({ x: 0.24, y: width * 0.16 });
  const outerControl2 = local({
    x: 0.66 + hook * 0.025,
    y: tipY + width * (0.98 + options.arc * 0.16),
  });
  const tip = local({ x: 1, y: tipY });
  const commands = [
    `M ${pathNumber(base.x)} ${pathNumber(base.y)}`,
    cubicCommand(outerControl1, outerControl2, tip),
  ];
  const points: Point[] = [base, outerControl1, outerControl2, tip];

  if (options.lobes <= 0) {
    const innerControl1 = local({ x: 0.84 - hook * 0.035, y: tipY - width * (0.2 + hook * 0.06) });
    const innerControl2 = local({ x: 0.31, y: width * 0.08 });
    commands.push(cubicCommand(innerControl1, innerControl2, base));
    points.push(innerControl1, innerControl2);
  } else {
    const firstNotchLocal = {
      x: 0.71,
      y: tipY - width * (0.12 + options.lobeDepth * 0.1),
    };
    const firstNotch = local(firstNotchLocal);
    const firstLobeTip = local({
      x: 0.5,
      y: width * (0.18 + options.lobeDepth * 0.28),
    });
    const firstControl1 = local({ x: 0.87 - hook * 0.04, y: tipY - width * (0.17 + hook * 0.05) });
    const firstControl2 = local({ x: 0.78, y: firstNotchLocal.y - width * 0.03 });
    commands.push(cubicCommand(firstControl1, firstControl2, firstNotch));
    points.push(firstControl1, firstControl2, firstNotch);

    const lobeRise1 = local({ x: 0.65, y: firstNotchLocal.y + width * 0.01 });
    const lobeRise2 = local({ x: 0.57, y: width * (0.17 + options.lobeDepth * 0.3) });
    commands.push(cubicCommand(lobeRise1, lobeRise2, firstLobeTip));
    points.push(lobeRise1, lobeRise2, firstLobeTip);

    if (options.lobes > 1) {
      const secondNotch = local({ x: 0.37, y: width * 0.045 });
      const secondLobeTip = local({ x: 0.23, y: width * (0.16 + options.lobeDepth * 0.16) });
      const notchControl1 = local({ x: 0.46, y: width * (0.16 + options.lobeDepth * 0.16) });
      const notchControl2 = local({ x: 0.42, y: width * 0.055 });
      commands.push(cubicCommand(notchControl1, notchControl2, secondNotch));
      points.push(notchControl1, notchControl2, secondNotch);
      const secondControl1 = local({ x: 0.33, y: width * 0.055 });
      const secondControl2 = local({ x: 0.28, y: width * (0.17 + options.lobeDepth * 0.17) });
      commands.push(cubicCommand(secondControl1, secondControl2, secondLobeTip));
      points.push(secondControl1, secondControl2, secondLobeTip);
      const baseControl1 = local({ x: 0.17, y: width * 0.12 });
      const baseControl2 = local({ x: 0.09, y: width * 0.015 });
      commands.push(cubicCommand(baseControl1, baseControl2, base));
      points.push(baseControl1, baseControl2);
    } else {
      const throat = local({ x: 0.29, y: width * 0.035 });
      const throatControl1 = local({ x: 0.44, y: width * (0.16 + options.lobeDepth * 0.15) });
      const throatControl2 = local({ x: 0.35, y: width * 0.045 });
      commands.push(cubicCommand(throatControl1, throatControl2, throat));
      points.push(throatControl1, throatControl2, throat);
      const baseControl1 = local({ x: 0.2, y: width * 0.035 });
      const baseControl2 = local({ x: 0.09, y: width * 0.01 });
      commands.push(cubicCommand(baseControl1, baseControl2, base));
      points.push(baseControl1, baseControl2);
    }
  }
  commands.push("Z");

  const ribEnd = local({ x: 0.78, y: tipY * 0.84 });
  const ribControl1 = local({ x: 0.24, y: width * 0.015 });
  const ribControl2 = local({ x: 0.56, y: tipY * 0.55 + width * 0.035 });
  return [{
    id: options.id,
    role: options.role,
    points,
    closed: true,
    pathData: commands.join(" "),
  }, {
    id: `${options.id}-rib`,
    role: "leaf-rib",
    points: [base, ribControl1, ribControl2, ribEnd],
    closed: false,
    pathData: `M ${pathNumber(base.x)} ${pathNumber(base.y)} ${cubicCommand(ribControl1, ribControl2, ribEnd)}`,
  }];
}

function throatShape(options: AcanthusMotifOptions): OrnamentShape {
  const local = (point: Point) => transformPoint(point, options.origin, options.tangent, options.side, options.size);
  const base = local({ x: -0.035, y: 0 });
  const shoulder1 = local({ x: 0.12, y: 0.17 });
  const shoulder2 = local({ x: 0.3, y: 0.2 });
  const tip = local({ x: 0.42, y: 0.025 });
  const return1 = local({ x: 0.31, y: -0.12 });
  const return2 = local({ x: 0.12, y: -0.1 });
  return {
    id: `${options.id}-throat`,
    role: "leaf-supporting",
    points: [base, shoulder1, shoulder2, tip, return1, return2],
    closed: true,
    pathData: [
      `M ${pathNumber(base.x)} ${pathNumber(base.y)}`,
      cubicCommand(shoulder1, shoulder2, tip),
      cubicCommand(return1, return2, base),
      "Z",
    ].join(" "),
  };
}

export function createAcanthusMotif(options: AcanthusMotifOptions): OrnamentShape[] {
  const flow = normalize(options.tangent);
  const complexity = Math.max(0, Math.min(1, options.complexity));
  const blades: Array<[OrnamentShape, OrnamentShape]> = [];

  if (complexity >= 0.22) {
    blades.push(bladeShapes({
      ...options,
      id: `${options.id}-crown`,
      tangent: rotate(flow, options.side * (0.34 + complexity * 0.16)),
      size: options.size * (0.68 + complexity * 0.1),
      width: 0.24,
      lobes: Math.max(0, options.lobes - 1),
      role: "leaf-supporting",
    }));
  }

  if (complexity >= 0.56) {
    blades.push(bladeShapes({
      ...options,
      id: `${options.id}-lower`,
      tangent: rotate(flow, -options.side * (0.25 + complexity * 0.12)),
      side: -options.side,
      size: options.size * (0.52 + complexity * 0.1),
      width: 0.27,
      arc: options.arc * 0.82,
      lobes: Math.max(0, options.lobes - 1),
      role: "leaf-supporting",
    }));
  }

  const dominant = bladeShapes({
    ...options,
    id: `${options.id}-dominant`,
    tangent: flow,
    width: 0.31,
    role: "leaf-major",
  });
  blades.push(dominant);

  if (complexity >= 0.82) {
    blades.push(bladeShapes({
      ...options,
      id: `${options.id}-heart`,
      tangent: rotate(flow, options.side * 0.13),
      side: -options.side,
      size: options.size * 0.46,
      width: 0.3,
      arc: options.arc * 1.12,
      hook: options.hook * 1.15,
      lobes: 0,
      role: "leaf-supporting",
    }));
  }

  const outlines = blades.map(([outline]) => outline);
  const ribs = blades.map(([, rib]) => rib);
  return complexity >= 0.35
    ? [...outlines.slice(0, -1), throatShape(options), outlines[outlines.length - 1], ...ribs]
    : [...outlines, ...ribs];
}
