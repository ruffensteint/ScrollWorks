//! Geometry-engine studies (i_overlay).
//!   scan            list parts whose outline crosses itself (skeletons, bent library leaves)
//!   loops NAME...   sheet of those leaves: raw outline red, cleaned black, crossings ringed
//!   joins PREFIX N  root close-ups: classic, smooth (SDF), exact at three fillet radii
//!   zoom NAME X Y R one spot: classic, outlines with zones and fills, exact
//! Run: cargo run --release -p scroll_core --example engine_study -- scan
use scroll_core::booleans::{area, clean_with, signed_area, tidy, Shapes};
use scroll_core::geometry::{lerp, Bounds, Point};
use scroll_core::model::{preset_params, Layout, LEAF_PRESETS};
use scroll_core::outline::{intersection, path_data};
use scroll_core::shoots::ShootEdit;
use scroll_core::skeleton::{skeleton_layout, Skeleton};

fn crossing_points(p: &[Point]) -> Vec<Point> {
    let n = p.len(); let mut out = vec![];
    for i in 0..n { for j in i + 2..n {
        if i == 0 && j == n - 1 { continue; }
        if let Some(t) = intersection(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]).filter(|t| *t > 1e-6 && *t < 1.0 - 1e-6) { out.push(lerp(p[i], p[(i + 1) % n], t)); }
    }}
    out
}

pub fn corpus() -> Vec<(String, Layout)> {
    let mut out = vec![];
    for kind in Skeleton::ALL { for seed in 1..=8u32 { out.push((format!("{}-{seed}", kind.name()), skeleton_layout(kind, seed, 240.0, 150.0))); } }
    for pre in LEAF_PRESETS { for bend in [-1.5, -0.8, 0.0, 0.8, 1.5] { for follow in [0.0, 1.0] {
        let mut l = Layout::starter();
        for (k, (prog, side)) in [(0.35, 1.0), (0.6, -1.0)].iter().enumerate() {
            let mut p = preset_params(pre.id, *prog, *side).unwrap(); p.bend = Some(bend); p.follow = Some(follow); p.leaf_scale = Some(1.3);
            l.shoots.push(ShootEdit { params: p, id: format!("s{k}"), backbone: 0, replaces: None, hidden: false, under: false });
        }
        out.push((format!("{} bend {bend} follow {follow}", pre.id), l));
    }}}
    out
}

/// One panel of a study sheet: a square view (mm) and layers of lines
/// (runs, colour, stroke width in screen pixels, closed).
pub struct Panel { pub title: String, pub view: Bounds, pub layers: Vec<(Vec<Vec<Point>>, &'static str, f64, bool)>, pub rings: Vec<Point>, pub fills: Vec<(Shapes, &'static str)> }
pub fn sheet(path: &str, panels: &[Panel], cols: usize, size: f64) {
    let rows = panels.len().div_ceil(cols);
    let (w, h) = (cols as f64 * size, rows as f64 * (size + 24.0));
    let mut s = format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\"><rect width=\"100%\" height=\"100%\" fill=\"white\"/>");
    for (i, p) in panels.iter().enumerate() {
        let (x, y) = ((i % cols) as f64 * size, (i / cols) as f64 * (size + 24.0));
        let v = &p.view; let span = (v.r - v.l).max(v.b - v.t); let k = span / size;
        s += &format!("<text x=\"{}\" y=\"{}\" font-family=\"Segoe UI\" font-size=\"14\">{}</text>", x + 6.0, y + 17.0, p.title);
        s += &format!("<svg x=\"{x}\" y=\"{}\" width=\"{size}\" height=\"{size}\" viewBox=\"{} {} {span} {span}\"><g fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\">", y + 24.0, v.l, v.t);
        for (shapes, colour) in &p.fills { let d: String = shapes.iter().map(|sh| path_data(sh, true)).collect::<Vec<_>>().join(" "); s += &format!("<path d=\"{d}\" fill=\"{colour}\" fill-rule=\"evenodd\" stroke=\"none\"/>"); }
        for (runs, colour, width, closed) in &p.layers { s += &format!("<path d=\"{}\" stroke=\"{colour}\" stroke-width=\"{}\"/>", path_data(runs, *closed), width * k); }
        for d in &p.rings { s += &format!("<circle cx=\"{}\" cy=\"{}\" r=\"{}\" stroke=\"#e08000\" stroke-width=\"{}\"/>", d.x, d.y, 7.0 * k, 1.2 * k); }
        s += &format!("<rect x=\"{}\" y=\"{}\" width=\"{span}\" height=\"{span}\" stroke=\"#bbb\" stroke-width=\"{}\"/></g></svg>", v.l, v.t, k);
    }
    s += "</svg>";
    std::fs::write(path, s).unwrap();
}
pub fn around(p: Point, m: f64) -> Bounds { Bounds { l: p.x - m, r: p.x + m, t: p.y - m, b: p.y + m } }
pub fn widen(b: Bounds, m: f64) -> Bounds { Bounds { l: b.l - m, t: b.t - m, r: b.r + m, b: b.b + m } }

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(|s| s.as_str()) {
        Some("scan") => for (name, l) in corpus() {
            for p in &l.grow().parts {
                let c = crossing_points(&p.polygon).len(); if c == 0 { continue; }
                let cl = tidy(&p.polygon);
                println!("{name:40} {:28} crossings {c:3}  pieces {}  area {:.1} -> {:.1}", p.id, cl.len(), signed_area(&p.polygon).abs(), area(&cl));
            }
        },
        Some("loops") => {
            let mut panels = vec![];
            for (name, l) in corpus() {
                if !args[1..].iter().any(|w| name == *w) { continue; }
                for p in l.grow().parts.iter().filter(|p| p.id == "s0") {
                    let xs = crossing_points(&p.polygon); let raw = vec![p.polygon.clone()];
                    let (nz, or) = (clean_with(&p.polygon, false), tidy(&p.polygon));
                    let lines = |s: &Shapes| -> Vec<Vec<Point>> { s.iter().flatten().cloned().collect() };
                    let focus = xs.first().copied().unwrap_or(p.polygon[0]);
                    for (view, tag) in [(widen(Bounds::of(&p.polygon), 1.0), ""), (around(focus, 3.0), " close-up")] {
                        panels.push(Panel { title: format!("{name}{tag}: raw"), view, layers: vec![(raw.clone(), "#d02020", 1.2, true)], rings: if tag.is_empty() { xs.clone() } else { vec![] }, fills: vec![] });
                        panels.push(Panel { title: format!("non-zero ({} pieces)", nz.len()), view, layers: vec![(lines(&nz), "#000", 1.2, true)], rings: vec![], fills: vec![(nz.clone(), "#cfd8e8")] });
                        panels.push(Panel { title: format!("tidy ({} pieces)", or.len()), view, layers: vec![(lines(&or), "#000", 1.2, true)], rings: vec![], fills: vec![(or.clone(), "#cfe8d4")] });
                    }
                }
            }
            sheet("loops.svg", &panels, 3, 380.0);
        }
        Some("joins") => {
            // joins PREFIX [N]: close-ups at the first N roots of each matching layout
            use scroll_core::exact::{exact_drawing, ExactSettings};
            use scroll_core::joins::smooth_drawing;
            use scroll_core::layers::{layered_drawing, Drawing};
            let limit: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(12);
            let mut panels = vec![];
            for (name, l) in corpus() {
                if !args.get(1).map(|s| s.as_str()).unwrap_or("").split('|').any(|w| name.starts_with(w)) { continue; }
                let g = l.grow();
                let t0 = std::time::Instant::now();
                let e8 = exact_drawing(&g, ExactSettings { tidy: true, fillet: 0.8 });
                eprintln!("{name}: exact {:.1} ms", t0.elapsed().as_secs_f64() * 1e3);
                let t1 = std::time::Instant::now(); let _ = layered_drawing(&g); let t2 = std::time::Instant::now(); let _ = scroll_core::exact::tidied(&g);
                eprintln!("  classic {:.1} ms, tidy {:.1} ms", (t2 - t1).as_secs_f64() * 1e3, t2.elapsed().as_secs_f64() * 1e3);
                let views: Vec<(&str, Drawing)> = vec![("classic", layered_drawing(&g)), ("smooth (SDF)", smooth_drawing(&g)),
                    ("exact r 0.5", exact_drawing(&g, ExactSettings { tidy: true, fillet: 0.5 })), ("exact r 0.8", e8), ("exact r 1.2", exact_drawing(&g, ExactSettings { tidy: true, fillet: 1.2 }))];
                let filled = scroll_core::exact::debug_fills(&g, 1.2).0;
                let changed = |at: scroll_core::geometry::Point| filled.iter().any(|f| f[0].iter().any(|q| scroll_core::geometry::distance(*q, at) < 6.0));
                for p in g.parts.iter().filter(|p| p.parent.is_some() && !p.points.is_empty()).filter(|p| std::env::var("SW_FILLED").is_err() || changed(p.points[0])).take(limit) {
                    let at = p.points[0]; let r = (p.width * 3.0).clamp(4.0, 9.0);
                    for (tag, d) in &views {
                        panels.push(Panel { title: format!("{} {} ({:.1},{:.1}) {tag}", name, p.id.rsplit('/').next().unwrap(), at.x, at.y), view: around(at, r), layers: vec![(d.outline.clone(), "#000", 1.6, false), (d.folds.clone(), "#666", 1.0, false)], rings: vec![], fills: vec![] });
                    }
                }
            }
            sheet("joins.svg", &panels, 5, std::env::var("SW_PANEL").ok().and_then(|s| s.parse().ok()).unwrap_or(300.0));
        }
        Some("zoom") => {
            // zoom NAME X Y R [FILLET]: classic, exact and its fills/zones around one point
            use scroll_core::exact::{debug_fills, exact_drawing, ExactSettings};
            use scroll_core::layers::layered_drawing;
            let (x, y, r): (f64, f64, f64) = (args[2].parse().unwrap(), args[3].parse().unwrap(), args[4].parse().unwrap());
            let fillet: f64 = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(0.8);
            let (_, l) = corpus().into_iter().find(|(n, _)| *n == args[1]).unwrap();
            let g = l.grow(); let at = scroll_core::geometry::pt(x, y);
            let (f, zones) = debug_fills(&g, fillet);
            let tidy = args.get(6).map(|s| s != "raw").unwrap_or(true);
            let ex = exact_drawing(&g, ExactSettings { tidy, fillet });
            if let (Some(px), Some(py)) = (args.get(7).and_then(|s| s.parse().ok()), args.get(8).and_then(|s| s.parse().ok())) { for l in scroll_core::exact::debug_point(&g, fillet, scroll_core::geometry::pt(px, py)) { eprintln!("{l}"); } }
            let raw: Vec<Vec<Point>> = g.parts.iter().map(|p| p.polygon.clone()).collect();
            let panels = vec![
                Panel { title: "classic".into(), view: around(at, r), layers: vec![(layered_drawing(&g).outline, "#000", 1.5, false)], rings: vec![], fills: vec![] },
                Panel { title: "outlines, zones, fills".into(), view: around(at, r), layers: vec![(raw, "#c33", 1.0, true), (zones, "#8ab", 1.0, false)], rings: vec![], fills: vec![(f, "#f0a0a0")] },
                Panel { title: format!("exact {fillet}"), view: around(at, r), layers: vec![(ex.outline, "#000", 1.5, false)], rings: vec![], fills: vec![] },
            ];
            sheet("zoom.svg", &panels, 3, 420.0);
        }
        _ => eprintln!("modes: scan | loops NAME... | joins PREFIX [N] | zoom NAME X Y R [FILLET]"),
    }
}
