# Release review — 2026-09-16

GPL-3.0-only selected for project-authored software. The user confirmed ownership or redistribution permission for the original leaf sheets and three chip-carving SVG sheets on 2026-09-16, and explicitly requested that reference images not be uploaded. This is a recorded user confirmation, not an independent legal title investigation.

Reference-derived geometry remains in the software. All reference images, supplied reference SVG collections, personal designs, screenshots and existing Git history are excluded from the public snapshot. Dependency licenses retain their own terms. AI assistance was used in development; the license grants only rights held by contributors.

The allowlisted release-source directory is intended for a NEW repository with fresh history. Do not push the existing private hosting repository or alter its remote. Suggested repository name: ruffensteint-carving-studio.

Before upload: inspect the snapshot, run pnpm install --frozen-lockfile, pnpm test and pnpm build in the clean copy, and authenticate GitHub. GitHub authentication was verified with network access before publication; the earlier authentication failure was caused by restricted network access. The release copy passed 72 tests, TypeScript checking and a production build using the existing workspace dependencies. A fresh dependency installation was not performed.

THIRD_PARTY_NOTICES.md inventories the installed dependencies and their bundled root license files. Platform-specific packages are included when installed; regenerate for a changed lockfile or platform. This inventory is not a comprehensive legal certification.

