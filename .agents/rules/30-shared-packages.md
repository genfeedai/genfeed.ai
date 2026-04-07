---
description: Shared package constraints for genfeed.ai packages.
globs:
  - "packages/**"
  - "ee/packages/**"
---

- Maintain strict TypeScript types and avoid `any`.
- Keep serializers and shared interfaces in canonical package locations.
- Avoid package API breakage without explicit migration notes.
