//! Every construction builds at every variation, fits its page, and its
//! attached scrolls start on their parent's stem.
use scroll_core::geometry::{arc_table, distance, Bounds, Point};
use scroll_core::skeleton::{skeleton_layout, Skeleton};

#[test]
fn constructions_fit_and_stay_attached() {
    for kind in Skeleton::ALL {
        for &(w, h) in &[(240.0, 150.0), (150.0, 150.0), (300.0, 120.0)] {
            for seed in 0..6u32 {
                let l = skeleton_layout(kind, seed, w, h);
                assert!(kind == Skeleton::Single || l.curves.len() >= 2, "{kind:?}: needs linked scrolls");
                let grown = l.grow();
                let pts: Vec<Point> = grown.parts.iter().flat_map(|p| p.polygon.iter().copied()).collect();
                let b = Bounds::of(&pts);
                let slack = w.min(h) * 0.03;
                assert!(b.l >= -slack && b.t >= -slack && b.r <= w + slack && b.b <= h + slack, "{kind:?} seed {seed} on {w}x{h}: off the page {:?}", (b.l, b.t, b.r, b.b));
                for i in 0..l.curves.len() {
                    if let Some(p) = l.growth[i].attach {
                        let on = arc_table(&l.curves[p]).iter().map(|r| distance(r.point, l.curves[i][0])).fold(f64::MAX, f64::min);
                        assert!(on < 1.0, "{kind:?} seed {seed}: scroll {i} starts {on:.2} mm off its parent");
                    }
                }
            }
        }
    }
}

/// Dragging an attached scroll's start along its parent, frame after frame,
/// slides it without distorting it (the old snap nudged its first handle a
/// little more on every frame until it flew off).
#[test]
fn sliding_an_attached_scroll_keeps_its_shape() {
    use scroll_core::geometry::pt;
    let mut l = skeleton_layout(Skeleton::ParentChild, 3, 240.0, 150.0);
    let shape = |c: &[Point; 4]| [pt(c[1].x - c[0].x, c[1].y - c[0].y), pt(c[2].x - c[0].x, c[2].y - c[0].y), pt(c[3].x - c[0].x, c[3].y - c[0].y)];
    let before = shape(&l.curves[1]);
    // Pointer wanders off the stem while dragging, as a hand does.
    for k in 0..60 { let t = k as f64 / 60.0; let to = pt(40.0 + 90.0 * t, 60.0 + 30.0 * (t * 9.0).sin());
        assert!(l.slide_attached(1, to)); let mut r = 0; while r < 6 && l.settle() { r += 1; } }
    let after = shape(&l.curves[1]);
    for (a, b) in before.iter().zip(after.iter()) { assert!(distance(*a, *b) < 1e-6, "scroll changed shape while sliding"); }
    let on = arc_table(&l.curves[0]).iter().map(|r| distance(r.point, l.curves[1][0])).fold(f64::MAX, f64::min);
    assert!(on < 1e-6, "start left the parent stem");
}
