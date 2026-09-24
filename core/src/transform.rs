//! Free transform of a backbone: move, scale, rotate, flip. Leaves are stored
//! along the backbone, so they follow it.
use crate::geometry::{pt, Curve, Point};
use crate::shoots::ShootParams;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransformKind { Move, Scale, Rotate }
pub fn transform_curve(curve: &Curve, kind: TransformKind, center: Point, from: Point, to: Point, snap: bool) -> Curve {
    match kind {
        TransformKind::Move => { let (dx, dy) = (to.x - from.x, to.y - from.y); curve.map(|p| pt(p.x + dx, p.y + dy)) }
        TransformKind::Scale => {
            let a = (from.x - center.x).hypot(from.y - center.y); let b = (to.x - center.x).hypot(to.y - center.y);
            let s = (if a > 1e-6 { b / a } else { 1.0 }).clamp(0.1, 8.0);
            curve.map(|p| pt(center.x + (p.x - center.x) * s, center.y + (p.y - center.y) * s))
        }
        TransformKind::Rotate => {
            let mut angle = (to.y - center.y).atan2(to.x - center.x) - (from.y - center.y).atan2(from.x - center.x);
            if snap { let step = std::f64::consts::PI / 12.0; angle = (angle / step).round() * step; }
            let (c, s) = (angle.cos(), angle.sin());
            curve.map(|p| pt(center.x + (p.x - center.x) * c - (p.y - center.y) * s, center.y + (p.x - center.x) * s + (p.y - center.y) * c))
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Axis { Horizontal, Vertical }
pub fn flip_curve(curve: &Curve, axis: Axis, center: Point) -> Curve {
    curve.map(|p| match axis { Axis::Horizontal => pt(2.0 * center.x - p.x, p.y), Axis::Vertical => pt(p.x, 2.0 * center.y - p.y) })
}
/// A reflection swaps the side each leaf grows on and reverses its angle.
pub fn mirror_shoot(e: &ShootParams) -> ShootParams { ShootParams { side: -e.side, turn: -e.turn, leaf_side: e.leaf_side.map(|v| -v), ..e.clone() } }
