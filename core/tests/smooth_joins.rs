//! The smooth-join drawing engine changes only what happens around roots
//! (and near-coincident double lines): away from them it draws the same lines
//! as the classic engine, and it never loses whole outlines.
use scroll_core::geometry::{distance, Point};
use scroll_core::joins::smooth_drawing;
use scroll_core::layers::layered_drawing;
use scroll_core::model::{preset_params, Layout};
use scroll_core::shoots::ShootEdit;
use scroll_core::skeleton::{skeleton_layout, Skeleton};

fn length(runs: &[Vec<Point>]) -> f64 { runs.iter().map(|r| r.windows(2).map(|w| distance(w[0], w[1])).sum::<f64>()).sum() }

#[test]
fn smooth_joins_keep_the_drawing_away_from_roots() {
    let mut layouts = vec![Layout::starter()];
    let mut l = Layout::starter();
    for (k, (id, prog, side)) in [("returning-leaf", 0.45, 1.0), ("sweeping-tongue", 0.62, -1.0)].iter().enumerate() {
        let mut p = preset_params(id, *prog, *side).unwrap(); p.fan = Some(3);
        l.shoots.push(ShootEdit { params: p, id: format!("s{k}"), backbone: 0, replaces: None, hidden: false, under: false });
    }
    layouts.push(l);
    for kind in Skeleton::ALL { for seed in [7u32, 12] { layouts.push(skeleton_layout(kind, seed, 240.0, 150.0)); } }
    for l in &layouts {
        let g = l.grow();
        let (a, b) = (layered_drawing(&g), smooth_drawing(&g));
        assert!(b.outline.iter().flatten().chain(b.folds.iter().flatten()).all(|p| p.x.is_finite() && p.y.is_finite()));
        let ratio = length(&b.outline) / length(&a.outline);
        assert!(ratio > 0.9 && ratio < 1.05, "outline length changed by {ratio:.3}");
        assert_eq!(length(&a.folds).round(), length(&b.folds).round(), "folds are untouched");
        // every classic line point well away from any root is still drawn
        let roots: Vec<Point> = g.parts.iter().filter(|p| p.parent.is_some() && !p.points.is_empty()).map(|p| p.points[0]).collect();
        let near_line = |p: Point| b.outline.iter().any(|r| r.windows(2).any(|w| {
            let (dx, dy) = (w[1].x - w[0].x, w[1].y - w[0].y); let l2 = dx * dx + dy * dy;
            let t = if l2 > 0.0 { (((p.x - w[0].x) * dx + (p.y - w[0].y) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
            (p.x - w[0].x - t * dx).hypot(p.y - w[0].y - t * dy) < 0.35
        }));
        let far: Vec<Point> = a.outline.iter().flatten().copied().filter(|p| roots.iter().all(|r| distance(*r, *p) > 8.0)).step_by(7).collect();
        let missing = far.iter().filter(|p| !near_line(**p)).count();
        assert!(missing * 100 <= far.len(), "{missing} of {} classic points lost away from roots", far.len());
    }
}
