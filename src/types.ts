export type Unit = "in" | "mm";
export type Symmetry = "none" | "point" | "horizontal" | "vertical";

export interface GeneratorSettings {
  density: number;
  curlIntensity: number;
  backboneSweep: number;
  crestPosition: number;
  backboneReach: number;
  terminalHeight: number;
  customSmoothing: number;
  customFidelity: number;
  customStrength: number;
  customScaleX: number;
  customScaleY: number;
  customTerminal: "preserve" | "procedural";
  symmetrySpacing: number;
  symmetryCenterX: number;
  symmetryCenter: number;
  secondaryLength: number;
  secondaryCurl: number;
  secondaryVariation: number;
  secondaryHierarchyLevels: number;
  secondaryChildAngle: number;
  secondaryChildLooseness: number;
  stemWidth: number;
  leafScale: number;
  leafFrequency: number;
  leafClusterComplexity: number;
  leafLobes: number;
  leafHook: number;
  leafArc: number;
  leafBelly: number;
  leafLobeDepth: number;
  leafVariation: number;
  leafTierFan: number;
  leafBend: number;
  leafPocketDepth: number;
  studySpiralTurns: number;
  studyLeafFamilies: number;
  studyInsideBalance: number;
  symmetry: Symmetry;
}

export interface ManualSecondary {
  id: string;
  progress: number;
  side: number;
  length: number;
}

export interface ManualAcanthusFamily {
  id: string;
  progress: number;
  side: number;
  size: number;
  angleOffset: number;
}

export interface CarvingDocument {
  version: 1;
  units: Unit;
  width: number;
  height: number;
  margin: number;
  seed: number;
  backboneMode: "generated" | "drawn";
  backbonePoints: Point[];
  manualSecondaries: ManualSecondary[];
  manualAcanthusFamilies: ManualAcanthusFamily[];
  settings: GeneratorSettings;
}

export interface Point {
  x: number;
  y: number;
}

export interface CubicCurve {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
}

export interface ScrollPath {
  id: string;
  role: "primary" | "secondary";
  curves: CubicCurve[];
  backboneCurveCount?: number;
  generation?: number;
  parentId?: string;
  hierarchyRatio?: number;
  hierarchyRootSpan?: number;
  hierarchyRootLength?: number;
}

export interface ScrollDesign {
  paths: ScrollPath[];
  ornaments?: OrnamentShape[];
}

export interface OrnamentShape {
  id: string;
  role: "stem-ribbon" | "leaf-major" | "leaf-supporting" | "leaf-rib" | "negative-space";
  points: Point[];
  closed: boolean;
  pathData?: string;
}
