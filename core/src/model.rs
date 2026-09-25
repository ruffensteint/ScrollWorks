//! A ScrollWorks layout: page, backbones, per-backbone growth, shoot edits,
//! kept parts and legacy stamps; growing it; presets; SVG export.
use crate::geometry::{arc_table, distance, pt, Curve, Point};
use crate::growth::{grow_backbone, GrowInput, GrowthPart, GrowthResult, GrowthSettings};
use crate::layers::{carving_guides, layered_drawing};
use crate::outline::path_data;
use crate::profiles::profile;
use crate::shoots::{ShootEdit, ShootParams};

/// Pull a child sweep's root outline back inside its parent near the join
/// (see `grow_settled`).
fn tuck_root(child: &mut GrowthPart, parent: &[Point], join: Point) {
    use crate::outline::inside;
    let spine = &child.points; if spine.len() < 4 { return; }
    let start = if distance(spine[0], join) <= distance(*spine.last().unwrap(), join) { spine[0] } else { *spine.last().unwrap() };
    let Some(ahead) = spine.iter().copied().filter(|q| distance(*q, start) > 6.0).min_by(|a, b| distance(*a, start).partial_cmp(&distance(*b, start)).unwrap()) else { return };
    let l = distance(ahead, start).max(1e-9); let d = pt((ahead.x - start.x) / l, (ahead.y - start.y) / l);
    let reach = 9.0;
    for p in child.polygon.iter_mut() {
        let (dx, dy) = (p.x - join.x, p.y - join.y);
        let ahead = dx * d.x + dy * d.y;
        if dx.hypot(dy) > reach || ahead > 3.0 || inside(*p, parent) { continue; }
        // largest k in (0, 1) with join + k·(p − join) inside the parent
        let (mut lo, mut hi) = (0.0, 1.0);
        for _ in 0..24 { let k = (lo + hi) / 2.0; if inside(pt(join.x + dx * k, join.y + dy * k), parent) { lo = k; } else { hi = k; } }
        // fully tucked behind the fork, easing out toward the child so the
        // outline has no step where tucking stops
        let w = { let x = ((3.0 - ahead) / 3.0).clamp(0.0, 1.0); x * x * (3.0 - 2.0 * x) };
        let k = 1.0 + (lo * 0.8 - 1.0) * w;
        *p = pt(join.x + dx * k, join.y + dy * k);
    }
}

/// Old manual-mode stamp; kept only so saved layouts can be converted.
#[derive(Clone, Debug, PartialEq)]
pub struct Placement { pub id: String, pub motif: String, pub progress: f64, pub length: f64, pub fullness: f64, pub angle: f64, pub bend: f64, pub mirror: bool, pub folds: bool, pub backbone: usize, pub on_top: Option<bool> }

#[derive(Clone, Debug)]
pub struct Layout {
    pub width: f64, pub height: f64, pub curves: Vec<Curve>, pub growth: Vec<GrowthSettings>,
    pub locked_parts: Vec<GrowthPart>, pub shoots: Vec<ShootEdit>, pub items: Vec<Placement>, pub print_backbone: bool,
}
impl Layout {
    /// One grown backbone on a 240 × 150 mm page.
    pub fn starter() -> Layout {
        Layout { width: 240.0, height: 150.0, curves: vec![[pt(34.0, 112.0), pt(85.0, 125.0), pt(110.0, 66.0), pt(196.0, 86.0)]], growth: vec![GrowthSettings::default()], locked_parts: vec![], shoots: vec![], items: vec![], print_backbone: false }
    }
    pub fn growth_for(&self, i: usize) -> GrowthSettings { self.growth.get(i).cloned().or_else(|| self.growth.first().cloned()).unwrap_or_default() }
    /// Where an attached backbone meets its parent: the parent's centreline
    /// point nearest to the child's start.
    pub fn attach_point(&self, index: usize) -> Option<Point> {
        let parent = self.growth_for(index).attach.filter(|&p| p != index && p < self.curves.len())?;
        let start = self.curves[index][0];
        arc_table(&self.curves[parent]).into_iter().map(|r| r.point).min_by(|a, b| distance(*a, start).partial_cmp(&distance(*b, start)).unwrap())
    }
    /// Attached backbones start on their parent's stem. When a parent changes,
    /// its children (and theirs) move rigidly with the join, keeping their own
    /// shape. Returns true when anything moved.
    pub fn settle(&mut self) -> bool {
        let mut moved = false;
        for i in 0..self.curves.len() {
            if let Some(p) = self.attach_point(i) {
                let d = pt(p.x - self.curves[i][0].x, p.y - self.curves[i][0].y);
                if d.x.abs() + d.y.abs() > 1e-9 { self.translate(i, d); moved = true; }
            }
        }
        moved
    }
    /// Move a backbone and everything growing from it.
    pub fn translate(&mut self, index: usize, d: Point) {
        let mut group = vec![index]; group.extend(self.descendants(index));
        for b in group { for q in self.curves[b].iter_mut() { *q = pt(q.x + d.x, q.y + d.y); } }
    }
    /// Slide an attached backbone along its parent's stem so its start lands on
    /// the stem point nearest `to`; the scroll keeps its shape. False when the
    /// backbone is not attached.
    pub fn slide_attached(&mut self, index: usize, to: Point) -> bool {
        let Some(parent) = self.growth_for(index).attach.filter(|&p| p != index && p < self.curves.len()) else { return false };
        let Some(np) = arc_table(&self.curves[parent]).into_iter().map(|r| r.point).min_by(|a, b| distance(*a, to).partial_cmp(&distance(*b, to)).unwrap()) else { return false };
        let d = pt(np.x - self.curves[index][0].x, np.y - self.curves[index][0].y);
        self.translate(index, d);
        true
    }
    /// Backbones that grow (directly or indirectly) from `index`.
    pub fn descendants(&self, index: usize) -> Vec<usize> {
        let mut out = vec![]; let mut frontier = vec![index];
        while let Some(b) = frontier.pop() {
            for i in 0..self.curves.len() { if i != index && !out.contains(&i) && self.growth_for(i).attach == Some(b) { out.push(i); frontier.push(i); } }
        }
        out
    }
    /// Grow every backbone. With several, part ids are prefixed `backbone-N/`.
    pub fn grow(&self) -> GrowthResult {
        let mut settled = self.clone();
        let mut rounds = 0; while rounds < 6 && settled.settle() { rounds += 1; } // chains settle in a few rounds; cycles stop
        settled.grow_settled()
    }
    fn grow_settled(&self) -> GrowthResult {
        if self.curves.len() == 1 {
            let s = self.growth_for(0);
            return grow_backbone(&GrowInput { width: self.width, height: self.height, curve: self.curves[0], locked: &self.locked_parts, shoots: &self.shoots.iter().filter(|e| e.backbone == 0).cloned().collect::<Vec<_>>(), settings: &s });
        }
        let mut all = GrowthResult { message: format!("{} backbones · independently grown scrolls", self.curves.len()), ..Default::default() };
        for (index, curve) in self.curves.iter().enumerate() {
            let prefix = format!("backbone-{index}/");
            let strip = |s: &str| s.rsplit('/').next().unwrap().to_string();
            let locked: Vec<GrowthPart> = self.locked_parts.iter().filter(|p| p.id.starts_with(&prefix)).map(|p| GrowthPart { id: strip(&p.id), parent: p.parent.as_deref().map(strip), ..p.clone() }).collect();
            let shoots: Vec<ShootEdit> = self.shoots.iter().filter(|e| e.backbone == index).map(|e| ShootEdit { backbone: 0, ..e.clone() }).collect();
            let s = self.growth_for(index);
            let r = grow_backbone(&GrowInput { width: self.width, height: self.height, curve: *curve, locked: &locked, shoots: &shoots, settings: &s });
            all.parts.extend(r.parts.into_iter().map(|p| GrowthPart { id: format!("{prefix}{}", p.id), parent: p.parent.map(|q| format!("{prefix}{q}")), ..p }));
        }
        // An attached backbone's sweep becomes a child of its parent's sweep,
        // so the two merge where they meet.
        let mains: Vec<Option<String>> = (0..self.curves.len()).map(|i| { let pre = format!("backbone-{i}/"); all.parts.iter().find(|p| p.parent.is_none() && p.id.starts_with(&pre)).map(|p| p.id.clone()) }).collect();
        for i in 0..self.curves.len() {
            let Some(parent) = self.growth_for(i).attach.filter(|&p| p != i && p < self.curves.len()) else { continue };
            let (Some(child), Some(pid)) = (mains[i].clone(), mains[parent].clone()) else { continue };
            if let Some(part) = all.parts.iter_mut().find(|p| p.id == child) { part.parent = Some(pid.clone()); }
            // The child's root flare must not poke out through the far side of
            // the parent: outline points around the root that fall outside
            // the parent (and are not already heading up the child) are drawn
            // back into it, where the join hides them.
            if let (Some(join), Some(par)) = (self.attach_point(i), all.parts.iter().find(|p| p.id == pid).map(|p| p.polygon.clone())) {
                if let Some(part) = all.parts.iter_mut().find(|p| p.id == child) { tuck_root(part, &par, join); }
            }
            // collar leafage over the fork, drawn on top of everything grown so far
            let s = self.growth_for(i);
            if let Some(size) = s.collar.filter(|v| v.is_finite() && *v > 0.0) {
                let style = s.collar_style.as_deref().and_then(crate::collar::CollarStyle::from_id).unwrap_or(crate::collar::CollarStyle::Axil);
                let join = self.attach_point(i);
                let (par, ch) = (all.parts.iter().find(|p| p.id == pid), all.parts.iter().find(|p| p.id == child));
                if let (Some(join), Some(par), Some(ch)) = (join, par, ch) {
                    let leaves = crate::collar::collar_parts(style, &format!("backbone-{i}/collar"), par, ch, join, size);
                    all.parts.extend(leaves);
                }
            }
        }
        all
    }
    /// The pattern SVG at physical millimetre size.
    pub fn svg(&self) -> String {
        let d = layered_drawing(&self.grow());
        let backbone = if self.print_backbone { self.curves.iter().map(|c| format!("<path d=\"M {} {} C {} {} {} {} {} {}\" stroke-width=\".35\"/>", c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y)).collect::<String>() } else { String::new() };
        format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}mm\" height=\"{h}mm\" viewBox=\"0 0 {w} {h}\"><title>ScrollWorks pattern</title><g fill=\"none\" stroke=\"#000\" stroke-linecap=\"round\" stroke-linejoin=\"round\">{backbone}<path d=\"{}\" stroke-width=\".35\"/><path d=\"{}\" stroke-width=\".2\"/></g></svg>", path_data(&d.outline, false), path_data(&d.folds, false), w = self.width, h = self.height)
    }
    /// Carving guides SVG: visible edges, raised ridges, recessed creases.
    pub fn carving_svg(&self) -> String {
        let g = carving_guides(&self.grow());
        format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}mm\" height=\"{h}mm\" viewBox=\"0 0 {w} {h}\"><title>ScrollWorks suggested carving guides</title><desc>Solid black: visible edges. Blue dashed: suggested raised ridges. Red dotted: recessed creases. Review before carving; not routing toolpaths.</desc><g fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path id=\"visible-edges\" d=\"{}\" stroke=\"black\" stroke-width=\".35\"/><path id=\"raised-ridges\" d=\"{}\" stroke=\"#246a9b\" stroke-width=\".25\" stroke-dasharray=\"2 1\"/><path id=\"recessed-creases\" d=\"{}\" stroke=\"#a24434\" stroke-width=\".25\" stroke-dasharray=\".4 .8\"/></g></svg>", path_data(&g.outline, false), path_data(&g.ridges, false), path_data(&g.creases, false), w = self.width, h = self.height)
    }
}

/// Library leaf types grown from measured spines.
pub struct LeafPreset { pub id: &'static str, pub name: &'static str, pub detail: &'static str, pub size: f64 }
pub const LEAF_PRESETS: &[LeafPreset] = &[
    LeafPreset { id: "returning-leaf", name: "Returning leaf", detail: "Full belly · two body lobes", size: 0.3 },
    LeafPreset { id: "leaf-volute", name: "Leaf volute", detail: "Open curl · broad inner leaf", size: 0.24 },
    LeafPreset { id: "rolled-fan", name: "Rolled fan", detail: "Broad crown · inward returns", size: 0.26 },
    LeafPreset { id: "turned-bud", name: "Turned leaf", detail: "Small accent · soft returning tip", size: 0.2 },
    LeafPreset { id: "two-finger-leaf", name: "Two-finger leaf", detail: "Two rounded fingers · shared taper", size: 0.24 },
    LeafPreset { id: "upright-sprig", name: "Upright sprig", detail: "Rising tip · paired soft lobes", size: 0.24 },
    LeafPreset { id: "sweeping-tongue", name: "Sweeping leaf", detail: "Long belly · single folded return", size: 0.28 },
];
pub fn preset_params(id: &str, progress: f64, side: f64) -> Option<ShootParams> {
    if crate::bud::is_bud(id) { return crate::bud::bud_params(id, progress, side); }
    let p = LEAF_PRESETS.iter().find(|p| p.id == id)?; let prof = profile(id)?;
    Some(ShootParams { progress, reach: p.size * prof.length, turn: prof.frame * side, curl: 0.66, side, preset: Some(id.to_string()), ..ShootParams::default() })
}

/// Old stamps become grown leaves of the matching type at the same root,
/// size and angle; their backbones stop adding automatic shoots.
pub fn convert_legacy(layout: &mut Layout, new_id: &mut dyn FnMut() -> String) {
    let mut touched = vec![];
    for item in std::mem::take(&mut layout.items) {
        let b = item.backbone.min(layout.curves.len() - 1); let length = arc_table(&layout.curves[b])[240].length;
        let id = if profile(&item.motif).is_some() { item.motif.as_str() } else { LEAF_PRESETS[0].id };
        let prof = profile(id).unwrap(); let m = if item.mirror { -1.0 } else { 1.0 };
        let mut params = preset_params(id, item.progress, 1.0).unwrap();
        params.reach = (item.length * prof.length / length.max(1.0)).clamp(0.02, 1.5);
        params.turn = item.angle.to_radians() + m * prof.frame; params.side = m;
        params.leaf_scale = Some(item.fullness.clamp(0.2, 2.5)); params.bend = Some(if item.bend != 0.0 { item.bend / 40.0 } else { 0.0 });
        layout.shoots.push(ShootEdit { params, id: new_id(), backbone: b, replaces: None, hidden: false, under: item.on_top == Some(false) });
        if !touched.contains(&b) { touched.push(b); }
    }
    for b in touched { while layout.growth.len() <= b { let g = layout.growth_for(layout.growth.len()); layout.growth.push(g); } layout.growth[b].auto_shoots = Some(false); }
}

pub fn point_list(p: &[Point]) -> String { p.iter().map(|q| format!("{} {}", q.x, q.y)).collect::<Vec<_>>().join(" ") }
