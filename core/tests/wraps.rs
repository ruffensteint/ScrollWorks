//! Wrapping leaves: off unless asked for, at most two layers, and they stay
//! within the scroll they wrap.
use scroll_core::geometry::{pt, Bounds, Point};
use scroll_core::model::Layout;

#[test]
fn wraps_stay_inside_their_scroll() {
    for (curve, side) in [([pt(20.0, 120.0), pt(70.0, 130.0), pt(95.0, 70.0), pt(150.0, 80.0)], scroll_core::growth::Side::Left),
                          ([pt(200.0, 40.0), pt(150.0, 30.0), pt(120.0, 90.0), pt(80.0, 70.0)], scroll_core::growth::Side::Right)] {
        let mut l = Layout::starter(); l.curves[0] = curve; l.growth[0].side = side; l.growth[0].free = Some(true);
        let plain = l.grow();
        assert!(!plain.parts.iter().any(|p| p.id.starts_with("wrap-")), "wraps appear only when asked for");
        for n in 1..=3u8 {
            l.growth[0].wraps = Some(n);
            let g = l.grow();
            let main = g.parts.iter().find(|p| p.parent.is_none()).unwrap();
            let wraps: Vec<_> = g.parts.iter().filter(|p| p.id.starts_with("wrap-")).collect();
            assert_eq!(wraps.len(), n.min(2) as usize, "{n} requested");
            let b = Bounds::of(&main.polygon);
            for w in wraps { for q in &w.polygon { let q: &Point = q;
                assert!(q.x > b.l - 1.0 && q.x < b.r + 1.0 && q.y > b.t - 1.0 && q.y < b.b + 1.0, "wrap leaves the scroll"); } }
        }
    }
}

#[test]
fn library_leaf_wraps_stay_inside_and_are_clean() {
    for id in ["returning-leaf", "leaf-volute", "rolled-fan", "turned-bud", "two-finger-leaf", "upright-sprig", "sweeping-tongue"] {
        for (curve, side) in [([pt(20.0, 120.0), pt(70.0, 130.0), pt(95.0, 70.0), pt(150.0, 80.0)], scroll_core::growth::Side::Left),
                              ([pt(200.0, 40.0), pt(150.0, 30.0), pt(120.0, 90.0), pt(80.0, 70.0)], scroll_core::growth::Side::Right)] {
            let mut l = Layout::starter(); l.curves[0] = curve; l.growth[0].side = side; l.growth[0].free = Some(true);
            l.growth[0].wraps = Some(2); l.growth[0].wrap_leaf = Some(id.into());
            let g = l.grow();
            let main = g.parts.iter().find(|p| p.parent.is_none()).unwrap();
            let wraps: Vec<_> = g.parts.iter().filter(|p| p.id.starts_with("wrap-")).collect();
            assert_eq!(wraps.len(), 1, "{id}: one library leaf per scroll");
            let b = Bounds::of(&main.polygon);
            for q in &wraps[0].polygon {
                assert!(q.x.is_finite() && q.y.is_finite());
                assert!(q.x > b.l - 1.0 && q.x < b.r + 1.0 && q.y > b.t - 1.0 && q.y < b.b + 1.0, "{id}: wrap leaves the scroll");
            }
        }
    }
}
