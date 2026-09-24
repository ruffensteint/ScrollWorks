# Third-party dependency notices

ScrollWorks' geometry crate (`core/`, `scroll_core`) has no dependencies. The desktop program (`app/`) depends directly on:

| Crate | Version | Declared license |
|---|---|---|
| eframe (egui) | 0.29.1 | MIT OR Apache-2.0 |
| rfd | 0.15.4 | MIT |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde_json | 1.0.151 | MIT OR Apache-2.0 |

Cargo downloads these and their transitive dependencies (pinned in `Cargo.lock`) when you build. None of them are included in this repository. Each keeps its own license and notices, which ship with its source in the Cargo registry.

This is a source-only repository. Anyone distributing a compiled `ScrollWorks.exe` should first generate a complete inventory of the bundled crates' licenses and notices (for example with `cargo about` or `cargo license`) and ship it with the binary. This file is not a comprehensive legal certification.
