//! Wrapping leaves: acanthus leaves laid along a scroll's own curve into its
//! eye, stacked like shingles (the leafage inside the volutes of the user's
//! references). Each wrap's spine is a stretch of the scroll's centreline,
//! just inside the stem; it grows toward the eye with its lobed edge inward.
//! Later wraps start deeper in the curl, are narrower, and lie on top.
use crate::contour::{acanthus_contour, notches_for, ContourOptions};
use crate::geometry::{line_frame, line_length, pt, Point};
use crate::growth::{GrowthPart, Kind};
use crate::profiles::LeafProfile;

/// Resample the stretch of `line` between arc fractions `t0` and `t1`.
fn stretch(line: &[Point], t0: f64, t1: f64, n: usize) -> Vec<Point> {
    (0..=n).map(|i| line_frame(line, t0 + (t1 - t0) * i as f64 / n as f64).0).collect()
}

/// Wrapping leaves for a grown main scroll: real leaves laid into the open
/// space the curl encloses. Each rests on the scroll's inner body, grows
/// inward and follows the curl toward the eye; later layers start deeper,
/// sit further in and lie on top, like shingles. `count` is 0 to 2.
pub fn wrapping_leaves(main: &GrowthPart, count: u8, lobed: bool, leaf: Option<&LeafProfile>) -> Vec<GrowthPart> {
    let mut out = vec![];
    if count == 0 || main.points.len() < 10 { return out; }
    let spine = &main.points;
    let turn = { let a = line_frame(spine, 0.72).1; let b = line_frame(spine, 0.96).1; (b - a).sin().atan2((b - a).cos()) };
    let side = if turn >= 0.0 { -1.0 } else { 1.0 };
    // The eye: the curl winds around the end of the spine.
    let tail = &spine[(spine.len() as f64 * 0.94) as usize..];
    let eye = pt(tail.iter().map(|p| p.x).sum::<f64>() / tail.len() as f64, tail.iter().map(|p| p.y).sum::<f64>() / tail.len() as f64);
    let n_layers = count.min(2) as usize; // a third layer crowds the eye
    for k in 0..n_layers {
        // Each layer is the curl itself drawn in toward the eye: a smooth,
        // similar curve that converges into the eye. Deeper layers start
        // later, are drawn in further and are narrower.
        let span = 0.42 - 0.06 * k as f64;
        let (t0, t1) = (1.0 - span, 0.97 - 0.01 * k as f64);
        let pull = 0.18 + 0.14 * k as f64;
        let centre = stretch(spine, t0, t1, 180);
        // The root grows out of the scroll's own body, then eases inward.
        let m = centre.len();
        let leaf_spine: Vec<Point> = centre.iter().enumerate().map(|(i, p)| { let u = i as f64 / (m - 1) as f64; let c = (u / 0.35).clamp(0.0, 1.0); let q = 0.1 + (pull - 0.1) * c * c * (3.0 - 2.0 * c); pt(eye.x + (p.x - eye.x) * (1.0 - q), eye.y + (p.y - eye.y) * (1.0 - q)) }).collect();
        let length = line_length(&leaf_spine);
        let radius = ((centre[0].x - eye.x).hypot(centre[0].y - eye.y)) * (1.0 - pull);
        let width = (radius * 0.42 * 0.82f64.powi(k as i32)).min(length * 0.3);
        if width < 1.0 || length < 8.0 { continue; }
        if leaf.is_some() && k > 0 { break; } // one library leaf: a second crowds and crosses it
        if let Some(p) = leaf {
            let (polygon, folds, ridges, points) = library_wrap(p, &leaf_spine, side, width, lobed);
            out.push(GrowthPart { id: format!("wrap-{k}"), parent: Some(main.id.clone()), kind: Kind::Secondary, points, polygon, folds, ridges: Some(ridges), cuts: vec![],
                contour_split: None, width: 1.5, length, birth: 0.55 + 0.08 * k as f64, duration: 0.25, shoot: None, under: false });
            continue;
        }
        let o = ContourOptions { lobed, root_width: 1.0, stalk: 0.1, notches: notches_for(2, 0.9), taper: 0.5, ..ContourOptions::default() };
        let a = acanthus_contour(&leaf_spine, 1.0, side, width, &o);
        out.push(GrowthPart { id: format!("wrap-{k}"), parent: Some(main.id.clone()), kind: Kind::Secondary, points: leaf_spine, polygon: a.polygon, folds: a.folds, ridges: Some(a.ridges), cuts: vec![],
            contour_split: Some(241), width: 1.5, length, birth: 0.55 + 0.08 * k as f64, duration: 0.25, shoot: None, under: false });
    }
    out
}

/// Lay a library leaf into the curl: the leaf is grown in its own frame
/// (root at the origin, heading along x, its own bends and rolls kept) and
/// that whole frame is bent along the wrap spine, so the leaf's length runs
/// round the curl toward the eye. It is scaled to the spine's length, and
/// across only as far as the band allows.
fn library_wrap(p: &LeafProfile, spine: &[Point], side: f64, width: f64, lobed: bool) -> (Vec<Point>, Vec<Vec<Point>>, Vec<Vec<Point>>, Vec<Point>) {
    let n = p.spine.len();
    let local: Vec<Point> = p.spine.iter().map(|&(x, y)| pt(x, y)).collect();
    let normal: Vec<Point> = (0..n).map(|i| { let a = local[i.saturating_sub(2)]; let b = local[(i + 2).min(n - 1)]; let l = (b.x - a.x).hypot(b.y - a.y).max(1e-9); pt(-(b.y - a.y) / l, (b.x - a.x) / l) }).collect();
    let at = |&(i, t, d): &(usize, f64, f64)| -> Point { let i = i.min(n - 1); let q = local[i]; let nn = normal[i]; pt(q.x + nn.y * t + nn.x * d, q.y - nn.x * t + nn.y * d) };
    let outline: Vec<Point> = p.outline.iter().map(at).collect();
    let folds: Vec<Vec<Point>> = if lobed { p.folds.iter().map(|l| l.iter().map(at).collect()).collect() } else { vec![] };
    let mut ridges: Vec<Vec<Point>> = vec![];
    if lobed { ridges.push(local[(n as f64 * 0.04).round() as usize..(n as f64 * 0.93).round() as usize].to_vec()); ridges.extend(p.ribs.iter().map(|l| l.iter().map(at).collect::<Vec<_>>())); }
    let umax = outline.iter().map(|q| q.x).fold(1e-6, f64::max);
    let (vmin, vmax) = outline.iter().fold((0.0f64, 0.0f64), |(a, b), q| (a.min(q.y), b.max(q.y)));
    let len = line_length(spine);
    let along = len / umax;
    let across = along.min(1.4 * width / (vmax - vmin).max(1e-6));
    let Some(path) = crate::shoots::stem_path(spine, spine[0], { let (a, b) = (spine[0], spine[1]); (b.y - a.y).atan2(b.x - a.x) }) else { return (vec![], vec![], vec![], spine.to_vec()); };
    // Narrow the leaf where needed so its inner edge stays short of the
    // curl's centre everywhere; it is then bent without any squeezing.
    let fit = outline.iter().map(|q| { let k = path.curvature_at(q.x.max(0.0) * along); let v = side * q.y; if v * k > 0.0 { 0.75 / (v * k) } else { f64::INFINITY } }).fold(f64::INFINITY, f64::min);
    let across = across.min(fit);
    // Stand the leaf a little off the scroll's inner edge so the two outlines
    // don't run together as a double line; the root still grows from the body.
    let inward = { let k: f64 = (1..20).map(|i| path.curvature_at(len * i as f64 / 20.0)).sum(); if k >= 0.0 { 1.0 } else { -1.0 } };
    let gap = 0.18 * (vmax - vmin) * across;
    let map = |q: &Point| { let u = q.x.max(0.0) * along; let e = (u / (0.3 * len)).clamp(0.0, 1.0); let e = e * e * (3.0 - 2.0 * e);
        path.bend_with(u, side * q.y * across + inward * gap * e, false) };
    let all = |l: &Vec<Point>| l.iter().map(map).collect::<Vec<_>>();
    (all(&outline), folds.iter().map(all).collect(), ridges.iter().map(all).collect(), all(&local))
}
