import type { CarvingDocument, CubicCurve, OrnamentShape, ScrollDesign } from "../types";

const format = (value: number): string => Number(value.toFixed(4)).toString();

export function curveToPath(curve: CubicCurve, first: boolean): string {
  const move = first ? `M ${format(curve.start.x)} ${format(curve.start.y)} ` : "";
  return `${move}C ${format(curve.control1.x)} ${format(curve.control1.y)}, ${format(curve.control2.x)} ${format(curve.control2.y)}, ${format(curve.end.x)} ${format(curve.end.y)}`;
}

export function ornamentToPath(shape: OrnamentShape): string {
  if (shape.pathData) return shape.pathData;
  if (shape.points.length === 0) return "";
  const commands = [`M ${format(shape.points[0].x)} ${format(shape.points[0].y)}`];
  for (let index = 1; index < shape.points.length; index += 1) {
    commands.push(`L ${format(shape.points[index].x)} ${format(shape.points[index].y)}`);
  }
  if (shape.closed) commands.push("Z");
  return commands.join(" ");
}

export function designToSvg(document: CarvingDocument, design: ScrollDesign): string {
  const unit = document.units;
  const paths = design.paths.map((path) => {
    const d = path.curves.map((curve, index) => curveToPath(curve, index === 0)).join(" ");
    const width = path.role === "primary" ? document.height * 0.018 : document.height * 0.011;
    return `    <path id="${path.id}" data-role="${path.role}" d="${d}" fill="none" stroke="#17140f" stroke-width="${format(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("\n");
  const ornaments = (design.ornaments ?? []).filter((shape) => !shape.id.startsWith("golden-guide-")).map((shape) => {
    const isRib = shape.role === "leaf-rib";
    const fill = shape.role === "negative-space" ? "#17140f" : shape.closed ? "#ffffff" : "none";
    const width = document.height * (isRib ? 0.006 : 0.008);
    return `    <path id="${shape.id}" data-role="${shape.role}" d="${ornamentToPath(shape)}" fill="${fill}" stroke="#17140f" stroke-width="${format(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${format(document.width)}${unit}" height="${format(document.height)}${unit}" viewBox="0 0 ${format(document.width)} ${format(document.height)}">
  <g id="BOUNDARY"><rect x="0" y="0" width="${format(document.width)}" height="${format(document.height)}" fill="none" stroke="#888" stroke-width="0.01"/></g>
  <g id="ORNAMENT">
${ornaments}
  </g>
  <g id="SCROLL_SKELETON"${design.ornaments?.length ? " style=\"display:none\"" : ""}>
${paths}
  </g>
</svg>`;
}
