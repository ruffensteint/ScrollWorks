//! Terminal buds: small closed forms that finish a stem or sit where leaves
//! part from one root. Each bud is authored as a few overlapping pieces
//! (back to front); the silhouette and the visible inner cut lines are derived
//! from them, so the carving outline stays one clean shape with its internal
//! edges drawn at full weight.
use crate::geometry::{distance, line_frame, line_length, pt, Point};
use crate::growth::{GrowthPart, Kind};
use crate::outline::{inside, union_outline, visible_lines};
use crate::shoots::ShootParams;

pub struct BudPreset { pub id: &'static str, pub name: &'static str, pub detail: &'static str, pub size: f64 }
pub const BUD_PRESETS: &[BudPreset] = &[
    BudPreset { id: "bud-husk", name: "Husk bud", detail: "Closed bud wrapped by two crossing husks", size: 0.1 },
    BudPreset { id: "bud-trefoil", name: "Trefoil bud", detail: "Tall centre, two lobes rolling outward", size: 0.11 },
    BudPreset { id: "bud-berries", name: "Berry cluster", detail: "Three berries on a small calyx", size: 0.09 },
];

pub fn is_bud(id: &str) -> bool { BUD_PRESETS.iter().any(|b| b.id == id) }

pub fn bud_params(id: &str, progress: f64, side: f64) -> Option<ShootParams> {
    let b = BUD_PRESETS.iter().find(|b| b.id == id)?;
    Some(ShootParams { progress, reach: b.size, turn: 0.6 * side, curl: 0.66, side, preset: Some(id.to_string()), ..ShootParams::default() })
}

/// Centripetal Catmull-Rom through closed control points: soft, even curves.
pub(crate) fn smooth(ctrl: &[(f64, f64)], per: usize) -> Vec<Point> {
    let p: Vec<Point> = ctrl.iter().map(|&(x, y)| pt(x, y)).collect();
    let m = p.len(); let mut out = vec![];
    for i in 0..m {
        let (p0, p1, p2, p3) = (p[(i + m - 1) % m], p[i], p[(i + 1) % m], p[(i + 2) % m]);
        let tj = |a: Point, b: Point, t: f64| t + distance(a, b).max(1e-9).sqrt();
        let t0 = 0.0; let t1 = tj(p0, p1, t0); let t2 = tj(p1, p2, t1); let t3 = tj(p2, p3, t2);
        let mix = |a: Point, b: Point, ta: f64, tb: f64, t: f64| if tb - ta < 1e-12 { a } else { pt(((tb - t) * a.x + (t - ta) * b.x) / (tb - ta), ((tb - t) * a.y + (t - ta) * b.y) / (tb - ta)) };
        for k in 0..per {
            let t = t1 + (t2 - t1) * k as f64 / per as f64;
            let a1 = mix(p0, p1, t0, t1, t); let a2 = mix(p1, p2, t1, t2, t); let a3 = mix(p2, p3, t2, t3, t);
            let b1 = mix(a1, a2, t0, t2, t); let b2 = mix(a2, a3, t1, t3, t);
            out.push(mix(b1, b2, t1, t2, t));
        }
    }
    out
}
pub(crate) fn open(ctrl: &[(f64, f64)]) -> Vec<Point> {
    // open curve: pad the ends so the spline passes through the first and last points
    let mut c = vec![ctrl[0]]; c.extend_from_slice(ctrl); c.push(*ctrl.last().unwrap());
    let closed = smooth(&c, 10);
    let per = 10; closed[per..closed.len() - 2 * per + 1].to_vec()
}
fn circle(cx: f64, cy: f64, r: f64) -> Vec<Point> { (0..56).map(|i| { let a = i as f64 * std::f64::consts::TAU / 56.0; pt(cx + r * a.cos(), cy + r * a.sin()) }).collect() }
fn mirror(p: &[Point]) -> Vec<Point> { p.iter().rev().map(|q| pt(-q.x, q.y)).collect() }

/// Pieces back to front, plus thin fold lines. Local frame: base at the
/// origin, growth along +y, length about 1, x across.
fn pieces(id: &str) -> (Vec<Vec<Point>>, Vec<Vec<Point>>) {
    match id {
        "bud-husk" => {
            let body = smooth(&[(0.0, 0.08), (0.17, 0.2), (0.23, 0.42), (0.19, 0.66), (0.11, 0.84), (0.04, 0.95), (-0.04, 0.95), (-0.11, 0.84), (-0.19, 0.66), (-0.23, 0.42), (-0.17, 0.2)], 10);
            let right = smooth(&[(-0.02, -0.02), (0.14, 0.05), (0.25, 0.2), (0.27, 0.36), (0.22, 0.5), (0.14, 0.58), (0.06, 0.52), (0.02, 0.36), (-0.03, 0.16)], 10);
            let left = mirror(&right);
            let crease = open(&[(0.08, 0.08), (0.18, 0.24), (0.17, 0.42)]);
            (vec![body, left, right], vec![open(&[(0.0, 0.64), (0.0, 0.8)]), crease.clone(), mirror(&crease).into_iter().rev().collect()])
        }
        "bud-trefoil" => {
            let centre = smooth(&[(0.0, 0.12), (0.12, 0.28), (0.16, 0.52), (0.13, 0.75), (0.07, 0.91), (0.02, 0.98), (-0.04, 0.97), (-0.1, 0.88), (-0.14, 0.72), (-0.16, 0.5), (-0.12, 0.28)], 10);
            let side = smooth(&[(0.02, 0.08), (0.18, 0.14), (0.34, 0.26), (0.46, 0.42), (0.5, 0.56), (0.46, 0.66), (0.38, 0.66), (0.34, 0.58), (0.38, 0.52), (0.34, 0.44), (0.24, 0.36), (0.12, 0.3), (0.04, 0.24)], 10);
            let collar = smooth(&[(-0.16, 0.02), (0.0, -0.02), (0.16, 0.02), (0.18, 0.1), (0.0, 0.14), (-0.18, 0.1)], 10);
            (vec![mirror(&side), side, centre, collar], vec![open(&[(0.0, 0.28), (0.01, 0.6), (0.0, 0.85)])])
        }
        _ => {
            // Berries overlap each other and the calyx so the cluster reads as one form.
            // A soft cup with three shallow points, as wide at its base as a stem end.
            let calyx = smooth(&[(0.0, -0.02), (0.15, 0.03), (0.22, 0.16), (0.25, 0.3), (0.13, 0.3), (0.0, 0.37), (-0.13, 0.3), (-0.25, 0.3), (-0.22, 0.16), (-0.15, 0.03)], 10);
            (vec![circle(0.0, 0.63, 0.14), circle(0.125, 0.43, 0.135), circle(-0.125, 0.43, 0.135), calyx], vec![])
        }
    }
}

fn closed(p: &[Point]) -> Vec<Point> { let mut v = p.to_vec(); v.push(p[0]); v }
fn area(p: &[Point]) -> f64 { (0..p.len()).map(|i| { let (a, b) = (p[i], p[(i + 1) % p.len()]); a.x * b.y - b.x * a.y }).sum::<f64>() / 2.0 }

/// Join union runs end to end into closed loops; the largest is the silhouette.
fn loops(mut runs: Vec<Vec<Point>>, tol: f64) -> Vec<Vec<Point>> {
    let mut out = vec![];
    while let Some(mut cur) = if runs.is_empty() { None } else { Some(runs.remove(0)) } {
        loop {
            let end = *cur.last().unwrap();
            if distance(end, cur[0]) < tol && cur.len() > 3 { break; }
            let best = runs.iter().enumerate().map(|(i, r)| (i, distance(end, r[0]), distance(end, *r.last().unwrap()))).min_by(|a, b| a.1.min(a.2).partial_cmp(&b.1.min(b.2)).unwrap());
            match best {
                Some((i, ds, de)) if ds.min(de) < tol => { let mut r = runs.remove(i); if de < ds { r.reverse(); } cur.extend(r.into_iter().skip(1)); }
                _ => break,
            }
        }
        if cur.len() > 3 && distance(*cur.last().unwrap(), cur[0]) < tol { cur.pop(); } // no duplicate closing point
        out.push(cur);
    }
    out
}

/// Grow a bud from the backbone at `e.progress`, heading `e.turn` from the tangent.
pub fn grow_bud(guide: &[Point], parent: &GrowthPart, e: &ShootParams, id: &str) -> GrowthPart {
    let len = e.reach * line_length(guide); let (fp, fa) = line_frame(guide, e.progress);
    let h = fa + e.turn; let m = if e.side < 0.0 { -1.0 } else { 1.0 };
    let (dir, nrm) = (pt(h.cos(), h.sin()), pt(-h.sin(), h.cos()));
    let place = |q: &Point| pt(fp.x + len * (q.y * dir.x + q.x * m * nrm.x), fp.y + len * (q.y * dir.y + q.x * m * nrm.y));
    let kind = e.preset.as_deref().unwrap_or("bud-husk");
    let (local, local_folds) = pieces(kind);
    let pieces: Vec<Vec<Point>> = local.iter().map(|p| p.iter().map(place).collect()).collect();
    let refs: Vec<&[Point]> = pieces.iter().map(|p| p.as_slice()).collect();
    let tol = len * 1e-3;
    let mut rings = loops(union_outline(&refs), tol);
    rings.sort_by(|a, b| area(b).abs().partial_cmp(&area(a).abs()).unwrap());
    let polygon = rings.first().cloned().unwrap_or_else(|| pieces[0].clone());
    let in_union = |p: Point| pieces.iter().any(|q| inside(p, q));
    // Visible inner edges: each piece's outline where later pieces don't hide
    // it, keeping only stretches with the bud on both sides.
    let mut cuts: Vec<Vec<Point>> = rings.iter().skip(1).map(|r| closed(r)).collect();
    for (i, p) in pieces.iter().enumerate() {
        let covers: Vec<&[Point]> = pieces[i + 1..].iter().map(|q| q.as_slice()).collect();
        for run in visible_lines(&[closed(p)], &covers, &[]) {
            let mut cur: Vec<Point> = vec![];
            for w in run.windows(2) {
                let (a, b) = (w[0], w[1]); let d = distance(a, b);
                let internal = d > 1e-12 && { let mid = pt((a.x + b.x) / 2.0, (a.y + b.y) / 2.0); let eps = len * 2e-3; let n = pt(-(b.y - a.y) / d * eps, (b.x - a.x) / d * eps);
                    in_union(pt(mid.x + n.x, mid.y + n.y)) && in_union(pt(mid.x - n.x, mid.y - n.y)) };
                if internal { if cur.is_empty() { cur.push(a); } cur.push(b); } else if cur.len() > 1 { cuts.push(std::mem::take(&mut cur)); } else { cur.clear(); }
            }
            if cur.len() > 1 { cuts.push(cur); }
        }
    }
    let folds: Vec<Vec<Point>> = local_folds.iter().map(|f| f.iter().map(place).collect()).collect();
    let folds = visible_lines(&folds, &[], &[]);
    let spine: Vec<Point> = (0..=40).map(|i| place(&pt(0.0, i as f64 / 40.0))).collect();
    GrowthPart { id: id.into(), parent: Some(parent.id.clone()), kind: Kind::Secondary, points: spine, polygon, folds, ridges: Some(vec![]), cuts, contour_split: None, width: (len * 0.12).max(0.8), length: len, birth: 0.4, duration: 0.2, shoot: Some(e.clone()), under: false }
}
