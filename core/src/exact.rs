//! Exact joins: the third drawing engine, built on exact polygon booleans
//! (`booleans`, i_overlay). Away from roots it draws exactly as the classic
//! engine does (`layers`), with two changes:
//! 1. Every outline is tidied first, so loops, barbs and specks from tight
//!    bends are gone before anything is drawn or covered.
//! 2. At each root (the classic join zone, a circle where a child grows from
//!    its parent) the parent and child are united, and the narrow crotches
//!    between them are filled with a round fillet (a closing: offset out r,
//!    then in r). Inside the zone the outline of that merged shape is drawn
//!    in place of the two parts' own lines; every other part keeps its own
//!    lines and stacking. Where zones overlap, each point of a part's outline
//!    is drawn by the nearest root, so nothing is drawn twice.
use crate::booleans::{area, close, difference, intersect, offset, overlay_union, thin, tidy, union, Shape, Shapes};
use crate::geometry::{distance, pt, Bounds, Point};
use crate::growth::{GrowthPart, GrowthResult};
use crate::joins::{keep_where, split_at_circles};
use crate::layers::{join_zone, layered_drawing, layered_parts, Drawing};
use crate::outline::{visible_lines, Runs};

/// The grown result with every outline tidied. A part whose outline falls
/// apart into several pieces (a lobe turned inside out) keeps its own outline.
pub fn tidied(result: &GrowthResult) -> GrowthResult {
    let parts = result.parts.iter().map(|p| {
        let t = tidy(&p.polygon);
        match t.as_slice() { [one] if one[0].len() >= 3 => GrowthPart { polygon: one[0].clone(), ..p.clone() }, _ => p.clone() }
    }).collect();
    GrowthResult { parts, ..result.clone() }
}

/// Settings for the exact engine.
#[derive(Clone, Copy, Debug)]
pub struct ExactSettings { pub tidy: bool, pub fillet: f64 }
impl Default for ExactSettings { fn default() -> Self { ExactSettings { tidy: true, fillet: 0.8 } } }

/// One root: the circle (the classic join zone) where a child meets its parent.
struct Root { child: usize, parent: usize, at: Point, radius: f64, exit: Point, width: f64 }
impl Root {
    fn has(&self, part: usize) -> bool { self.parent == part || self.child == part }
    fn contains(&self, p: Point) -> bool { distance(p, self.at) < self.radius }
}

fn roots(parts: &[GrowthPart]) -> Vec<Root> {
    parts.iter().enumerate().filter_map(|(ci, c)| {
        let pi = parts.iter().position(|q| Some(&q.id) == c.parent.as_ref())?;
        if c.points.is_empty() || c.polygon.len() < 3 { return None; }
        let at = c.points[0];
        let radius = join_zone(c, &parts[pi]).iter().map(|q| distance(*q, at)).fold(0.0, f64::max);
        // where the child's spine leaves its parent: its outlines cross the
        // parent's about here, one on each side
        let exit = c.points.iter().copied().find(|q| !crate::outline::inside(*q, &parts[pi].polygon)).unwrap_or(at);
        Some(Root { child: ci, parent: pi, at, radius, exit, width: c.width })
    }).collect()
}

/// Parent and child cut to a box around the zone (much faster; the box
/// edges sit 3r outside the zone, so nothing they cause is ever kept).
fn local_shapes(parts: &[GrowthPart], root: &Root, r: f64) -> Vec<(usize, Shapes)> {
    let m = root.radius + 3.0 * r + 0.5;
    let bx: Shapes = vec![vec![vec![pt(root.at.x - m, root.at.y - m), pt(root.at.x + m, root.at.y - m), pt(root.at.x + m, root.at.y + m), pt(root.at.x - m, root.at.y + m)]]];
    [root.parent, root.child].iter().map(|&i| (i, thin(&intersect(&union(&[&parts[i].polygon]), &bx), 0.005))).filter(|(_, s)| !s.is_empty()).collect()
}

/// Fill pieces for one root, given the union of parent and child: a crotch
/// is filled with the largest of r, r/2, r/4 whose fill stays within 3r of
/// its tip (acute Vs, such as a lobe lying along the stem, would otherwise
/// be webbed shut a long way). Only crotches between the two parts are
/// filled, and only pieces wholly inside the zone are kept.
/// Points where the two parts' outlines cross.
fn crossings(local: &[(usize, Shapes)]) -> Vec<Point> {
    let [(_, a), (_, b)] = local else { return vec![] };
    let segs = |s: &Shapes| -> Vec<(Point, Point)> { s.iter().flatten().flat_map(|c| (0..c.len()).map(move |i| (c[i], c[(i + 1) % c.len()]))).collect() };
    let (sa, sb) = (segs(a), segs(b));
    let mut out = vec![];
    for (p, q) in &sa { for (r, s) in &sb {
        if p.x.max(q.x) < r.x.min(s.x) || r.x.max(s.x) < p.x.min(q.x) || p.y.max(q.y) < r.y.min(s.y) || r.y.max(s.y) < p.y.min(q.y) { continue; }
        if let Some(t) = crate::outline::intersection(*p, *q, *r, *s) { out.push(pt(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)); }
    }}
    out
}

fn fills(local: &[(usize, Shapes)], u: &Shapes, root: &Root, r: f64) -> Vec<Shape> {
    let reach = 3.0 * r;
    // only crossings at the child's base count: a curl tip touching the stem
    // further out is never fused on
    let meets: Vec<Point> = crossings(local).into_iter().filter(|m| distance(*m, root.exit) <= 1.5 * root.width + 0.5).collect();
    let mut kept: Vec<Shape> = vec![];
    for k in [r, r / 2.0, r / 4.0] {
        // a smaller radius only when a crotch was too deep for the last one
        let mut too_deep = false;
        // each part's own notches and sinuses stay open
        let own = local.iter().fold(Shapes::new(), |a, (_, s)| { let cl = close(s, k); if a.is_empty() { cl } else { overlay_union(&a, &cl) } });
        let cu = close(u, k);
        let extra = difference(&difference(&cu, u), &own);
        // closing also rounds every concave vertex of the polylines a hair:
        // only real fills (crotches, slivers) are kept
        let least = (k * k * 0.02).max(0.004);
        for s in extra {
            if area(&vec![s.clone()]) < least || !s[0].iter().all(|p| root.contains(*p)) { continue; }
            // a crotch lies between the two parts: it touches both outlines
            if !local.iter().all(|(_, part)| s[0].iter().any(|p| outline_distance(*p, part) < 0.02)) { continue; }
            // and starts where their outlines meet: a curled tip lying near the
            // stem leaves a gap and is never fused on
            let reached = vec![s.clone()];
            if !meets.iter().any(|m| outline_distance(*m, &reached) < 0.05 || crate::outline::inside(*m, &s[0])) { continue; }
            let b = Bounds::of(&s[0]);
            if (b.r - b.l).hypot(b.b - b.t) > reach { too_deep = true; continue; }
            if kept.iter().any(|q| Bounds::of(&q[0]).overlaps(&b)) { continue; }
            kept.push(s);
        }
        if !too_deep { break; }
    }
    kept
}

fn seg_distance(p: Point, a: Point, b: Point) -> f64 {
    let (dx, dy) = (b.x - a.x, b.y - a.y); let l2 = dx * dx + dy * dy;
    let t = if l2 > 0.0 { (((p.x - a.x) * dx + (p.y - a.y) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
    (p.x - a.x - t * dx).hypot(p.y - a.y - t * dy)
}
fn outline_distance(p: Point, s: &Shapes) -> f64 {
    s.iter().flatten().flat_map(|c| (0..c.len()).map(move |i| seg_distance(p, c[i], c[(i + 1) % c.len()]))).fold(f64::INFINITY, f64::min)
}
/// Closed outlines as runs, with no step longer than 0.05 mm (tests are made
/// at step midpoints, and i_overlay returns long straight edges).
/// Outline segments bucketed on a grid, for quick nearest-outline queries.
struct SegIndex { cell: f64, grid: std::collections::HashMap<(i64, i64), Vec<(Point, Point)>> }
impl SegIndex {
    fn new(s: &Shapes, cell: f64) -> SegIndex {
        let mut grid: std::collections::HashMap<(i64, i64), Vec<(Point, Point)>> = Default::default();
        for c in s.iter().flatten() { for i in 0..c.len() {
            let (a, b) = (c[i], c[(i + 1) % c.len()]);
            let (x0, x1) = ((a.x.min(b.x) / cell).floor() as i64, (a.x.max(b.x) / cell).floor() as i64);
            let (y0, y1) = ((a.y.min(b.y) / cell).floor() as i64, (a.y.max(b.y) / cell).floor() as i64);
            for x in x0..=x1 { for y in y0..=y1 { grid.entry((x, y)).or_default().push((a, b)); } }
        }}
        SegIndex { cell, grid }
    }
    /// Distance to the outline, or infinity when it is more than a cell away.
    fn distance(&self, p: Point) -> f64 {
        let (cx, cy) = ((p.x / self.cell).floor() as i64, (p.y / self.cell).floor() as i64);
        let mut d = f64::INFINITY;
        for x in cx - 1..=cx + 1 { for y in cy - 1..=cy + 1 { if let Some(v) = self.grid.get(&(x, y)) { for (a, b) in v { d = d.min(seg_distance(p, *a, *b)); } } } }
        d
    }
}

fn closed_runs(s: &Shapes) -> Runs {
    s.iter().flatten().map(|c| {
        let mut v = vec![];
        for i in 0..c.len() {
            let (a, b) = (c[i], c[(i + 1) % c.len()]);
            let n = (distance(a, b) / 0.05).ceil().max(1.0) as usize;
            for k in 0..n { let t = k as f64 / n as f64; v.push(pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)); }
        }
        if let Some(f) = c.first() { v.push(*f); }
        v
    }).collect()
}

/// How far apart two outlines may be and still count as one edge (i_overlay
/// snaps coordinates to its integer grid).
const SEAM: f64 = 0.004;

/// A stretch of a root's merged outline: the part it belongs to (the nearest
/// of parent and child), and whether it is a fillet arc (on no part at all).
struct Stretch { owner: usize, arc: bool, run: Vec<Point> }

/// One root's merged outline inside its zone, split into stretches for
/// stacking; and its fill pieces.
/// The root that draws `part` at `p`: the nearest of the roots it takes part in
/// whose zone holds `p`.
fn nearest_root(roots: &[Root], part: usize, p: Point) -> Option<usize> {
    roots.iter().enumerate().filter(|(_, r)| r.has(part) && r.contains(p)).min_by(|a, b| distance(p, a.1.at).partial_cmp(&distance(p, b.1.at)).unwrap()).map(|(j, _)| j)
}

fn merged(parts: &[GrowthPart], roots: &[Root], k: usize, r: f64) -> (Vec<Stretch>, Vec<Shape>) {
    let root = &roots[k];
    let local = local_shapes(parts, root, r);
    let u = local.iter().fold(Shapes::new(), |a, (_, s)| if a.is_empty() { s.clone() } else { overlay_union(&a, s) });
    // a fill is only applied where this root draws both its parts (where zones
    // overlap, the nearer root draws), so every root's outline agrees about it
    let mine = |p: &Point| nearest_root(roots, root.parent, *p) == Some(k) && nearest_root(roots, root.child, *p) == Some(k);
    let pieces: Vec<Shape> = if r > 0.0 { fills(&local, &u, root, r).into_iter().filter(|f| f[0].iter().all(mine)).collect() } else { vec![] };
    // each fill grown a hair so it overlaps the parts: after i_overlay's grid
    // snapping the shared seam would otherwise leave a hairline hole
    let mut m = pieces.iter().fold(u.clone(), |a, f| overlay_union(&a, &offset(&vec![f.clone()], 0.01)));
    // hairline holes where the parts meet (classic hides them too); a real eye
    // between two parts is far larger
    for s in m.iter_mut() { let outer = s.remove(0); s.retain(|h| crate::booleans::signed_area(h).abs() >= 0.05); s.insert(0, outer); }
    let runs = keep_where(split_at_circles(closed_runs(&m), &[(root.at, root.radius)]), |p| root.contains(p));
    let index: Vec<(usize, SegIndex)> = local.iter().map(|(i, s)| (*i, SegIndex::new(s, 0.5))).collect();
    let on_u = SegIndex::new(&u, 0.5);
    let owner = |p: Point| index.iter().map(|(i, s)| (s.distance(p), *i)).fold((f64::INFINITY, usize::MAX), |a, b| if b.0 < a.0 { b } else { a }).1;
    let mut out = vec![];
    for run in runs {
        let (mut cur, mut key): (Vec<Point>, (usize, bool)) = (vec![], (usize::MAX, false));
        for w in run.windows(2) {
            let mid = pt((w[0].x + w[1].x) / 2.0, (w[0].y + w[1].y) / 2.0);
            let k = (owner(mid), !pieces.is_empty() && on_u.distance(mid) > SEAM);
            if k != key { if cur.len() > 1 { out.push(Stretch { owner: key.0, arc: key.1, run: std::mem::take(&mut cur) }); } cur = vec![w[0]]; key = k; }
            cur.push(w[1]);
        }
        if cur.len() > 1 { out.push(Stretch { owner: key.0, arc: key.1, run: cur }); }
    }
    (out, pieces)
}

/// Normal view and SVG export with the exact engine.
pub fn exact_drawing(result: &GrowthResult, s: ExactSettings) -> Drawing {
    let clean;
    let g = if s.tidy { clean = tidied(result); &clean } else { result };
    if s.fillet <= 0.0 { return layered_drawing(g); }
    let parts = &g.parts;
    let roots = roots(parts);
    let mut each = layered_parts(g);
    // each part's own outline gives way inside every zone it takes part in
    for (i, d) in each.iter_mut().enumerate() {
        let mine: Vec<&Root> = roots.iter().filter(|r| r.has(i)).collect();
        if mine.is_empty() { continue; }
        let circles: Vec<(Point, f64)> = mine.iter().map(|r| (r.at, r.radius)).collect();
        d.outline = keep_where(split_at_circles(std::mem::take(&mut d.outline), &circles), |p| !mine.iter().any(|r| r.contains(p)));
    }
    let all: Vec<(Vec<Stretch>, Vec<Shape>)> = (0..roots.len()).map(|k| merged(parts, &roots, k, s.fillet)).collect();
    let (mut edges, mut arcs): (Runs, Runs) = (vec![], vec![]);
    for (k, (root, (stretches, pieces))) in roots.iter().zip(&all).enumerate() {
        // cuts and folds of the two parts give way only where the fill covers them
        let hide: Vec<&[Point]> = pieces.iter().map(|f| f[0].as_slice()).collect();
        if !hide.is_empty() { for i in [root.parent, root.child] {
            let d = &mut each[i];
            d.cuts = visible_lines(&std::mem::take(&mut d.cuts), &hide, &[]);
            d.folds = visible_lines(&std::mem::take(&mut d.folds), &hide, &[]);
        }}
        for st in stretches {
            // stacking as in classic, except the other part of this root
            let other = if st.owner == root.parent { root.child } else { root.parent };
            let covers: Vec<&[Point]> = parts.iter().enumerate().skip(st.owner + 1).filter(|(i, _)| *i != other).map(|(_, p)| p.polygon.as_slice()).collect();
            // where another zone of the same part overlaps, the nearer root draws
            // (fillet arcs included: a fill in another root's territory is not
            // applied, so the two roots' outlines always agree)
            let nearest_for = |part: usize, p: Point| nearest_root(&roots, part, p) == Some(k);
            // an arc joins both parts, so this root must be the nearer one for both
            let nearest = |p: Point| nearest_for(st.owner, p) && (!st.arc || (nearest_for(root.parent, p) && nearest_for(root.child, p)));
            let drawn = visible_lines(&keep_where(vec![st.run.clone()], nearest), &covers, &[]);
            if st.arc { arcs.extend(drawn) } else { edges.extend(drawn) }
        }
    }
    let (mut outline, mut folds) = (vec![], vec![]);
    for d in each { outline.extend(d.outline); outline.extend(d.cuts); folds.extend(d.folds); }
    outline.extend(edges); outline.extend(arcs);
    Drawing { outline, folds }
}

/// Study aid: every root's fill pieces, and its zone as a circle.
pub fn debug_fills(result: &GrowthResult, r: f64) -> (Shapes, Runs) {
    let g = tidied(result); let (mut f, mut z) = (vec![], vec![]);
    let rs = roots(&g.parts);
    for (k, root) in rs.iter().enumerate() {
        f.extend(merged(&g.parts, &rs, k, r).1);
        z.push((0..=40).map(|k| { let a = k as f64 * std::f64::consts::TAU / 40.0; pt(root.at.x + root.radius * a.cos(), root.at.y + root.radius * a.sin()) }).collect());
    }
    (f, z)
}

/// Study aid: what happens to the outline near one point.
pub fn debug_point(result: &GrowthResult, r: f64, p: Point) -> Vec<String> {
    let g = tidied(result); let parts = &g.parts; let mut out = vec![];
    for (i, q) in parts.iter().enumerate() {
        let d = (0..q.polygon.len()).map(|j| seg_distance(p, q.polygon[j], q.polygon[(j + 1) % q.polygon.len()])).fold(f64::INFINITY, f64::min);
        if d < 0.3 || crate::outline::inside(p, &q.polygon) { out.push(format!("part #{i} {}: outline {d:.3} away, inside {}", q.id, crate::outline::inside(p, &q.polygon))); }
    }
    let rs = roots(parts);
    for (k, root) in rs.iter().enumerate() {
        if !root.contains(p) { continue; }
        let (st, _) = merged(parts, &rs, k, r);
        let near: Vec<String> = st.iter().filter(|s| s.run.iter().any(|q| distance(*q, p) < 0.1)).map(|s| format!("owner #{} arc {}", s.owner, s.arc)).collect();
        let (_, fl) = merged(parts, &rs, k, r);
        for (j, f) in fl.iter().enumerate() { let b = Bounds::of(&f[0]); out.push(format!("  fill {j}: {} contours, {} pts, box ({:.2},{:.2})-({:.2},{:.2}), probe inside {}, outline {:.3} away", f.len(), f[0].len(), b.l, b.t, b.r, b.b, crate::outline::inside(p, &f[0]), outline_distance(p, &vec![f.clone()]))); }
        out.push(format!("root {k} (parent #{}, child #{}) at ({:.2},{:.2}) r {:.2}: merged stretches near: {near:?}", root.parent, root.child, root.at.x, root.at.y, root.radius));
    }
    out
}
