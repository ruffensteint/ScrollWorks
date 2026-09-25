//! Smooth joins: the second drawing engine. Everything is drawn exactly as the
//! classic engine draws it (`layers::layered_drawing`), except where a part
//! grows out of its parent. There, instead of cutting both outlines away inside
//! a small circle (which left hairline stubs, seams and knobs), the parent and
//! every child rooted close by are merged into one shape with a soft fillet,
//! the way a carver blends a root into its stem, and that merged outline is
//! drawn in their place.
//!
//! The merge is computed on a small local grid around each cluster of roots:
//! signed distance to each shape, a smooth minimum whose fillet radius fades to
//! nothing at the edge of the zone (so the merged outline meets the untouched
//! outlines exactly), and marching squares to trace it.
use crate::geometry::{distance, pt, Bounds, Point};
use crate::growth::{GrowthPart, GrowthResult};
use crate::layers::{join_zone, Drawing};
use crate::outline::{inside, visible_lines, Join, Runs};

fn closed(p: &[Point]) -> Vec<Point> { let mut v = p.to_vec(); if let Some(f) = p.first() { v.push(*f); } v }

/// One root merging into its parent.
struct Root { child: usize, parent: usize, at: Point, radius: f64, fillet: f64 }

/// Roots of the same parent whose zones overlap are merged together.
struct Cluster { parent: usize, roots: Vec<Root> }

fn seg_distance(p: Point, a: Point, b: Point) -> f64 {
    let (dx, dy) = (b.x - a.x, b.y - a.y); let l2 = dx * dx + dy * dy;
    let t = if l2 > 0.0 { (((p.x - a.x) * dx + (p.y - a.y) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
    (p.x - a.x - t * dx).hypot(p.y - a.y - t * dy)
}

/// Signed distance (negative inside) to a polygon over a grid: distances use
/// only the edges near the grid, and inside/outside comes from each grid row's
/// crossings with the whole outline (so no per-point polygon test).
struct Field { edges: Vec<(Point, Point)>, rows: Vec<Vec<f64>>, cell: f64, origin: Point, gw: usize, gh: usize, buckets: Vec<Vec<u32>> }
impl Field {
    /// `band`: distances are only needed accurately up to this far from the
    /// outline (the fillet and the zero crossing live inside it).
    fn new(poly: &[Point], area: &Bounds, band: f64, origin: Point, h: f64, ny: usize) -> Field {
        let n = poly.len();
        let edges: Vec<(Point, Point)> = (0..n).map(|i| (poly[i], poly[(i + 1) % n])).filter(|(a, b)| {
            a.x.max(b.x) >= area.l - band && a.x.min(b.x) <= area.r + band && a.y.max(b.y) >= area.t - band && a.y.min(b.y) <= area.b + band
        }).collect();
        let rows = (0..ny).map(|j| {
            let y = origin.y + j as f64 * h;
            let mut xs: Vec<f64> = (0..n).filter_map(|i| { let (a, b) = (poly[i], poly[(i + 1) % n]); if (a.y > y) != (b.y > y) { Some(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)) } else { None } }).collect();
            xs.sort_by(|a, b| a.partial_cmp(b).unwrap()); xs
        }).collect();
        // bucket edges so each query only looks at its neighbourhood
        let cell = band.max(0.2); let o = pt(area.l - band, area.t - band);
        let gw = (((area.r - area.l) + 2.0 * band) / cell).ceil() as usize + 1; let gh = (((area.b - area.t) + 2.0 * band) / cell).ceil() as usize + 1;
        let mut buckets = vec![vec![]; gw * gh];
        for (k, (a, b)) in edges.iter().enumerate() {
            let (x0, x1) = (((a.x.min(b.x) - o.x) / cell).floor().max(0.0) as usize, ((a.x.max(b.x) - o.x) / cell).floor().max(0.0) as usize);
            let (y0, y1) = (((a.y.min(b.y) - o.y) / cell).floor().max(0.0) as usize, ((a.y.max(b.y) - o.y) / cell).floor().max(0.0) as usize);
            for y in y0..=y1.min(gh - 1) { for x in x0..=x1.min(gw - 1) { buckets[y * gw + x].push(k as u32); } }
        }
        Field { edges, rows, cell, origin: o, gw, gh, buckets }
    }
    /// Unsigned distance to the outline (capped at the band), and the unit
    /// direction from the nearest outline point toward `p`.
    fn near(&self, p: Point) -> (f64, Point) {
        let (cx, cy) = (((p.x - self.origin.x) / self.cell).floor() as i64, ((p.y - self.origin.y) / self.cell).floor() as i64);
        let (mut d, mut q) = (self.cell, p);
        for y in cy - 1..=cy + 1 { for x in cx - 1..=cx + 1 {
            if x < 0 || y < 0 || x as usize >= self.gw || y as usize >= self.gh { continue; }
            for &k in &self.buckets[y as usize * self.gw + x as usize] {
                let (a, b) = self.edges[k as usize];
                let (dx, dy) = (b.x - a.x, b.y - a.y); let l2 = dx * dx + dy * dy;
                let t = if l2 > 0.0 { (((p.x - a.x) * dx + (p.y - a.y) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
                let c = pt(a.x + t * dx, a.y + t * dy); let e = distance(p, c);
                if e < d { d = e; q = c; }
            }
        }}
        let l = distance(p, q);
        (d, if l > 1e-12 { pt((p.x - q.x) / l, (p.y - q.y) / l) } else { pt(0.0, 0.0) })
    }
    fn dist(&self, p: Point) -> f64 { self.near(p).0 }
    /// Signed distance and outward direction (flipped inside).
    fn at(&self, j: usize, p: Point) -> (f64, Point) {
        let (d, n) = self.near(p);
        let crossings = self.rows[j].partition_point(|x| *x < p.x);
        if crossings % 2 == 1 { (-d, pt(-n.x, -n.y)) } else { (d, n) }
    }
}

/// Polynomial smooth minimum; k is the fillet radius (0 = plain minimum).
fn smin(a: f64, b: f64, k: f64) -> f64 {
    if k <= 1e-9 { return a.min(b); }
    let h = (k - (a - b).abs()).max(0.0) / k;
    a.min(b) - h * h * k * 0.25
}

fn smooth(x: f64) -> f64 { let c = x.clamp(0.0, 1.0); c * c * (3.0 - 2.0 * c) }

/// Trace the zero level of a grid field into polylines (marching squares).
fn contour(f: &[f64], nx: usize, ny: usize, origin: Point, h: f64) -> Runs {
    let at = |i: usize, j: usize| f[j * nx + i];
    let pos = |i: usize, j: usize| pt(origin.x + i as f64 * h, origin.y + j as f64 * h);
    let lerp_edge = |i0: usize, j0: usize, i1: usize, j1: usize| {
        let (a, b) = (at(i0, j0), at(i1, j1)); let t = if (a - b).abs() > 1e-12 { a / (a - b) } else { 0.5 };
        let (p, q) = (pos(i0, j0), pos(i1, j1)); pt(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)
    };
    let mut segs: Vec<(Point, Point)> = vec![];
    for j in 0..ny - 1 { for i in 0..nx - 1 {
        let (v0, v1, v2, v3) = (at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
        let code = (v0 < 0.0) as u8 | ((v1 < 0.0) as u8) << 1 | ((v2 < 0.0) as u8) << 2 | ((v3 < 0.0) as u8) << 3;
        if code == 0 || code == 15 { continue; }
        let (e0, e1, e2, e3) = (|| lerp_edge(i, j, i + 1, j), || lerp_edge(i + 1, j, i + 1, j + 1), || lerp_edge(i + 1, j + 1, i, j + 1), || lerp_edge(i, j + 1, i, j));
        let centre = (v0 + v1 + v2 + v3) / 4.0;
        match code {
            1 | 14 => segs.push((e3(), e0())), 2 | 13 => segs.push((e0(), e1())), 4 | 11 => segs.push((e1(), e2())), 8 | 7 => segs.push((e2(), e3())),
            3 | 12 => segs.push((e3(), e1())), 6 | 9 => segs.push((e0(), e2())),
            5 => if centre < 0.0 { segs.push((e3(), e2())); segs.push((e0(), e1())); } else { segs.push((e3(), e0())); segs.push((e1(), e2())); },
            10 => if centre < 0.0 { segs.push((e0(), e3())); segs.push((e1(), e2())); } else { segs.push((e0(), e1())); segs.push((e2(), e3())); },
            _ => {}
        }
    }}
    chain(segs, h * 1e-3)
}

/// Join segments that share end points into polylines.
fn chain(segs: Vec<(Point, Point)>, tol: f64) -> Runs {
    use std::collections::HashMap;
    let key = |p: Point| ((p.x / tol).round() as i64, (p.y / tol).round() as i64);
    let mut ends: HashMap<(i64, i64), Vec<usize>> = HashMap::new();
    for (i, (a, b)) in segs.iter().enumerate() { ends.entry(key(*a)).or_default().push(i); ends.entry(key(*b)).or_default().push(i); }
    let mut used = vec![false; segs.len()]; let mut runs = vec![];
    for s in 0..segs.len() {
        if used[s] { continue; }
        used[s] = true; let mut run = vec![segs[s].0, segs[s].1];
        for forward in [true, false] {
            loop {
                let tip = if forward { *run.last().unwrap() } else { run[0] };
                let Some(&n) = ends.get(&key(tip)).and_then(|v| v.iter().find(|&&k| !used[k])) else { break };
                used[n] = true; let (a, b) = segs[n];
                let next = if key(a) == key(tip) { b } else { a };
                if forward { run.push(next); } else { run.insert(0, next); }
            }
        }
        runs.push(run);
    }
    runs
}

/// Douglas–Peucker simplification: grid contours carry many tiny segments.
fn simplify(run: &[Point], tol: f64) -> Vec<Point> {
    if run.len() < 3 { return run.to_vec(); }
    let (a, b) = (run[0], run[run.len() - 1]);
    let (mut worst, mut at) = (0.0, 0);
    for (i, p) in run.iter().enumerate().take(run.len() - 1).skip(1) { let d = seg_distance(*p, a, b); if d > worst { worst = d; at = i; } }
    if worst <= tol { return vec![a, b]; }
    let mut left = simplify(&run[..=at], tol); let right = simplify(&run[at..], tol);
    left.pop(); left.extend(right); left
}

/// Split runs into the pieces that satisfy `keep` (tested at segment midpoints).
pub(crate) fn keep_where(runs: Runs, keep: impl Fn(Point) -> bool) -> Runs {
    let mut out = vec![];
    for r in runs {
        let mut cur: Vec<Point> = vec![];
        for w in r.windows(2) {
            let m = pt((w[0].x + w[1].x) / 2.0, (w[0].y + w[1].y) / 2.0);
            if keep(m) { if cur.is_empty() { cur.push(w[0]); } cur.push(w[1]); } else if cur.len() > 1 { out.push(std::mem::take(&mut cur)); } else { cur.clear(); }
        }
        if cur.len() > 1 { out.push(cur); }
    }
    out
}

/// Split every segment where it crosses one of the circles, so pieces can be
/// kept or dropped exactly at a zone's edge.
pub(crate) fn split_at_circles(runs: Runs, circles: &[(Point, f64)]) -> Runs {
    runs.into_iter().map(|r| {
        let mut out = vec![]; if r.is_empty() { return out; } out.push(r[0]);
        for w in r.windows(2) {
            let (a, b) = (w[0], w[1]); let (dx, dy) = (b.x - a.x, b.y - a.y);
            let mut ts: Vec<f64> = vec![];
            for (c, rad) in circles {
                let (fx, fy) = (a.x - c.x, a.y - c.y);
                let (qa, qb, qc) = (dx * dx + dy * dy, 2.0 * (fx * dx + fy * dy), fx * fx + fy * fy - rad * rad);
                let disc = qb * qb - 4.0 * qa * qc; if qa < 1e-18 || disc < 0.0 { continue; }
                for t in [(-qb - disc.sqrt()) / (2.0 * qa), (-qb + disc.sqrt()) / (2.0 * qa)] { if t > 1e-9 && t < 1.0 - 1e-9 { ts.push(t); } }
            }
            ts.sort_by(|x, y| x.partial_cmp(y).unwrap());
            for t in ts { out.push(pt(a.x + dx * t, a.y + dy * t)); }
            out.push(b);
        }
        out
    }).collect()
}

fn roots(parts: &[GrowthPart]) -> Vec<Root> {
    parts.iter().enumerate().filter_map(|(ci, c)| {
        let pi = parts.iter().position(|q| Some(&q.id) == c.parent.as_ref())?;
        if c.points.is_empty() || c.polygon.len() < 3 { return None; }
        let zone = join_zone(c, &parts[pi]);
        let r0 = zone.iter().map(|q| distance(*q, c.points[0])).fold(0.0, f64::max);
        let radius = (r0 * 1.2).clamp(1.5, 5.0);
        let fillet = (c.width * 0.12).clamp(0.3, 0.7);
        Some(Root { child: ci, parent: pi, at: c.points[0], radius, fillet })
    }).collect()
}

fn clusters(parts: &[GrowthPart]) -> Vec<Cluster> {
    let mut out: Vec<Cluster> = vec![];
    for r in roots(parts) {
        let hit = out.iter().position(|c| c.parent == r.parent && c.roots.iter().any(|q| distance(q.at, r.at) < q.radius + r.radius));
        match hit { Some(i) => out[i].roots.push(r), None => out.push(Cluster { parent: r.parent, roots: vec![r] }) }
    }
    out
}

impl Cluster {
    fn members(&self) -> Vec<usize> { let mut m = vec![self.parent]; m.extend(self.roots.iter().map(|r| r.child)); m }
    /// Inside the zone where this cluster's merged outline replaces the parts' own.
    fn in_zone(&self, p: Point) -> bool { self.roots.iter().any(|r| distance(p, r.at) < r.radius) }
    fn bounds(&self) -> Bounds {
        let mut b = Bounds { l: f64::INFINITY, t: f64::INFINITY, r: f64::NEG_INFINITY, b: f64::NEG_INFINITY };
        for r in &self.roots { b.l = b.l.min(r.at.x - r.radius); b.r = b.r.max(r.at.x + r.radius); b.t = b.t.min(r.at.y - r.radius); b.b = b.b.max(r.at.y + r.radius); }
        b
    }
}

/// The merged outline of one cluster, before covers are applied, with the
/// member each piece belongs to (the nearest shape), for stacking.
fn merged_outline(parts: &[GrowthPart], c: &Cluster) -> Vec<(usize, Vec<Point>)> {
    let area = c.bounds();
    let fine = c.roots.iter().map(|r| r.fillet).fold(f64::INFINITY, f64::min);
    let h = (fine / 4.0).clamp(0.05, 0.12);
    let pad = 2.0 * h;
    let (nx, ny) = (((area.r - area.l + 2.0 * pad) / h).ceil() as usize + 1, ((area.b - area.t + 2.0 * pad) / h).ceil() as usize + 1);
    if nx * ny > 4_000_000 { return vec![]; }
    let origin = pt(area.l - pad, area.t - pad);
    let band = c.roots.iter().map(|r| r.fillet).fold(0.0, f64::max) * 2.0 + 4.0 * h;
    let parent = Field::new(&parts[c.parent].polygon, &area, band, origin, h, ny);
    let children: Vec<(Field, &Root)> = c.roots.iter().map(|r| (Field::new(&parts[r.child].polygon, &area, band, origin, h, ny), r)).collect();
    let mut f = vec![0.0; nx * ny];
    for j in 0..ny { for i in 0..nx {
        let p = pt(origin.x + i as f64 * h, origin.y + j as f64 * h);
        let (mut v, mut nv) = parent.at(j, p);
        for (field, r) in &children {
            let (w, nw) = field.at(j, p);
            // the fillet fades to a plain union at the edge of the root's zone,
            // and only rounds real corners: where two outlines run side by
            // side (same facing) it would bulge them, so it stays off there
            let facing = nv.x * nw.x + nv.y * nw.y;
            let corner = ((0.9 - facing) / 0.6).clamp(0.0, 1.0);
            let k = r.fillet * smooth(1.0 - distance(p, r.at) / r.radius) * corner;
            if w < v { nv = nw; }
            v = smin(v, w, k);
        }
        f[j * nx + i] = v;
    }}
    let circles: Vec<(Point, f64)> = c.roots.iter().map(|r| (r.at, r.radius)).collect();
    let traced: Runs = contour(&f, nx, ny, origin, h).iter().map(|r| simplify(r, h * 0.15)).collect();
    let runs = keep_where(split_at_circles(traced, &circles), |m| c.in_zone(m));
    // attribute each stretch to the nearest member, so the parts above that
    // member (and only those) can cover it
    let owner = |p: Point| -> usize {
        let dp = parent.dist(p);
        children.iter().map(|(fl, r)| (fl.dist(p), r.child)).fold((dp, c.parent), |a, b| if b.0 < a.0 { b } else { a }).1
    };
    let mut out = vec![];
    for r in runs {
        let mut cur: Vec<Point> = vec![]; let mut who = usize::MAX;
        for w in r.windows(2) {
            let m = pt((w[0].x + w[1].x) / 2.0, (w[0].y + w[1].y) / 2.0); let o = owner(m);
            if o != who && cur.len() > 1 { out.push((who, std::mem::take(&mut cur))); }
            if o != who { cur = vec![w[0]]; who = o; }
            cur.push(w[1]);
        }
        if cur.len() > 1 { out.push((who, cur)); }
    }
    out
}

/// Line hygiene: where a line runs alongside an earlier one closer than `tol`
/// (same direction, for at least `min_len`), the later stretch is dropped, so
/// near-coincident edges read as one carved line instead of a double line.
fn drop_doubles(runs: Runs, tol: f64, min_len: f64) -> Runs {
    use std::collections::HashMap;
    let cell = tol.max(0.05) * 2.0;
    let key = |p: Point| ((p.x / cell).floor() as i64, (p.y / cell).floor() as i64);
    let mut grid: HashMap<(i64, i64), Vec<(Point, Point)>> = HashMap::new();
    let mut out: Runs = vec![];
    for run in runs {
        // densify so each test point is close to its neighbours
        let mut pts: Vec<Point> = vec![];
        for w in run.windows(2) { let n = (distance(w[0], w[1]) / (tol * 0.5)).ceil().max(1.0) as usize; for k in 0..n { let t = k as f64 / n as f64; pts.push(pt(w[0].x + (w[1].x - w[0].x) * t, w[0].y + (w[1].y - w[0].y) * t)); } }
        if let Some(l) = run.last() { pts.push(*l); }
        if pts.len() < 2 { continue; }
        let dup: Vec<bool> = (0..pts.len()).map(|i| {
            let p = pts[i]; let (a, b) = (pts[i.saturating_sub(1)], pts[(i + 1).min(pts.len() - 1)]);
            let (dx, dy) = (b.x - a.x, b.y - a.y); let l = dx.hypot(dy).max(1e-12);
            let (cx, cy) = key(p);
            (cx - 1..=cx + 1).any(|x| (cy - 1..=cy + 1).any(|y| grid.get(&(x, y)).is_some_and(|v| v.iter().any(|(s, e)| {
                let (ex, ey) = (e.x - s.x, e.y - s.y); let el = ex.hypot(ey).max(1e-12);
                seg_distance(p, *s, *e) < tol && ((dx * ex + dy * ey) / (l * el)).abs() > 0.94
            }))))
        }).collect();
        // only drop duplicate stretches that are long enough to be a real double line
        let mut keep = vec![true; pts.len()];
        let mut i = 0;
        while i < pts.len() {
            if !dup[i] { i += 1; continue; }
            let mut j = i; let mut len = 0.0;
            while j + 1 < pts.len() && dup[j + 1] { len += distance(pts[j], pts[j + 1]); j += 1; }
            if len >= min_len { for k in i..=j { keep[k] = false; } }
            i = j + 1;
        }
        let mut cur: Vec<Point> = vec![];
        for (k, p) in pts.iter().enumerate() { if keep[k] { cur.push(*p); } else if cur.len() > 1 { out.push(std::mem::take(&mut cur)); } else { cur.clear(); } }
        if cur.len() > 1 { out.push(cur); }
        for w in run.windows(2) {
            let n = (distance(w[0], w[1]) / cell).ceil().max(1.0) as usize;
            for k in 0..=n { let t = k as f64 / n as f64; let q = pt(w[0].x + (w[1].x - w[0].x) * t, w[0].y + (w[1].y - w[0].y) * t); grid.entry(key(q)).or_default().push((w[0], w[1])); }
        }
    }
    // tidy the densified runs back down
    out.into_iter().map(|r| simplify(&r, 0.004)).collect()
}

/// Normal view and SVG export, with smooth filleted joins.
pub fn smooth_drawing(result: &GrowthResult) -> Drawing {
    let parts = &result.parts;
    let clusters = clusters(parts);
    let (mut outline, mut folds): (Runs, Runs) = (vec![], vec![]);
    // Everything of a cluster member inside its cluster's zone is replaced by
    // the merged outline; folds keep the classic root handling.
    let zones_of = |i: usize| -> Vec<&Cluster> { clusters.iter().filter(|c| c.members().contains(&i)).collect() };
    let classic_zones: Vec<Option<Vec<Point>>> = parts.iter().map(|p| parts.iter().find(|q| Some(&q.id) == p.parent.as_ref()).map(|par| join_zone(p, par))).collect();
    for (index, part) in parts.iter().enumerate() {
        let covers: Vec<&[Point]> = parts[index + 1..].iter().map(|p| p.polygon.as_slice()).collect();
        let mine = zones_of(index);
        let mut joins: Vec<Join> = vec![];
        if let Some(parent) = parts.iter().find(|q| Some(&q.id) == part.parent.as_ref()) { joins.push(Join { collar: classic_zones[index].as_ref().unwrap(), stems: vec![&parent.polygon] }); }
        for (ci, child) in parts[..index].iter().enumerate() { if child.parent.as_ref() == Some(&part.id) { joins.push(Join { collar: classic_zones[ci].as_ref().unwrap(), stems: vec![&child.polygon] }); } }
        // inside a smooth zone the merged outline takes over; beyond it the
        // classic root handling still applies
        let circles: Vec<(Point, f64)> = mine.iter().flat_map(|c| c.roots.iter().map(|r| (r.at, r.radius))).collect();
        let lines = visible_lines(&split_at_circles(vec![closed(&part.polygon)], &circles), &covers, &joins);
        outline.extend(keep_where(lines, |m| !mine.iter().any(|c| c.in_zone(m))));
        outline.extend(visible_lines(&part.cuts, &covers, &joins));
        folds.extend(visible_lines(&part.folds, &covers, &joins));
    }
    for c in &clusters {
        let members = c.members();
        for (owner, run) in merged_outline(parts, c) {
            // covered by any later part that is not itself merged here
            let covers: Vec<&[Point]> = parts.iter().enumerate().skip(owner + 1).filter(|(i, _)| !members.contains(i)).map(|(_, p)| p.polygon.as_slice()).collect();
            outline.extend(visible_lines(&[run], &covers, &[]));
        }
    }
    Drawing { outline: drop_doubles(outline, 0.3, 1.2), folds }
}
