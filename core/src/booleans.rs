//! Exact polygon booleans and offsets (i_overlay): unions, differences,
//! closing (offset out then in, to fill narrow crotches), cleaning
//! self-overlapping outlines, and area measures. Shapes are lists of contours;
//! the first contour of a shape is its outer boundary, the rest are holes.
use crate::geometry::{pt, Point};
use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::simplify::SimplifyShape;
use i_overlay::float::single::SingleFloatOverlay;
use i_overlay::i_float::float::compatible::FloatPointCompatible;
use i_overlay::mesh::float::outline::offset::OutlineOffset;
use i_overlay::mesh::float::style::{LineJoin, OutlineStyle};

impl FloatPointCompatible for Point {
    type Scalar = f64;
    fn from_xy(x: f64, y: f64) -> Self { pt(x, y) }
    fn x(&self) -> f64 { self.x }
    fn y(&self) -> f64 { self.y }
}

pub type Shape = Vec<Vec<Point>>;
pub type Shapes = Vec<Shape>;

/// Twice the signed area (positive when the y-down outline turns clockwise on screen).
pub fn signed_area(p: &[Point]) -> f64 {
    let n = p.len();
    (0..n).map(|i| { let (a, b) = (p[i], p[(i + 1) % n]); a.x * b.y - b.x * a.y }).sum::<f64>() / 2.0
}
pub fn area(shapes: &Shapes) -> f64 { shapes.iter().flatten().map(|c| signed_area(c)).sum::<f64>().abs() }

/// One outline with its loops and crossings resolved. `Positive`/`Negative`
/// (following the outline's own winding) drops loops that turn the wrong way,
/// such as the barb a tight bend twists into a notch.
pub fn clean(poly: &[Point]) -> Shapes { clean_with(poly, true) }
/// `oriented` false: plain non-zero filling (every loop is kept).
pub fn clean_with(poly: &[Point], oriented: bool) -> Shapes {
    if poly.len() < 3 { return vec![]; }
    let rule = if !oriented { FillRule::NonZero } else if signed_area(poly) >= 0.0 { FillRule::Positive } else { FillRule::Negative };
    poly.to_vec().simplify_shape(rule)
}

/// A drawable outline from a possibly tangled one: barbs and reversed loops
/// are removed (oriented cleaning), unless that would lose a real part of the
/// shape (a whole lobe turned inside out by a bend), in which case every loop
/// is kept. Specks (tiny holes and splinters) are dropped either way. The
/// largest piece comes first.
pub fn tidy(poly: &[Point]) -> Shapes {
    let (nz, or) = (clean_with(poly, false), clean_with(poly, true));
    let full = area(&nz);
    let mut shapes = if area(&or) >= full * 0.98 { or } else { nz };
    let speck = (full * 0.002).max(0.3);
    shapes.retain(|s| s.first().is_some_and(|o| signed_area(o).abs() >= speck));
    for s in shapes.iter_mut() { let outer = s.remove(0); s.retain(|h| signed_area(h).abs() >= speck); s.insert(0, outer); }
    shapes.sort_by(|a, b| signed_area(&b[0]).abs().partial_cmp(&signed_area(&a[0]).abs()).unwrap());
    shapes
}

/// The union of several outlines.
pub fn union(polys: &[&[Point]]) -> Shapes {
    let mut out: Shapes = vec![];
    for p in polys {
        if p.len() < 3 { continue; }
        out = if out.is_empty() { p.to_vec().simplify_shape(FillRule::NonZero) } else { out.overlay(&p.to_vec(), OverlayRule::Union, FillRule::NonZero) };
    }
    out
}

pub fn difference(a: &Shapes, b: &Shapes) -> Shapes { a.overlay(b, OverlayRule::Difference, FillRule::NonZero) }
pub fn intersect(a: &Shapes, b: &Shapes) -> Shapes { a.overlay(b, OverlayRule::Intersect, FillRule::NonZero) }

/// Grow (d > 0) or shrink (d < 0) with round corners.
pub fn offset(shapes: &Shapes, d: f64) -> Shapes {
    if shapes.is_empty() || d.abs() < 1e-9 { return shapes.clone(); }
    // round corners in steps of 0.2 rad: off the true arc by under 0.01 mm
    // at the radii used here, and far fewer points than a finer step
    shapes.outline(&OutlineStyle::new(d).line_join(LineJoin::Round(0.2)))
}

/// Morphological closing: fills crotches and gaps narrower than 2r with
/// round fillets of radius r; everything else is unchanged.
pub fn close(shapes: &Shapes, r: f64) -> Shapes { offset(&offset(shapes, r), -r) }
/// Morphological opening: removes everything narrower than 2r.
pub fn open(shapes: &Shapes, r: f64) -> Shapes { offset(&offset(shapes, -r), r) }
pub fn overlay_union(a: &Shapes, b: &Shapes) -> Shapes { a.overlay(b, OverlayRule::Union, FillRule::NonZero) }

/// Drop outline points that lie within `tol` of the line through their
/// neighbours (Douglas–Peucker on each closed contour). Offsets cost grows
/// quickly with point count, and grown outlines are sampled very densely.
pub fn thin(shapes: &Shapes, tol: f64) -> Shapes {
    fn dp(run: &[Point], tol: f64, out: &mut Vec<Point>) {
        let (a, b) = (run[0], run[run.len() - 1]);
        let (dx, dy) = (b.x - a.x, b.y - a.y); let l2 = dx * dx + dy * dy;
        let (mut worst, mut at) = (0.0, 0);
        for (i, p) in run.iter().enumerate().take(run.len() - 1).skip(1) {
            let t = if l2 > 0.0 { (((p.x - a.x) * dx + (p.y - a.y) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
            let d = (p.x - a.x - t * dx).hypot(p.y - a.y - t * dy);
            if d > worst { worst = d; at = i; }
        }
        if worst <= tol { out.push(a); return; }
        dp(&run[..=at], tol, out); dp(&run[at..], tol, out);
    }
    shapes.iter().map(|s| s.iter().filter(|c| c.len() >= 3).map(|c| {
        // split the ring at its farthest point from the start so both halves are open runs
        let far = (1..c.len()).max_by(|&i, &j| (c[i].x - c[0].x).hypot(c[i].y - c[0].y).partial_cmp(&(c[j].x - c[0].x).hypot(c[j].y - c[0].y)).unwrap()).unwrap();
        let mut ring = c.clone(); ring.push(c[0]);
        let mut out = vec![];
        dp(&ring[..=far], tol, &mut out); dp(&ring[far..], tol, &mut out);
        out
    }).filter(|c| c.len() >= 3).collect()).collect()
}
