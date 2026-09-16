import type { OrnamentShape, Point } from "../types";

interface CubicSegment {
  control1: Point;
  control2: Point;
  end: Point;
}

interface TemplatePath {
  start: Point;
  segments: CubicSegment[];
  closed: boolean;
}

export interface MotifTemplate {
  name: "comma" | "long-acanthus";
  outline: TemplatePath;
  rib: TemplatePath;
}

export interface MotifPlacement {
  id: string;
  origin: Point;
  angle: number;
  length: number;
  width: number;
  /** Signed change in centerline angle, in radians, over one template length. */
  bend?: number;
  mirror?: boolean;
  role?: "leaf-major" | "leaf-supporting";
}

const point = (x: number, y: number): Point => ({ x, y });

// Authored silhouettes, rather than leaves assembled from a repeating lobe
// formula. The points are normalized to a one-unit centerline so placement and
// scale do not change their anatomy.
export const COMMA_LEAF: MotifTemplate = {
  name: "comma",
  outline: {
    start: point(0, 0),
    segments: [
      { control1: point(0.12, -0.04), control2: point(0.26, -0.30), end: point(0.47, -0.47) },
      { control1: point(0.66, -0.63), control2: point(0.91, -0.61), end: point(1.00, -0.38) },
      { control1: point(1.07, -0.20), control2: point(0.99, -0.02), end: point(0.84, 0.04) },
      { control1: point(0.74, 0.08), control2: point(0.66, 0.02), end: point(0.68, -0.09) },
      { control1: point(0.54, 0.08), control2: point(0.58, 0.25), end: point(0.46, 0.30) },
      { control1: point(0.34, 0.36), control2: point(0.29, 0.20), end: point(0.33, 0.09) },
      { control1: point(0.22, 0.19), control2: point(0.08, 0.12), end: point(0, 0) },
    ],
    closed: true,
  },
  rib: {
    start: point(0.03, 0.015),
    segments: [
      { control1: point(0.28, 0.02), control2: point(0.57, -0.08), end: point(0.82, -0.31) },
    ],
    closed: false,
  },
};

export const LONG_ACANTHUS_LEAF: MotifTemplate = {
  name: "long-acanthus",
  outline: {
    start: point(0, 0),
    segments: [
      { control1: point(0.15, -0.03), control2: point(0.31, -0.30), end: point(0.52, -0.43) },
      { control1: point(0.70, -0.55), control2: point(0.91, -0.48), end: point(1.00, -0.27) },
      { control1: point(1.07, -0.11), control2: point(0.99, 0.03), end: point(0.87, 0.07) },
      { control1: point(0.79, 0.10), control2: point(0.73, 0.06), end: point(0.75, -0.03) },
      { control1: point(0.64, 0.08), control2: point(0.70, 0.25), end: point(0.57, 0.29) },
      { control1: point(0.47, 0.33), control2: point(0.42, 0.22), end: point(0.46, 0.12) },
      { control1: point(0.35, 0.23), control2: point(0.39, 0.38), end: point(0.27, 0.38) },
      { control1: point(0.17, 0.38), control2: point(0.13, 0.23), end: point(0.19, 0.12) },
      { control1: point(0.12, 0.17), control2: point(0.05, 0.08), end: point(0, 0) },
    ],
    closed: true,
  },
  rib: {
    start: point(0.025, 0.012),
    segments: [
      { control1: point(0.25, 0.01), control2: point(0.54, -0.10), end: point(0.84, -0.28) },
    ],
    closed: false,
  },
};

const rounded = (value: number) => Number(value.toFixed(4));

const NEGATIVE_POCKET: TemplatePath = {
  start: point(0, 0),
  segments: [
    { control1: point(0.24, -0.08), control2: point(0.68, -0.46), end: point(1, -0.06) },
    { control1: point(0.72, -0.08), control2: point(0.27, 0.16), end: point(0, 0) },
  ],
  closed: true,
};

function transform(local: Point, placement: MotifPlacement): Point {
  const mirror = placement.mirror ? -1 : 1;
  const bend = placement.bend ?? 0;
  const offset = local.y * placement.width * mirror;
  let x: number;
  let y: number;

  if (Math.abs(bend) < 0.0001) {
    x = local.x * placement.length;
    y = offset;
  } else {
    // Wrap the authored silhouette around a circular centerline. Each point's
    // transverse offset is applied along the centerline normal, so the outline
    // and rib bend as one piece without changing the traced lobe anatomy.
    const theta = bend * local.x;
    const radius = placement.length / bend;
    const centerX = Math.sin(theta) * radius;
    const centerY = (1 - Math.cos(theta)) * radius;
    x = centerX - Math.sin(theta) * offset;
    y = centerY + Math.cos(theta) * offset;
  }
  const cosine = Math.cos(placement.angle);
  const sine = Math.sin(placement.angle);
  return {
    x: placement.origin.x + x * cosine - y * sine,
    y: placement.origin.y + x * sine + y * cosine,
  };
}

function instantiatePath(path: TemplatePath, placement: MotifPlacement): { pathData: string; points: Point[] } {
  const start = transform(path.start, placement);
  const points: Point[] = [start];
  const commands = [`M ${rounded(start.x)} ${rounded(start.y)}`];
  for (const segment of path.segments) {
    const control1 = transform(segment.control1, placement);
    const control2 = transform(segment.control2, placement);
    const end = transform(segment.end, placement);
    points.push(control1, control2, end);
    commands.push(`C ${rounded(control1.x)} ${rounded(control1.y)} ${rounded(control2.x)} ${rounded(control2.y)} ${rounded(end.x)} ${rounded(end.y)}`);
  }
  if (path.closed) commands.push("Z");
  return { pathData: commands.join(" "), points };
}

export function instantiateMotif(template: MotifTemplate, placement: MotifPlacement): OrnamentShape[] {
  const outline = instantiatePath(template.outline, placement);
  const rib = instantiatePath(template.rib, placement);
  return [{
    id: placement.id,
    role: placement.role ?? "leaf-major",
    points: outline.points,
    closed: true,
    pathData: outline.pathData,
  }, {
    id: `${placement.id}-rib`,
    role: "leaf-rib",
    points: rib.points,
    closed: false,
    pathData: rib.pathData,
  }];
}

export function instantiateNegativePocket(placement: Omit<MotifPlacement, "role">): OrnamentShape {
  const pocket = instantiatePath(NEGATIVE_POCKET, placement);
  return {
    id: placement.id,
    role: "negative-space",
    points: pocket.points,
    closed: true,
    pathData: pocket.pathData,
  };
}
