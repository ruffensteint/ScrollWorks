//! Leaf fans: one lead leaf plus 66% and 33% companions from the same node,
//! drawn behind the lead.
use scroll_core::geometry::{distance, line_length};
use scroll_core::model::{preset_params, Layout};
use scroll_core::shoots::ShootEdit;

#[test]
fn fans_grow_smaller_companions_from_one_node_behind_the_lead() {
    for id in ["returning-leaf", "leaf-volute", "sweeping-tongue", "two-finger-leaf"] {
        for (prog, side) in [(0.42, 1.0), (0.6, -1.0)] {
            for n in [None, Some(2u8), Some(3)] {
                let mut l = Layout::starter();
                let mut p = preset_params(id, prog, side).unwrap(); p.fan = n;
                l.shoots.push(ShootEdit { params: p, id: "f".into(), backbone: 0, replaces: None, hidden: false, under: false });
                let g = l.grow();
                let lead = g.parts.iter().position(|q| q.id == "f").unwrap();
                let members: Vec<usize> = g.parts.iter().enumerate().filter(|(_, q)| q.id.starts_with("f~fan")).map(|(i, _)| i).collect();
                assert_eq!(members.len(), n.unwrap_or(1) as usize - 1, "{id} {n:?}");
                let lead_len = line_length(&g.parts[lead].points);
                for (k, &i) in members.iter().rev().enumerate() {
                    let m = &g.parts[i];
                    assert!(i < lead, "companions are drawn behind the lead");
                    assert!(m.shoot.is_none(), "companions are edited through the lead");
                    assert!(distance(m.points[0], g.parts[lead].points[0]) < 1e-6, "same node");
                    let ratio = line_length(&m.points) / lead_len;
                    let want = [0.66, 0.33][k];
                    assert!((ratio - want).abs() < 0.05, "{id}: companion {k} is {ratio:.2} of the lead");
                    assert!(m.polygon.iter().all(|q| q.x.is_finite() && q.y.is_finite()));
                }
            }
        }
    }
}
