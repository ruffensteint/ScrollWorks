//! Outline operations for engraving lines: point-in-polygon, segment
//! intersection, union boundaries and layered (covered) line clipping.
use crate::geometry::{cross, distance, lerp, sub, Bounds, Point};

pub fn inside(p: Point, poly: &[Point]) -> bool {
    let mut hit = false;
    let n = poly.len();
    if n == 0 { return false; }
    let mut j = n - 1;
    for i in 0..n {
        let (a, b) = (poly[i], poly[j]);
        if (a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x { hit = !hit; }
        j = i;
    }
    hit
}
/// Parameter t along a-b where it crosses c-d.
pub fn intersection(a: Point, b: Point, c: Point, d: Point) -> Option<f64> {
    let r = sub(b, a); let s = sub(d, c); let den = cross(r, s);
    if den.abs() < 1e-10 { return None; }
    let t = cross(sub(c, a), s) / den; let u = cross(sub(c, a), r) / den;
    if t >= -1e-8 && t <= 1.0 + 1e-8 && u >= -1e-8 && u <= 1.0 + 1e-8 { Some(t.clamp(0.0, 1.0)) } else { None }
}

pub type Runs = Vec<Vec<Point>>;

/// Union boundary as open runs: edges inside another shape are dropped.
pub fn union_outline(polygons: &[&[Point]]) -> Runs {
    let boxes: Vec<Bounds> = polygons.iter().map(|p| Bounds::of(p)).collect();
    let mut runs: Runs = vec![];
    for (index, poly) in polygons.iter().enumerate() {
        let other: Vec<usize> = (0..polygons.len()).filter(|&i| i != index && boxes[index].overlaps(&boxes[i])).collect();
        let mut run: Vec<Point> = vec![];
        let n = poly.len();
        for i in 0..n {
            let a = poly[i]; let b = poly[(i + 1) % n];
            if distance(a, b) < 1e-7 { continue; }
            let seg = Bounds::of(&[a, b]);
            let candidates: Vec<usize> = other.iter().copied().filter(|&o| seg.overlaps(&boxes[o])).collect();
            let mut cuts = vec![0.0, 1.0];
            for &o in &candidates {
                let q = polygons[o];
                for j in 0..q.len() { if let Some(t) = intersection(a, b, q[j], q[(j + 1) % q.len()]) { if t > 1e-7 && t < 1.0 - 1e-7 { cuts.push(t); } } }
            }
            cuts.sort_by(|x, y| x.partial_cmp(y).unwrap());
            for k in 1..cuts.len() {
                if cuts[k] - cuts[k - 1] < 1e-7 { continue; }
                let begin = lerp(a, b, cuts[k - 1]); let end = lerp(a, b, cuts[k]); let mid = lerp(begin, end, 0.5);
                let (dx, dy) = (b.x - a.x, b.y - a.y); let len = dx.hypot(dy);
                let eps = 0.0001; let nrm = Point { x: -dy / len * eps, y: dx / len * eps };
                let covered = |p: Point| polygons.iter().enumerate().any(|(j, shape)| boxes[j].contains(p) && inside(p, shape));
                let internal = covered(Point { x: mid.x + nrm.x, y: mid.y + nrm.y }) && covered(Point { x: mid.x - nrm.x, y: mid.y - nrm.y });
                let duplicate = candidates.iter().any(|&o| o < index && {
                    let q = polygons[o];
                    (0..q.len()).any(|j| { let c = q[j]; let d = q[(j + 1) % q.len()]; let v = sub(d, c);
                        cross(sub(mid, c), v).abs() < 1e-7 && distance(c, mid) + distance(mid, d) < distance(c, d) + 1e-7 })
                });
                if internal || duplicate { if run.len() > 1 { runs.push(std::mem::take(&mut run)); } else { run.clear(); } continue; }
                if run.is_empty() { run = vec![begin, end]; }
                else if distance(*run.last().unwrap(), begin) < 0.001 { run.push(end); }
                else { if run.len() > 1 { runs.push(std::mem::take(&mut run)); } run = vec![begin, end]; }
            }
        }
        if run.len() > 1 { runs.push(run); }
    }
    runs
}

/// A root join: inside `collar` and inside any of `stems`, lines are hidden.
pub struct Join<'a> { pub collar: &'a [Point], pub stems: Vec<&'a [Point]> }

/// Lines split at every boundary crossing; pieces under a cover (or inside a
/// root join) are dropped.
pub fn visible_lines(lines: &[Vec<Point>], covers: &[&[Point]], joins: &[Join]) -> Runs {
    let mut result: Runs = vec![];
    let mut boundaries: Vec<(&[Point], Bounds)> = covers.iter().map(|p| (*p, Bounds::of(p))).collect();
    for j in joins { boundaries.push((j.collar, Bounds::of(j.collar))); for s in &j.stems { boundaries.push((*s, Bounds::of(s))); } }
    let cover_boxes: Vec<(&[Point], Bounds)> = covers.iter().map(|p| (*p, Bounds::of(p))).collect();
    let join_boxes: Vec<(Bounds, &Join)> = joins.iter().map(|j| (Bounds::of(j.collar), j)).collect();
    for line in lines {
        let mut run: Vec<Point> = vec![];
        for i in 1..line.len() {
            let (a, b) = (line[i - 1], line[i]);
            let mut cuts = vec![0.0, 1.0];
            let (sl, sr, st, sb) = (a.x.min(b.x), a.x.max(b.x), a.y.min(b.y), a.y.max(b.y));
            for (poly, bx) in &boundaries {
                if bx.r < sl || bx.l > sr || bx.b < st || bx.t > sb { continue; }
                for j in 0..poly.len() { if let Some(t) = intersection(a, b, poly[j], poly[(j + 1) % poly.len()]) { cuts.push(t); } }
            }
            cuts.sort_by(|x, y| x.partial_cmp(y).unwrap());
            for j in 1..cuts.len() {
                if cuts[j] - cuts[j - 1] < 1e-8 { continue; }
                let start = lerp(a, b, cuts[j - 1]); let end = lerp(a, b, cuts[j]); let mid = lerp(start, end, 0.5);
                let hidden = cover_boxes.iter().any(|(p, bx)| bx.contains(mid) && inside(mid, p))
                    || join_boxes.iter().any(|(bx, jn)| bx.contains(mid) && inside(mid, jn.collar) && jn.stems.iter().any(|s| inside(mid, s)));
                if hidden { if run.len() > 1 { result.push(std::mem::take(&mut run)); } else { run.clear(); } }
                else { if run.is_empty() { run.push(start); } run.push(end); }
            }
        }
        if run.len() > 1 { result.push(run); }
    }
    result
}

/// SVG path data with three decimals, as the web version writes it.
pub fn path_data(runs: &Runs, closed: bool) -> String {
    runs.iter().filter(|r| !r.is_empty()).map(|r| {
        let mut s = String::from("M ");
        s.push_str(&r.iter().map(|p| format!("{:.3} {:.3}", p.x, p.y)).collect::<Vec<_>>().join(" L "));
        if closed { s.push_str(" Z"); }
        s
    }).collect::<Vec<_>>().join(" ")
}
