//! Drawing the grown pattern: merged roots, over/under elsewhere, and the
//! carving-guide view (visible edges, raised ridges, recessed creases).
use crate::geometry::{lerp, line_frame, pt, Point};
use crate::growth::{GrowthPart, GrowthResult};
use crate::outline::{inside, intersection, visible_lines, Join, Runs};
use std::f64::consts::PI;

fn closed(p: &[Point]) -> Vec<Point> { let mut v = p.to_vec(); if let Some(f) = p.first() { v.push(*f); } v }
fn circle(c: Point, r: f64, n: usize) -> Vec<Point> { (0..n).map(|i| { let a = i as f64 * 2.0 * PI / n as f64; pt(c.x + r * a.cos(), c.y + r * a.sin()) }).collect() }

/// Root join zone: from the root to just past where the child leaves its parent.
pub fn join_zone(part: &GrowthPart, parent: &GrowthPart) -> Vec<Point> {
    let root = part.points[0]; let mut exit = 0;
    while exit < part.points.len() - 1 && inside(part.points[exit], &parent.polygon) { exit += 1; }
    let unit = part.width.max(0.8);
    let r = ((part.points[exit].x - root.x).hypot(part.points[exit].y - root.y) + unit * 0.9).min(unit * 2.8);
    circle(root, r, 40)
}

pub struct Drawing { pub outline: Runs, pub folds: Runs }

/// Normal view and SVG export.
pub fn layered_drawing(result: &GrowthResult) -> Drawing {
    let parts = &result.parts;
    let zones: Vec<Option<Vec<Point>>> = parts.iter().map(|p| parts.iter().find(|q| Some(&q.id) == p.parent.as_ref()).map(|par| join_zone(p, par))).collect();
    let (mut outline, mut folds) = (vec![], vec![]);
    for (index, part) in parts.iter().enumerate() {
        let covers: Vec<&[Point]> = parts[index + 1..].iter().map(|p| p.polygon.as_slice()).collect();
        let mut joins: Vec<Join> = vec![];
        if let Some(parent) = parts.iter().find(|q| Some(&q.id) == part.parent.as_ref()) { joins.push(Join { collar: zones[index].as_ref().unwrap(), stems: vec![&parent.polygon] }); }
        for (ci, child) in parts[..index].iter().enumerate() { if child.parent.as_ref() == Some(&part.id) { joins.push(Join { collar: zones[ci].as_ref().unwrap(), stems: vec![&child.polygon] }); } }
        outline.extend(visible_lines(&[closed(&part.polygon)], &covers, &joins));
        outline.extend(visible_lines(&part.cuts, &covers, &joins));
        folds.extend(visible_lines(&part.folds, &covers, &joins));
    }
    Drawing { outline, folds }
}

pub struct Guides { pub outline: Runs, pub creases: Runs, pub ridges: Runs }

/// Carving guides: later parts sit above earlier ones; roots stay open.
pub fn carving_guides(result: &GrowthResult) -> Guides {
    let parts = &result.parts;
    let (mut outline, mut creases, mut ridges) = (vec![], vec![], vec![]);
    for (index, part) in parts.iter().enumerate() {
        let covers: Vec<&[Point]> = parts[index + 1..].iter().map(|p| p.polygon.as_slice()).collect();
        let parent = parts.iter().find(|q| Some(&q.id) == part.parent.as_ref());
        let collar = circle(part.points[0], (part.width * 1.5).max(1.0), 32);
        let joins: Vec<Join> = parent.map(|p| vec![Join { collar: &collar, stems: vec![&p.polygon] }]).unwrap_or_default();
        outline.extend(visible_lines(&[closed(&part.polygon)], &covers, &joins));
        outline.extend(visible_lines(&part.cuts, &covers, &joins));
        creases.extend(visible_lines(&part.folds, &covers, &joins));
        let estimated;
        let lines: &Vec<Vec<Point>> = match &part.ridges { Some(r) => r, None => { estimated = estimate_ridges(part); &estimated } };
        ridges.extend(visible_lines(lines, &covers, &joins));
    }
    Guides { outline, creases, ridges }
}

/// Fallback raised rib from local cross-sections (parts without a midrib).
fn estimate_ridges(part: &GrowthPart) -> Vec<Vec<Point>> {
    let mut runs = vec![]; let mut run: Vec<Point> = vec![];
    for k in 0..=70 {
        let (fp, fa) = line_frame(&part.points, 0.12 + 0.68 * k as f64 / 70.0); let n = pt(-fa.sin(), fa.cos());
        let span = part.length.max(1.0); let a = pt(fp.x - n.x * span, fp.y - n.y * span); let b = pt(fp.x + n.x * span, fp.y + n.y * span);
        let mut hits: Vec<f64> = (0..part.polygon.len()).filter_map(|j| intersection(a, b, part.polygon[j], part.polygon[(j + 1) % part.polygon.len()])).collect();
        hits.sort_by(|x, y| x.partial_cmp(y).unwrap());
        let mut candidate = None;
        for j in 1..hits.len() { if hits[j - 1] > 0.505 || hits[j] < 0.495 { continue; } let p = lerp(a, b, (hits[j - 1] + hits[j]) / 2.0); if inside(p, &part.polygon) { candidate = Some(p); break; } }
        match candidate {
            Some(c) if run.is_empty() || { let l = run.last().unwrap(); (c.x - l.x).hypot(c.y - l.y) < part.length * 0.06 } => run.push(c),
            _ => { if run.len() > 8 { runs.push(std::mem::take(&mut run)); } run = candidate.map(|c| vec![c]).unwrap_or_default(); }
        }
    }
    if run.len() > 8 { runs.push(run); }
    runs
}
