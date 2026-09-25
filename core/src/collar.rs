//! Collars: leafage dressing the fork where one stem grows from another, as
//! in baroque acanthus, where a branch rarely leaves its parent bare. Two
//! styles, chosen by the user from studies (the plain calyx and the cuff were
//! set aside):
//! - Axil leaf: an acanthus leaf rooted into the parent just before the fork,
//!   lying over the crotch with its tip lifting out.
//! - Split sheath: two leaves opening out of the fork, one along each stem,
//!   like a bud splitting.
//! Collar leaves root into the parent stem like any leaf, so their bases merge.
use crate::geometry::{distance, pt, Point};
use crate::growth::{GrowthPart, Kind};

fn half_width(polygon: &[Point], p: Point) -> f64 { polygon.iter().map(|q| distance(*q, p)).fold(f64::INFINITY, f64::min) }

/// Whether a grown part is collar leafage (ids `…/collar-…`).
pub fn is_collar(p: &GrowthPart) -> bool { p.id.rsplit('/').next().is_some_and(|s| s.starts_with("collar")) }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CollarStyle { Axil, Split }
impl CollarStyle {
    pub const ALL: [CollarStyle; 2] = [CollarStyle::Axil, CollarStyle::Split];
    pub fn id(self) -> &'static str { match self { CollarStyle::Axil => "axil", CollarStyle::Split => "split" } }
    pub fn name(self) -> &'static str { match self { CollarStyle::Axil => "Axil leaf", CollarStyle::Split => "Split sheath" } }
    pub fn from_id(s: &str) -> Option<CollarStyle> { CollarStyle::ALL.into_iter().find(|c| c.id() == s) }
}

/// The fork's frame: join point, parent tangent (pointing the way the child
/// heads), normal toward the child's side, child heading, and a size unit.
struct Fork { j: Point, t: Point, n: Point, d: Point, r: f64 }
fn fork(parent: &GrowthPart, child: &GrowthPart, join: Point, size: f64) -> Option<Fork> {
    let (first, last) = (child.points[0], *child.points.last()?);
    let spine: Vec<Point> = if distance(first, join) <= distance(last, join) { child.points.clone() } else { child.points.iter().rev().copied().collect() };
    let start = spine[0];
    let ahead = spine.iter().copied().find(|q| distance(*q, start) > 5.0)?;
    let dl = distance(ahead, start); let d = pt((ahead.x - start.x) / dl, (ahead.y - start.y) / dl);
    let i = (0..parent.points.len()).min_by(|&a, &b| distance(parent.points[a], join).partial_cmp(&distance(parent.points[b], join)).unwrap())?;
    let (a, b) = (parent.points[i.saturating_sub(3)], parent.points[(i + 3).min(parent.points.len() - 1)]);
    let tl = distance(a, b).max(1e-9); let mut t = pt((b.x - a.x) / tl, (b.y - a.y) / tl);
    if t.x * d.x + t.y * d.y < 0.0 { t = pt(-t.x, -t.y); }
    let mut n = pt(-t.y, t.x); if n.x * d.x + n.y * d.y < 0.0 { n = pt(-n.x, -n.y); }
    let along = spine.iter().copied().find(|q| distance(*q, start) > 8.0).unwrap_or(ahead);
    let r = half_width(&parent.polygon, join).max(half_width(&child.polygon, along)).clamp(2.6, 20.0);
    Some(Fork { j: join, t, n, d, r: r * size })
}
fn part(id: String, parent: &GrowthPart, polygon: Vec<Point>, folds: Vec<Vec<Point>>, spine: Vec<Point>, width: f64) -> GrowthPart {
    GrowthPart { id, parent: Some(parent.id.clone()), kind: Kind::Secondary, points: spine, polygon, folds, ridges: Some(vec![]), cuts: vec![], contour_split: None, width, length: 1.0, birth: 0.9, duration: 0.1, shoot: None, under: false }
}
/// A curved spine: start point, starting heading (radians), length, total turn.
fn arc_spine(p0: Point, h0: f64, len: f64, turn: f64, n: usize) -> Vec<Point> {
    let mut pts = vec![p0]; let step = len / n as f64;
    for k in 0..n { let s = (k as f64 + 0.5) / n as f64; let h = h0 + turn * s.powf(1.6); let p = pts[k]; pts.push(pt(p.x + h.cos() * step, p.y + h.sin() * step)); }
    pts
}

/// The collar leafage for a child sweep growing from `parent` at `join`, to be
/// drawn on top. `id` is a prefix such as `backbone-2/collar`; `size` scales
/// it against the stems (1 = default).
pub fn collar_parts(style: CollarStyle, id: &str, parent: &GrowthPart, child: &GrowthPart, join: Point, size: f64) -> Vec<GrowthPart> {
    use crate::contour::{acanthus_contour, notches_for, ContourOptions};
    if child.points.len() < 4 { return vec![]; }
    let Some(f) = fork(parent, child, join, size.clamp(0.4, 2.5)) else { return vec![] };
    let ang = |v: Point| v.y.atan2(v.x);
    // + turns from the parent's direction toward the child
    let toward_child = { let c = f.t.x * f.n.y - f.t.y * f.n.x; if c >= 0.0 { 1.0 } else { -1.0 } };
    match style {
        CollarStyle::Axil => {
            // roots on the parent just before the fork, lies over the crotch
            // along the bisector, then its tip curls back out over the parent
            let root = pt(f.j.x - f.t.x * f.r * 0.5, f.j.y - f.t.y * f.r * 0.5);
            let b = { let s = pt(f.t.x + f.d.x, f.t.y + f.d.y); let l = s.x.hypot(s.y); pt(s.x / l, s.y / l) };
            let spine = arc_spine(root, ang(b) + toward_child * 0.15, f.r * 8.0, -toward_child * 1.25, 80);
            let o = ContourOptions { root_width: 1.0, stalk: 0.06, notches: notches_for(2, 0.7), taper: 0.5, ..ContourOptions::default() };
            let a = acanthus_contour(&spine, 1.0, -toward_child, f.r * 3.0, &o);
            // roots into the parent like any leaf (not a collar id), so its base merges
            vec![part(format!("{id}-leaf"), parent, a.polygon, a.folds, spine, f.r)]
        }
        CollarStyle::Split => {
            // two small leaves opening out of the fork: one along the parent's
            // continuation curling away from the branch, one up the branch
            let leaf = |dir: Point, bend: f64, side: f64, k: &str, len: f64| {
                let root = pt(f.j.x - dir.x * f.r * 0.3, f.j.y - dir.y * f.r * 0.3);
                let spine = arc_spine(root, ang(dir), f.r * len, bend, 60);
                let o = ContourOptions { root_width: 1.0, stalk: 0.06, notches: notches_for(1, 0.6), taper: 0.35, ..ContourOptions::default() };
                let a = acanthus_contour(&spine, 1.0, side, f.r * 1.8, &o);
                part(format!("{id}{k}"), parent, a.polygon, a.folds, spine, f.r)
            };
            let away = pt(-f.n.x, -f.n.y);
            let along = { let s = pt(f.t.x + away.x * 0.12, f.t.y + away.y * 0.12); let l = s.x.hypot(s.y); pt(s.x / l, s.y / l) };
            let up = { let o = pt(f.d.x - f.t.x * 0.3, f.d.y - f.t.y * 0.3); let l = o.x.hypot(o.y); pt(o.x / l, o.y / l) };
            vec![leaf(along, -toward_child * 0.35, toward_child, "-a", 6.5), leaf(up, toward_child * 0.35, -toward_child, "-b", 5.8)]
        }
    }
}
