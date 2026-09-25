//! The exact-joins engine changes only what happens around roots (and cleans
//! tangled outlines): away from roots it draws the same lines as the classic
//! engine, and tidying never loses a real part of a leaf.
use scroll_core::booleans::{area, clean_with, tidy};
use scroll_core::exact::{exact_drawing, tidied, ExactSettings};
use scroll_core::geometry::{distance, Point};
use scroll_core::layers::layered_drawing;
use scroll_core::model::{preset_params, Layout};
use scroll_core::shoots::ShootEdit;
use scroll_core::skeleton::{skeleton_layout, Skeleton};

fn length(runs: &[Vec<Point>]) -> f64 { runs.iter().map(|r| r.windows(2).map(|w| distance(w[0], w[1])).sum::<f64>()).sum() }

fn leaves(bend: f64) -> Layout {
    let mut l = Layout::starter();
    for (k, (id, prog, side)) in [("returning-leaf", 0.35, 1.0), ("sweeping-tongue", 0.62, -1.0)].iter().enumerate() {
        let mut p = preset_params(id, *prog, *side).unwrap(); p.bend = Some(bend); p.leaf_scale = Some(1.3);
        l.shoots.push(ShootEdit { params: p, id: format!("s{k}"), backbone: 0, replaces: None, hidden: false, under: false });
    }
    l
}

#[test]
fn exact_joins_keep_the_drawing_away_from_roots() {
    let mut layouts = vec![Layout::starter(), leaves(0.0), leaves(1.5)];
    for kind in Skeleton::ALL { for seed in [3u32, 7] { layouts.push(skeleton_layout(kind, seed, 240.0, 150.0)); } }
    for (n, l) in layouts.iter().enumerate() {
        let g = l.grow();
        // compared with classic drawn from the tidied outlines: tidying removes
        // barbs on purpose (see the test below), the joins should change nothing else
        let a = layered_drawing(&tidied(&g));
        for fillet in [0.5, 1.2] {
            let b = exact_drawing(&g, ExactSettings { tidy: true, fillet });
            assert!(b.outline.iter().flatten().chain(b.folds.iter().flatten()).all(|p| p.x.is_finite() && p.y.is_finite()));
            let ratio = length(&b.outline) / length(&a.outline);
            assert!(ratio > 0.9 && ratio < 1.05, "outline length changed by {ratio:.3}");
            // every classic line point well away from any root is still drawn
            let roots: Vec<Point> = g.parts.iter().filter(|p| p.parent.is_some() && !p.points.is_empty()).map(|p| p.points[0]).collect();
            let near_line = |p: Point| b.outline.iter().any(|r| r.windows(2).any(|w| {
                let (dx, dy) = (w[1].x - w[0].x, w[1].y - w[0].y); let l2 = dx * dx + dy * dy;
                let t = if l2 > 0.0 { (((p.x - w[0].x) * dx + (p.y - w[0].y) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
                (p.x - w[0].x - t * dx).hypot(p.y - w[0].y - t * dy) < 0.35
            }));
            let far: Vec<Point> = a.outline.iter().flatten().copied().filter(|p| roots.iter().all(|r| distance(*r, *p) > 14.0)).step_by(7).collect();
            let missing = far.iter().filter(|p| !near_line(**p)).count();
            assert!(missing * 100 <= far.len(), "layout {n}, fillet {fillet}: {missing} of {} classic points lost away from roots", far.len());
        }
    }
}

#[test]
fn tidying_never_loses_a_lobe() {
    for bend in [-1.5, 0.0, 1.5] {
        for p in leaves(bend).grow().parts {
            let (all, t) = (area(&clean_with(&p.polygon, false)), area(&tidy(&p.polygon)));
            assert!(t >= all * 0.97, "{}: tidy kept {t:.1} of {all:.1} mm²", p.id);
        }
    }
}
