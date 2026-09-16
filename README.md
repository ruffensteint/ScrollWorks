# Ruffensteint ScrollWorks

A browser-based carving design tool built with TypeScript, React and SVG. Generate scrollwork from editable backbones, compose chip-carving patterns, place leaf shapes, save local presets and export designs at physical millimeter sizes. Generation runs locally without AI API calls.

## Run locally

Use Node.js 22.12 or later and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Each backbone has its own growth family, sweep count, structure and variation seed. The chip editor supports a millimeter grid and simplified curve handles. Presets stay in browser storage; export backups for portability.

## Python ports

See CONTRIBUTING.md for the geometry entry points. The generator is procedural; reference raster images are not needed at runtime and are intentionally excluded from this source release.

## License and attribution

Project-authored software is licensed under GPL-3.0-only. See LICENSE, COPYING.md, THIRD_PARTY_NOTICES.md and BRANDING.md. Modified distributions must meet the applicable GPL source and notice requirements. Ruffensteint branding does not imply endorsement of forks.

## Limitations

Leaf anatomy and collision handling remain works in progress. Review joins, overlaps and print scaling before carving. Scroll exports are drawing outlines, not machining toolpaths. Passing tests does not certify visual quality.

## Release preparation

The public snapshot is prepared with `node scripts/prepare-source-release.mjs`. It excludes private hosting metadata, existing Git history, references and personal designs. See RELEASE_AUDIT.md for the review record.

The GitHub source release is a browser-only edition: it has no app-install button, PWA manifest, or offline service worker.
