//! Buds must stay single clean shapes at any angle and size: one closed
//! silhouette that never crosses itself, with every inner cut inside it.
use scroll_core::bud::{grow_bud, BUD_PRESETS};
use scroll_core::geometry::{pt, Point};
use scroll_core::growth::{GrowthPart, Kind};
use scroll_core::model::preset_params;
use scroll_core::outline::{inside, intersection};

fn crossings(p: &[Point]) -> usize {
    let n = p.len(); let mut c = 0;
    for i in 0..n { for j in i + 2..n { if i == 0 && j == n - 1 { continue; } if intersection(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]).is_some() { c += 1; } } }
    c
}

#[test]
fn buds_are_clean_single_shapes() {
    let guide: Vec<Point> = (0..=120).map(|i| { let t = i as f64 / 120.0; pt(20.0 + 180.0 * t, 110.0 - 60.0 * (t * 2.5).sin()) }).collect();
    let parent = GrowthPart { id: "main".into(), parent: None, kind: Kind::Primary, points: guide.clone(), polygon: guide.clone(), folds: vec![], ridges: None, cuts: vec![], length: 0.0, width: 3.0, birth: 0.0, duration: 1.0, contour_split: None, shoot: None, under: false };
    for b in BUD_PRESETS {
        for &(progress, turn, reach, side) in &[(0.3, 0.6, 0.1, 1.0), (0.5, -1.2, 0.2, -1.0), (1.0, 0.0, 0.08, 1.0), (0.0, 3.14, 0.12, -1.0), (0.7, 2.0, 0.04, 1.0)] {
            let mut e = preset_params(b.id, progress, side).unwrap(); e.turn = turn; e.reach = reach;
            let part = grow_bud(&guide, &parent, &e, "bud");
            assert!(part.polygon.len() > 20, "{}: silhouette too small", b.id);
            assert_eq!(crossings(&part.polygon), 0, "{} at {progress}/{turn}: silhouette crosses itself", b.id);
            for cut in &part.cuts { for w in cut.windows(2) { let m = pt((w[0].x + w[1].x) / 2.0, (w[0].y + w[1].y) / 2.0);
                // an inner edge lies inside the silhouette (or on it within a hair)
                let near = part.polygon.iter().any(|q| (q.x - m.x).hypot(q.y - m.y) < part.length * 0.01);
                assert!(inside(m, &part.polygon) || near, "{}: cut outside silhouette", b.id); } }
        }
    }
}
