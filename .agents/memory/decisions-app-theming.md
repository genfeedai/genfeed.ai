---
name: App theming decisions
description: Architecture choice for consistent appearance across heterogeneous app hosts
type: project
status: active
last_verified: 2026-08-19
topics: [theme, appearance, architecture]
---

# Decisions — App theming

## Approaches

1. **Independent per-app theme implementations** — small local diffs, but preference values, defaults, palettes, and accessibility behavior drift.
2. **One web theme provider everywhere** — superficially uniform, but couples React Native, Electron boot HTML, VS Code webviews, and standalone server pages to browser-only runtime assumptions.
3. **Shared contract and semantic palettes with thin platform adapters** — one preference vocabulary and token source, while each host uses its native persistence and system-theme signal.

**Chose 3.**

## Decisions

- System is a first-class stored preference, not a resolved Light or Dark snapshot.
- Existing explicit Light and Dark values remain unchanged; only the default becomes System.
- Main-app account settings are the cross-device source of truth after sign-in.
- Public/anonymous surfaces use local persistence.
- VS Code remains the IDE theme authority; Genfeed does not add a competing selector.
- Electron native theme owns pre-hydration desktop chrome; `apps/app` owns the loaded desktop UI.
- Shared semantic colors are the palette authority. Platform adapters may express them as CSS variables, React Native values, VS Code variables, or standalone-page CSS.
- Media/cinema overlays may stay invariant dark when contrast depends on the media rather than the surrounding app theme.

## Rejected

- Continuing dark-only as a product identity choice; a complete light palette already exists and inaccessible forced contrast is unnecessary.
- Persisting `resolvedTheme`; doing so silently turns System into an explicit color and prevents later OS changes from applying.
- Requiring authentication for appearance; public and offline-capable surfaces still need a local preference.
- Forcing `data-theme` in IDE webviews; it conflicts with VS Code's live theme variables.

## Assumptions

- The existing `theme` browser key and cookie can safely add the `system` value.
- Existing account rows with `dark` are intentional explicit preferences and should not be rewritten.
- A deterministic fallback is needed only until a host supplies its resolved system scheme.
