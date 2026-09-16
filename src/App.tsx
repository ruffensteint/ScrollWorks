import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { generateScrollDesign } from "./generator/scroll";
import { generateMotifStudy } from "./generator/motifStudy";
import { generateFormulaStudy } from "./generator/formulaStudy";
import { generateVoluteStudy } from "./generator/voluteStudy";
import { curveToPath, designToSvg, ornamentToPath } from "./generator/svg";
import type { CarvingDocument, ScrollDesign, Symmetry, Unit } from "./types";
import "./styles.css";

const initialDocument: CarvingDocument = {
  version: 1,
  units: "in",
  width: 24,
  height: 8,
  margin: 0.5,
  seed: 583214,
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

function downloadSvg(document: CarvingDocument, svg: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `carve-scroll-${document.seed}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function curvePoint(curve: ScrollDesign["paths"][number]["curves"][number], t: number) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * curve.start.x + 3 * inverse ** 2 * t * curve.control1.x + 3 * inverse * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
    y: inverse ** 3 * curve.start.y + 3 * inverse ** 2 * t * curve.control1.y + 3 * inverse * t ** 2 * curve.control2.y + t ** 3 * curve.end.y,
  };
}

function curveTangent(curve: ScrollDesign["paths"][number]["curves"][number], t: number) {
  const inverse = 1 - t;
  const tangent = {
    x: 3 * inverse ** 2 * (curve.control1.x - curve.start.x) + 6 * inverse * t * (curve.control2.x - curve.control1.x) + 3 * t ** 2 * (curve.end.x - curve.control2.x),
    y: 3 * inverse ** 2 * (curve.control1.y - curve.start.y) + 6 * inverse * t * (curve.control2.y - curve.control1.y) + 3 * t ** 2 * (curve.end.y - curve.control2.y),
  };
  const magnitude = Math.hypot(tangent.x, tangent.y) || 1;
  return { x: tangent.x / magnitude, y: tangent.y / magnitude };
}

function pathFrame(curves: ScrollDesign["paths"][number]["curves"], progress: number) {
  const scaled = Math.min(0.999999, Math.max(0, progress)) * curves.length;
  const index = Math.min(curves.length - 1, Math.floor(scaled));
  const t = scaled - index;
  return { point: curvePoint(curves[index], t), tangent: curveTangent(curves[index], t) };
}

function normalizedAngle(angle: number) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

interface FamilyGesture {
  editingId?: string;
  progress: number;
  root: { x: number; y: number };
  tangent: { x: number; y: number };
  current: { x: number; y: number };
}

type PreviewMode = "study" | "formula" | "volute" | "ornament" | "skeleton";

export default function App() {
  const [document, setDocument] = useState(initialDocument);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("study");
  const [drawing, setDrawing] = useState(false);
  const [placingSymmetry, setPlacingSymmetry] = useState(false);
  const [addingSecondary, setAddingSecondary] = useState(false);
  const [addingAcanthus, setAddingAcanthus] = useState(false);
  const [familyGesture, setFamilyGesture] = useState<FamilyGesture | null>(null);
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const draftPointsRef = useRef<{ x: number; y: number }[]>([]);
  const design = useMemo(() => generateScrollDesign(document), [document]);
  const studyDesign = useMemo(() => generateMotifStudy(document), [document]);
  const formulaDesign = useMemo(() => generateFormulaStudy(document), [document]);
  const voluteDesign = useMemo(() => generateVoluteStudy(document), [document]);
  const manualFamilyHandles = useMemo(() => {
    const source = design.paths.find((path) => path.role === "primary" && !path.id.endsWith("-mirror"));
    if (!source) return [];
    const curves = source.curves.slice(0, source.backboneCurveCount ?? source.curves.length);
    const minimumDimension = Math.min(document.width - document.margin * 2, document.height - document.margin * 2);
    return (document.manualAcanthusFamilies ?? []).map((family) => {
      const frame = pathFrame(curves, family.progress);
      const angle = Math.atan2(frame.tangent.y, frame.tangent.x) + family.angleOffset;
      return {
        family,
        root: frame.point,
        tangent: frame.tangent,
        end: {
          x: frame.point.x + Math.cos(angle) * minimumDimension * family.size,
          y: frame.point.y + Math.sin(angle) * minimumDimension * family.size,
        },
      };
    });
  }, [design, document]);
  const displayedDesign = previewMode === "study" ? studyDesign : previewMode === "formula" ? formulaDesign : previewMode === "volute" ? voluteDesign : design;
  const svg = useMemo(() => designToSvg(document, displayedDesign), [document, displayedDesign]);
  const isStudy = previewMode === "study" || previewMode === "formula" || previewMode === "volute";
  const studyCanvasX = document.width * 0.5 - document.height * 0.5;
  const canvasViewBox = isStudy
    ? `${studyCanvasX} 0 ${document.height} ${document.height}`
    : `0 0 ${document.width} ${document.height}`;
  const update = <K extends keyof CarvingDocument>(key: K, value: CarvingDocument[K]) =>
    setDocument((current) => ({ ...current, [key]: value }));
  const updateSetting = <K extends keyof CarvingDocument["settings"]>(key: K, value: CarvingDocument["settings"][K]) =>
    setDocument((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  const pointerToDocument = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(document.width - document.margin, Math.max(document.margin, ((event.clientX - bounds.left) / bounds.width) * document.width)),
      y: Math.min(document.height - document.margin, Math.max(document.margin, ((event.clientY - bounds.top) / bounds.height) * document.height)),
    };
  };
  const startDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const points = [pointerToDocument(event)];
    draftPointsRef.current = points;
    setDraftPoints(points);
  };
  const continueDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (addingAcanthus && familyGesture && event.currentTarget.hasPointerCapture(event.pointerId)) {
      setFamilyGesture({ ...familyGesture, current: pointerToDocument(event) });
      return;
    }
    if (!drawing || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointerToDocument(event);
    setDraftPoints((current) => {
      const last = current[current.length - 1];
      const threshold = Math.min(document.width, document.height) * 0.012;
      const next = !last || Math.hypot(point.x - last.x, point.y - last.y) >= threshold
        ? [...current, point]
        : current;
      draftPointsRef.current = next;
      return next;
    });
  };
  const finishDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (addingAcanthus && familyGesture && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      const end = pointerToDocument(event);
      const vector = { x: end.x - familyGesture.root.x, y: end.y - familyGesture.root.y };
      const distance = Math.hypot(vector.x, vector.y);
      const minimumDimension = Math.min(document.width - document.margin * 2, document.height - document.margin * 2);
      if (distance > document.height * 0.04) {
        const direction = Math.atan2(vector.y, vector.x);
        const tangentAngle = Math.atan2(familyGesture.tangent.y, familyGesture.tangent.x);
        const cross = familyGesture.tangent.x * vector.y - familyGesture.tangent.y * vector.x;
        const nextFamily = {
          id: familyGesture.editingId ?? `family-${(document.manualAcanthusFamilies?.length ?? 0) + 1}`,
          progress: familyGesture.progress,
          side: cross >= 0 ? 1 : -1,
          size: Math.min(0.8, Math.max(0.08, distance / minimumDimension)),
          angleOffset: normalizedAngle(direction - tangentAngle),
        };
        setDocument((current) => ({
          ...current,
          manualAcanthusFamilies: familyGesture.editingId
            ? (current.manualAcanthusFamilies ?? []).map((family) => family.id === familyGesture.editingId ? nextFamily : family)
            : [...(current.manualAcanthusFamilies ?? []), nextFamily],
        }));
      }
      setFamilyGesture(null);
      return;
    }
    if (!drawing || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const points = [...draftPointsRef.current, pointerToDocument(event)];
    draftPointsRef.current = points;
    setDraftPoints(points);
    if (points.length >= 4) {
      setDocument((current) => ({ ...current, backboneMode: "drawn", backbonePoints: points }));
      setDrawing(false);
      draftPointsRef.current = [];
      setDraftPoints([]);
    }
  };
  const closestBackboneFrame = (point: { x: number; y: number }) => {
    let closest: { progress: number; point: { x: number; y: number }; tangent: { x: number; y: number }; distance: number } | undefined;
    const source = design.paths.find((path) => path.role === "primary" && !path.id.endsWith("-mirror"));
    if (!source) return undefined;
    const backboneCount = source.backboneCurveCount ?? source.curves.length;
    for (let curveIndex = 0; curveIndex < backboneCount; curveIndex += 1) {
      const curve = source.curves[curveIndex];
      for (let step = 0; step <= 60; step += 1) {
        const t = step / 60;
        const candidate = curvePoint(curve, t);
        const candidateDistance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
        if (!closest || candidateDistance < closest.distance) {
          closest = {
            progress: (curveIndex + t) / backboneCount,
            point: candidate,
            tangent: curveTangent(curve, t),
            distance: candidateDistance,
          };
        }
      }
    }
    return closest;
  };
  const startAcanthusGesture = (event: ReactPointerEvent<SVGSVGElement>, point: { x: number; y: number }) => {
    const handle = manualFamilyHandles.find((candidate) =>
      Math.hypot(point.x - candidate.end.x, point.y - candidate.end.y) < document.height * 0.12,
    );
    const frame = handle
      ? { progress: handle.family.progress, point: handle.root, tangent: handle.tangent }
      : closestBackboneFrame(point);
    if (!frame) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFamilyGesture({
      editingId: handle?.family.id,
      progress: frame.progress,
      root: frame.point,
      tangent: frame.tangent,
      current: handle?.end ?? point,
    });
  };
  const addSecondaryAt = (point: { x: number; y: number }) => {
    let closest: { progress: number; side: number; distance: number } | undefined;
    for (const path of design.paths.filter((candidate) => candidate.role === "primary")) {
      const backboneCount = path.backboneCurveCount ?? 1;
      for (let curveIndex = 0; curveIndex < backboneCount; curveIndex += 1) {
        const curve = path.curves[curveIndex];
        for (let step = 0; step <= 40; step += 1) {
          const t = step / 40;
          const candidate = curvePoint(curve, t);
          const candidateDistance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
          if (!closest || candidateDistance < closest.distance) {
            const tangent = curveTangent(curve, t);
            const cross = tangent.x * (point.y - candidate.y) - tangent.y * (point.x - candidate.x);
            const displaySide = cross >= 0 ? 1 : -1;
            closest = {
              progress: (curveIndex + t) / backboneCount,
              side: path.id.endsWith("-mirror") && document.settings.symmetry !== "point" ? -displaySide : displaySide,
              distance: candidateDistance,
            };
          }
        }
      }
    }
    if (!closest) return;
    setDocument((current) => ({
      ...current,
      manualSecondaries: [...current.manualSecondaries, {
        id: `manual-${current.manualSecondaries.length + 1}`,
        progress: closest.progress,
        side: closest.side,
        length: 1,
      }],
    }));
  };
  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointerToDocument(event);
    if (addingAcanthus) {
      startAcanthusGesture(event, point);
      return;
    }
    if (placingSymmetry) {
      const usableHeight = document.height - document.margin * 2;
      const usableWidth = document.width - document.margin * 2;
      const minimumY = (document.margin + usableHeight * 0.15) / document.height;
      const maximumY = (document.height - document.margin - usableHeight * 0.15) / document.height;
      const minimumX = (document.margin + usableWidth * 0.15) / document.width;
      const maximumX = (document.width - document.margin - usableWidth * 0.15) / document.width;
      if (document.settings.symmetry !== "vertical") {
        updateSetting("symmetryCenter", Math.min(maximumY, Math.max(minimumY, point.y / document.height)));
      }
      if (document.settings.symmetry !== "horizontal") {
        updateSetting("symmetryCenterX", Math.min(maximumX, Math.max(minimumX, point.x / document.width)));
      }
      setPlacingSymmetry(false);
      return;
    }
    if (addingSecondary) {
      addSecondaryAt(point);
      return;
    }
    startDrawing(event);
  };

  const familyGestureRays = familyGesture ? [1, 0.66, 0.33].map((ratio, index) => {
    const vector = {
      x: familyGesture.current.x - familyGesture.root.x,
      y: familyGesture.current.y - familyGesture.root.y,
    };
    const length = Math.hypot(vector.x, vector.y);
    const direction = Math.atan2(vector.y, vector.x);
    const cross = familyGesture.tangent.x * vector.y - familyGesture.tangent.y * vector.x;
    const side = cross >= 0 ? 1 : -1;
    const angle = direction - side * (document.settings.leafTierFan ?? 0.4) * index;
    return {
      x: familyGesture.root.x + Math.cos(angle) * length * ratio,
      y: familyGesture.root.y + Math.sin(angle) * length * ratio,
    };
  }) : [];

  return (
    <main className="app-shell">
      <aside className="controls">
        <div className="brand">
          <span className="eyebrow">ScrollWorks</span>
          <h1>ScrollWorks</h1>
          <p>Build the flow first. Ornament comes later.</p>
        </div>

        <section>
          <h2>Workpiece</h2>
          <div className="field-row">
            <label>Width<input type="number" min="1" step="0.25" value={document.width} onChange={(event) => update("width", Number(event.target.value))}/></label>
            <label>Height<input type="number" min="1" step="0.25" value={document.height} onChange={(event) => update("height", Number(event.target.value))}/></label>
          </div>
          <div className="field-row">
            <label>Margin<input type="number" min="0" step="0.125" value={document.margin} onChange={(event) => update("margin", Number(event.target.value))}/></label>
            <label>Units<select value={document.units} onChange={(event) => update("units", event.target.value as Unit)}><option value="in">Inches</option><option value="mm">Millimeters</option></select></label>
          </div>
        </section>

        <section>
          <h2>Composition</h2>
          <label>Density <output>{Math.round(document.settings.density * 100)}%</output><input type="range" min="0.2" max="1" step="0.05" value={document.settings.density} onChange={(event) => updateSetting("density", Number(event.target.value))}/></label>
          <label>Secondary length <output>{Math.round(document.settings.secondaryLength * 100)}%</output><input type="range" min="0.15" max="0.65" step="0.025" value={document.settings.secondaryLength} onChange={(event) => updateSetting("secondaryLength", Number(event.target.value))}/></label>
          <label>Secondary curl <output>{Math.round(document.settings.secondaryCurl * 100)}%</output><input type="range" min="0" max="1.5" step="0.05" value={document.settings.secondaryCurl} onChange={(event) => updateSetting("secondaryCurl", Number(event.target.value))}/></label>
          <label>Secondary variation <output>{Math.round(document.settings.secondaryVariation * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={document.settings.secondaryVariation} onChange={(event) => updateSetting("secondaryVariation", Number(event.target.value))}/></label>
          <label>Hierarchy levels <output>{Math.round(document.settings.secondaryHierarchyLevels ?? 2)}</output><input type="range" min="1" max="3" step="1" value={document.settings.secondaryHierarchyLevels ?? 2} onChange={(event) => updateSetting("secondaryHierarchyLevels", Number(event.target.value))}/></label>
          <label>Child branch angle <output>{Math.round(document.settings.secondaryChildAngle ?? 65)}°</output><input type="range" min="35" max="90" step="5" value={document.settings.secondaryChildAngle ?? 65} onChange={(event) => updateSetting("secondaryChildAngle", Number(event.target.value))}/></label>
          <label>Child looseness <output>{Math.round((document.settings.secondaryChildLooseness ?? 1.35) * 100)}%</output><input type="range" min="0.75" max="1.8" step="0.05" value={document.settings.secondaryChildLooseness ?? 1.35} onChange={(event) => updateSetting("secondaryChildLooseness", Number(event.target.value))}/></label>
          <p className="control-note">Branch generations follow fixed 100 / 66 / 33 proportions.</p>
          <div className="draw-actions">
            <button className={addingSecondary ? "active" : ""} onClick={() => { setAddingSecondary((current) => !current); setAddingAcanthus(false); setDrawing(false); setPlacingSymmetry(false); }}>Add secondaries</button>
            <button disabled={document.manualSecondaries.length === 0} onClick={() => update("manualSecondaries", document.manualSecondaries.slice(0, -1))}>Undo secondary</button>
          </div>
          <p className="control-note">{addingSecondary ? "Click beside the backbone; the click side controls growth direction. Smaller child scrolls grow from each placed secondary." : `${document.manualSecondaries.length} manually placed parent scrolls; hierarchy is generated beneath them.`}</p>
          <div className="draw-actions">
            <button className={drawing ? "active" : ""} onClick={() => { setDrawing(true); setAddingAcanthus(false); setAddingSecondary(false); setPlacingSymmetry(false); draftPointsRef.current = []; setDraftPoints([]); }}>Draw backbone</button>
            <button onClick={() => { update("backboneMode", "generated"); setAddingAcanthus(false); setDrawing(false); draftPointsRef.current = []; setDraftPoints([]); }}>Use generated</button>
          </div>
          <p className="control-note">{drawing ? "Drag one continuous stroke across the workpiece." : document.backboneMode === "drawn" ? "Using your drawn backbone." : "Using the generated backbone."}</p>
          {document.backboneMode === "drawn" ? (
            <fieldset disabled={drawing}>
              <label>Smoothing <output>{Math.round(document.settings.customSmoothing * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={document.settings.customSmoothing} onChange={(event) => updateSetting("customSmoothing", Number(event.target.value))}/></label>
              <label>Input fidelity <output>{Math.round(document.settings.customFidelity * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={document.settings.customFidelity} onChange={(event) => updateSetting("customFidelity", Number(event.target.value))}/></label>
              <div className="range-legend"><span>Interpreted</span><span>Hand-drawn</span></div>
              <label>Curve strength <output>{document.settings.customStrength.toFixed(2)}×</output><input type="range" min="0.25" max="1.75" step="0.05" value={document.settings.customStrength} onChange={(event) => updateSetting("customStrength", Number(event.target.value))}/></label>
              <label>Horizontal stretch <output>{document.settings.customScaleX.toFixed(2)}×</output><input type="range" min="0.5" max="1.75" step="0.05" value={document.settings.customScaleX} onChange={(event) => updateSetting("customScaleX", Number(event.target.value))}/></label>
              <label>Vertical stretch <output>{document.settings.customScaleY.toFixed(2)}×</output><input type="range" min="0.5" max="1.75" step="0.05" value={document.settings.customScaleY} onChange={(event) => updateSetting("customScaleY", Number(event.target.value))}/></label>
              <label>Drawn ending<select value={document.settings.customTerminal} onChange={(event) => updateSetting("customTerminal", event.target.value as "preserve" | "procedural")}><option value="preserve">Preserve my ending</option><option value="procedural">Add procedural curl</option></select></label>
            </fieldset>
          ) : (
            <fieldset disabled={drawing}>
              <label>Backbone sweep <output>{Math.round(document.settings.backboneSweep * 100)}%</output><input type="range" min="0.15" max="0.9" step="0.05" value={document.settings.backboneSweep} onChange={(event) => updateSetting("backboneSweep", Number(event.target.value))}/></label>
              <label>Crest position <output>{Math.round(document.settings.crestPosition * 100)}%</output><input type="range" min="0.25" max="0.7" step="0.025" value={document.settings.crestPosition} onChange={(event) => updateSetting("crestPosition", Number(event.target.value))}/></label>
              <label>Backbone reach <output>{Math.round(document.settings.backboneReach * 100)}%</output><input type="range" min="0.55" max="0.86" step="0.02" value={document.settings.backboneReach} onChange={(event) => updateSetting("backboneReach", Number(event.target.value))}/></label>
              <label>Terminal height <output>{Math.round(document.settings.terminalHeight * 100)}%</output><input type="range" min="0.35" max="0.72" step="0.02" value={document.settings.terminalHeight} onChange={(event) => updateSetting("terminalHeight", Number(event.target.value))}/></label>
            </fieldset>
          )}
          <label>Curl intensity <output>{document.settings.curlIntensity.toFixed(2)}</output><input type="range" min="0.55" max="1.45" step="0.05" value={document.settings.curlIntensity} onChange={(event) => updateSetting("curlIntensity", Number(event.target.value))}/></label>
          <label>Symmetry<select value={document.settings.symmetry} onChange={(event) => updateSetting("symmetry", event.target.value as Symmetry)}><option value="none">None</option><option value="point">Around clicked point</option><option value="horizontal">Across horizontal axis</option><option value="vertical">Across vertical axis</option></select></label>
          {document.settings.symmetry !== "none" && <><label>Symmetry spacing <output>{Math.round(document.settings.symmetrySpacing * 100)}%</output><input type="range" min="0" max="0.6" step="0.025" value={document.settings.symmetrySpacing} onChange={(event) => updateSetting("symmetrySpacing", Number(event.target.value))}/></label><button className={placingSymmetry ? "active full-button" : "full-button"} onClick={() => { setPlacingSymmetry(true); setAddingAcanthus(false); setAddingSecondary(false); setDrawing(false); }}>{document.settings.symmetry === "point" ? "Set mirror origin on canvas" : "Set mirror axis on canvas"}</button></>}
        </section>

        <section>
          <h2>Ornament</h2>
          <label>Preview<select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as PreviewMode)}><option value="study">Leaf trace study</option><option value="formula">Origin formula study</option><option value="volute">Volute construction study</option><option value="ornament">Full layout</option><option value="skeleton">Construction skeleton</option></select></label>
          <div className="draw-actions">
            <button className={addingAcanthus ? "active" : ""} onClick={() => { setAddingAcanthus((current) => !current); setPreviewMode("ornament"); setAddingSecondary(false); setDrawing(false); setPlacingSymmetry(false); setFamilyGesture(null); }}>Add acanthus family</button>
            <button disabled={(document.manualAcanthusFamilies?.length ?? 0) === 0} onClick={() => update("manualAcanthusFamilies", (document.manualAcanthusFamilies ?? []).slice(0, -1))}>Undo family</button>
          </div>
          <button className="full-button" disabled={(document.manualAcanthusFamilies?.length ?? 0) === 0} onClick={() => setDocument((current) => {
            const families = [...(current.manualAcanthusFamilies ?? [])];
            const last = families[families.length - 1];
            if (last) families[families.length - 1] = { ...last, side: -last.side };
            return { ...current, manualAcanthusFamilies: families };
          })}>Flip last fan</button>
          <p className="control-note">{addingAcanthus ? "Drag from the backbone toward the 100% leaf. Drag an orange handle to revise direction and size." : `${document.manualAcanthusFamilies?.length ?? 0} manually placed families. Manual families replace automatic suggestions.`}</p>
          {previewMode === "study" && <>
            <p className="control-note">Trace proof: a broad comma leaf above and a longer acanthus leaf below. They are isolated so the silhouette can be judged before repetition.</p>
          </>}
          {previewMode === "formula" && <>
            <p className="control-note">Construction proof: one marked origin feeding a large C-scroll, nested arches, and ranked S-cut leaf families.</p>
            <label>Spiral turns <output>{document.settings.studySpiralTurns.toFixed(2)}</output><input type="range" min="0.85" max="1.5" step="0.05" value={document.settings.studySpiralTurns} onChange={(event) => updateSetting("studySpiralTurns", Number(event.target.value))}/></label>
            <label>Leaf families <output>{Math.round(document.settings.studyLeafFamilies)}</output><input type="range" min="1" max="4" step="1" value={document.settings.studyLeafFamilies} onChange={(event) => updateSetting("studyLeafFamilies", Number(event.target.value))}/></label>
            <label>Inside balance <output>{Math.round(document.settings.studyInsideBalance * 100)}%</output><input type="range" min="0.15" max="0.9" step="0.05" value={document.settings.studyInsideBalance} onChange={(event) => updateSetting("studyInsideBalance", Number(event.target.value))}/></label>
          </>}
          {previewMode === "volute" && <>
            <p className="control-note">One dominant volute mass subdivided by a C-cut, arch, and reversing S-cut. The 100 / 66 / 33 leaves share one origin and occupy the interior rather than forming separate stem ribbons.</p>
            <label>Volute closure <output>{document.settings.studySpiralTurns.toFixed(2)}</output><input type="range" min="0.85" max="1.5" step="0.05" value={document.settings.studySpiralTurns} onChange={(event) => updateSetting("studySpiralTurns", Number(event.target.value))}/></label>
            <label>Structural leaves <output>{Math.min(3, Math.round(document.settings.studyLeafFamilies))}</output><input type="range" min="1" max="3" step="1" value={Math.min(3, document.settings.studyLeafFamilies)} onChange={(event) => updateSetting("studyLeafFamilies", Number(event.target.value))}/></label>
            <label>Fan opening <output>{Math.round(document.settings.studyInsideBalance * 100)}%</output><input type="range" min="0.15" max="0.9" step="0.05" value={document.settings.studyInsideBalance} onChange={(event) => updateSetting("studyInsideBalance", Number(event.target.value))}/></label>
          </>}
          <label>Stem ribbon width <output>{Math.round(document.settings.stemWidth * 1000) / 10}%</output><input type="range" min="0.012" max="0.08" step="0.004" value={document.settings.stemWidth} onChange={(event) => updateSetting("stemWidth", Number(event.target.value))}/></label>
          <label>Motif scale <output>{Math.round(document.settings.leafScale * 100)}%</output><input type="range" min="0.12" max="0.65" step="0.025" value={document.settings.leafScale} onChange={(event) => updateSetting("leafScale", Number(event.target.value))}/></label>
          <label>Motif frequency <output>{Math.round(document.settings.leafFrequency * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={document.settings.leafFrequency} onChange={(event) => updateSetting("leafFrequency", Number(event.target.value))}/></label>
          <label>Acanthus tiers <output>{1 + Math.min(2, Math.floor((document.settings.leafClusterComplexity ?? 0.85) * 2.999))}</output><input type="range" min="0" max="1" step="0.5" value={document.settings.leafClusterComplexity ?? 0.85} onChange={(event) => updateSetting("leafClusterComplexity", Number(event.target.value))}/></label>
          <label>Tier fan <output>{Math.round((document.settings.leafTierFan ?? 0.4) * 180 / Math.PI)}°</output><input type="range" min="0.15" max="0.75" step="0.05" value={document.settings.leafTierFan ?? 0.4} onChange={(event) => updateSetting("leafTierFan", Number(event.target.value))}/></label>
          <label>Leaf bend <output>{Math.round((document.settings.leafBend ?? 0.75) * 180 / Math.PI)}°</output><input type="range" min="0" max="1.5" step="0.05" value={document.settings.leafBend ?? 0.75} onChange={(event) => updateSetting("leafBend", Number(event.target.value))}/></label>
          <label>Carved pockets <output>{Math.round((document.settings.leafPocketDepth ?? 0.5) * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={document.settings.leafPocketDepth ?? 0.5} onChange={(event) => updateSetting("leafPocketDepth", Number(event.target.value))}/></label>
          <label>Leaf arc <output>{Math.round(document.settings.leafArc * 100)}%</output><input type="range" min="0.25" max="1.25" step="0.05" value={document.settings.leafArc} onChange={(event) => updateSetting("leafArc", Number(event.target.value))}/></label>
          <label>Leaf belly <output>{Math.round(document.settings.leafBelly * 100)}%</output><input type="range" min="0.2" max="1.8" step="0.05" value={document.settings.leafBelly} onChange={(event) => updateSetting("leafBelly", Number(event.target.value))}/></label>
          <p className="control-note">Leaf anatomy is locked to the two approved traces; arc and belly alter placement proportions without rebuilding their lobes.</p>
          <label>Leaf variation <output>{Math.round(document.settings.leafVariation * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={document.settings.leafVariation} onChange={(event) => updateSetting("leafVariation", Number(event.target.value))}/></label>
        </section>

        <section>
          <h2>Generation</h2>
          <label>Seed<input type="number" value={document.seed} onChange={(event) => update("seed", Number(event.target.value))}/></label>
          <div className="actions">
            <button className="primary" onClick={() => update("seed", Math.floor(Math.random() * 999999))}>Regenerate</button>
            <button onClick={() => downloadSvg(document, svg)}>Export SVG</button>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header><span>{previewMode === "study" ? "Leaf trace study" : previewMode === "formula" ? "Origin formula study" : previewMode === "volute" ? "Volute construction study" : previewMode === "ornament" ? "Full layout" : "Skeleton preview"}</span><span>{document.width} × {document.height} {document.units}</span></header>
        <div className="canvas-wrap">
          <svg className={`canvas ${isStudy ? "study" : ""} ${drawing || placingSymmetry || addingSecondary || addingAcanthus ? "drawing" : ""}`} viewBox={canvasViewBox} role="img" aria-label={previewMode === "formula" ? "Origin formula motif study" : previewMode === "volute" ? "Volute construction motif study" : "Generated ornamental scroll skeleton"} onPointerDown={handleCanvasPointerDown} onPointerMove={continueDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing}>
            <rect x={isStudy ? studyCanvasX : 0} width={isStudy ? document.height : document.width} height={document.height} fill="#f4eddf"/>
            <rect x={isStudy ? studyCanvasX + document.margin : document.margin} y={document.margin} width={Math.max(0, (isStudy ? document.height : document.width) - document.margin * 2)} height={Math.max(0, document.height - document.margin * 2)} fill="none" stroke="#c5b89f" strokeWidth={document.height * 0.006} strokeDasharray={`${document.height * 0.03} ${document.height * 0.03}`}/>
            {!isStudy && document.settings.symmetry === "horizontal" && <line x1={document.margin} x2={document.width - document.margin} y1={document.height * document.settings.symmetryCenter} y2={document.height * document.settings.symmetryCenter} stroke="#b9653f" strokeWidth={document.height * 0.008} strokeDasharray={`${document.height * 0.035} ${document.height * 0.025}`} opacity="0.55"/>}
            {!isStudy && document.settings.symmetry === "vertical" && <line y1={document.margin} y2={document.height - document.margin} x1={document.width * document.settings.symmetryCenterX} x2={document.width * document.settings.symmetryCenterX} stroke="#b9653f" strokeWidth={document.height * 0.008} strokeDasharray={`${document.height * 0.035} ${document.height * 0.025}`} opacity="0.55"/>}
            {!isStudy && document.settings.symmetry === "point" && <g stroke="#b9653f" strokeWidth={document.height * 0.012} opacity="0.7"><circle cx={document.width * document.settings.symmetryCenterX} cy={document.height * document.settings.symmetryCenter} r={document.height * 0.09} fill="none"/><line x1={document.width * document.settings.symmetryCenterX - document.height * 0.16} x2={document.width * document.settings.symmetryCenterX + document.height * 0.16} y1={document.height * document.settings.symmetryCenter} y2={document.height * document.settings.symmetryCenter}/><line y1={document.height * document.settings.symmetryCenter - document.height * 0.16} y2={document.height * document.settings.symmetryCenter + document.height * 0.16} x1={document.width * document.settings.symmetryCenterX} x2={document.width * document.settings.symmetryCenterX}/></g>}
            {previewMode === "skeleton" && design.paths.map((path) => <path key={path.id} d={path.curves.map((curve, index) => curveToPath(curve, index === 0)).join(" ")} fill="none" stroke={path.role === "primary" ? "#332a1c" : "#826a47"} strokeWidth={document.height * (path.role === "primary" ? 0.018 : 0.011)} strokeLinecap="round" strokeLinejoin="round"/>) }
            {previewMode !== "skeleton" && (displayedDesign.ornaments ?? []).filter((shape) => !shape.id.startsWith("golden-guide-")).map((shape) => <path key={shape.id} d={ornamentToPath(shape)} fill={shape.role === "negative-space" ? "#332a1c" : shape.closed ? "#f4eddf" : "none"} stroke={shape.role === "leaf-rib" ? "#766044" : "#332a1c"} strokeWidth={document.height * (shape.role === "leaf-rib" ? 0.006 : 0.008)} strokeLinecap="round" strokeLinejoin="round"/>)}
            {addingAcanthus && manualFamilyHandles.map((handle) => <g key={`handle-${handle.family.id}`} stroke="#b9653f" fill="#f4eddf" strokeWidth={document.height * 0.012} opacity="0.9"><line x1={handle.root.x} y1={handle.root.y} x2={handle.end.x} y2={handle.end.y}/><circle cx={handle.root.x} cy={handle.root.y} r={document.height * 0.045}/><circle cx={handle.end.x} cy={handle.end.y} r={document.height * 0.065}/></g>)}
            {familyGesture && <g stroke="#b9653f" fill="#f4eddf" strokeWidth={document.height * 0.018} opacity="0.9">{familyGestureRays.map((end, index) => <line key={`gesture-ray-${index}`} x1={familyGesture.root.x} y1={familyGesture.root.y} x2={end.x} y2={end.y}/>) }<circle cx={familyGesture.root.x} cy={familyGesture.root.y} r={document.height * 0.055}/><circle cx={familyGestureRays[0]?.x} cy={familyGestureRays[0]?.y} r={document.height * 0.07}/></g>}
            {drawing && draftPoints.length > 1 && <polyline points={draftPoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#b9653f" strokeWidth={document.height * 0.025} strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>}
          </svg>
        </div>
        <footer><span>{previewMode === "study" ? `${studyDesign.ornaments?.length ?? 0} trace elements` : previewMode === "formula" ? `${formulaDesign.ornaments?.length ?? 0} formula elements` : previewMode === "volute" ? `${voluteDesign.ornaments?.length ?? 0} volute elements` : previewMode === "ornament" ? `${design.ornaments?.length ?? 0} ornamental shapes` : `${design.paths.length} structural paths`}</span><span>Seed {document.seed}</span></footer>
      </section>
    </main>
  );
}
