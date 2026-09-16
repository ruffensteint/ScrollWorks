# Contributing

Changes and Python ports are welcome. Contributions to the software must be offered under GPL-3.0-only, with existing notices preserved. Contributors retain their rights; no copyright assignment is requested.

Explain the source and license of any copied code or artwork. Do not submit traced or adapted reference designs without documenting permission. Disclose AI assistance and review generated changes before submitting them.

Use Node.js 22.12 or later and pnpm 10. Install with `pnpm install --frozen-lockfile`, then run `pnpm test` and `pnpm build`. For geometry changes, compare exported SVGs as well as tests. Passing tests does not establish visual quality or carving safety.

For a Python port, start with src/workbench/geometry.ts, acanthusContour.ts, spiralAnatomy.ts, composedGrowth.ts, growth.ts, and outlineUnion.ts. model.ts describes saved layouts. Keep seeded behavior and physical SVG units; use the existing tests as behavioral examples. Reference-based library assets need the provenance review described in RELEASE_AUDIT.md.
