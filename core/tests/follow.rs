use scroll_core::geometry::distance;
use scroll_core::model::{preset_params, Layout};
use scroll_core::shoots::ShootEdit;

fn leaf(follow: Option<f64>, prog: f64, side: f64) -> (Vec<scroll_core::geometry::Point>, Vec<scroll_core::geometry::Point>) {
    let mut l = Layout::starter();
    let mut p = preset_params("returning-leaf", prog, side).unwrap(); p.follow = follow;
    l.shoots.push(ShootEdit { params: p, id: "f".into(), backbone: 0, replaces: None, hidden: false, under: false });
    let r = l.grow();
    let main = r.parts.iter().find(|p| p.parent.is_none()).unwrap().points.clone();
    (r.parts.iter().find(|p| p.id == "f").unwrap().polygon.clone(), main)
}

#[test]
fn follow_zero_is_unchanged_and_follow_bends_cleanly() {
    for (prog, side) in [(0.5, 1.0), (0.62, -1.0), (0.8, -1.0), (0.86, 1.0)] {
        let (a, _) = leaf(None, prog, side); let (b, _) = leaf(Some(0.0), prog, side);
        assert_eq!(a, b);
        let (c, _) = leaf(Some(1.0), prog, side);
        assert_eq!(a.len(), c.len());
        assert!(c.iter().all(|p| p.x.is_finite() && p.y.is_finite()));
        assert!(c != a, "follow should bend the leaf on a curved stem");
        // shape kept: the outline length changes only modestly
        let len = |poly: &[scroll_core::geometry::Point]| poly.windows(2).map(|w| distance(w[0], w[1])).sum::<f64>();
        assert!((len(&c) / len(&a) - 1.0).abs() < 0.25);
    }
}
