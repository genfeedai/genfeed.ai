---
name: App theming
description: One System, Light, and Dark appearance contract across every rendered app surface
type: project
status: active
last_verified: 2026-08-19
topics: [theme, appearance, accessibility, apps]
---

# App theming spec

**Why:** Genfeed already has light and dark web tokens, but the product apps do not expose a consistent appearance preference and several surfaces force dark mode.
**How to apply:** Product surfaces follow the shared `system | light | dark` preference contract through a thin platform adapter. The public marketing website stays Dark. Use semantic tokens for application chrome; keep deliberately invariant media overlays scoped and documented.

## Purpose

Users can choose System, Light, or Dark in the product apps (main app, browser extension, mobile). The choice applies immediately, survives restart, and follows a signed-in user across devices where account settings are available. The marketing website stays on the dark studio canvas so editorial media is the focal point.

## Non-Goals

- Arbitrary palettes, tenant branding, or custom accent colors.
- Recoloring photographs, video controls, cinema overlays, or other intentionally invariant media chrome.
- A Genfeed theme selector inside VS Code; IDE webviews follow the host theme.
- A theme picker or OS-follow appearance on the public marketing website.
- Anonymous cross-app or cross-domain preference synchronization.
- Changing existing explicit dark preferences during migration.

## Shared Contract

- `ThemePreference` is `system | light | dark` and defaults to `system`.
- `ResolvedTheme` is `light | dark`; adapters resolve `system` from their host.
- Web preferences persist under the existing `theme` storage and cookie key without collapsing `system` to a resolved color.
- Signed-in product users persist the preference through `users/me/settings`.
- Browser extension and mobile persist locally when account settings are unavailable.
- Server-rendered standalone HTML follows `prefers-color-scheme`.
- Desktop boot/failure chrome follows Electron's native theme until the canonical web app loads.
- IDE webviews use VS Code theme variables and do not force `data-theme`.

## Acceptance Criteria

- WHEN no preference exists THE SYSTEM SHALL follow the operating-system or host appearance.
- WHEN a user chooses Light, Dark, or System THE SYSTEM SHALL apply it without a page reload and persist the raw preference.
- WHEN a signed-in product user changes appearance THE SYSTEM SHALL save it to account settings and restore it on another signed-in device.
- THE SYSTEM SHALL expose an accessible Appearance control in the main app, browser extension, and mobile app.
- THE SYSTEM SHALL render the public marketing website Dark, with no Appearance control and without following the operating-system scheme.
- THE SYSTEM SHALL keep docs on the same Light, Dark, and System behavior through its documentation theme control.
- THE SYSTEM SHALL make desktop boot/failure UI and standalone server HTML follow the host/system before app hydration.
- THE SYSTEM SHALL keep IDE webviews synchronized with VS Code's active theme.
- THE SYSTEM SHALL render application chrome from semantic tokens in both resolved themes.
- THE SYSTEM SHALL retain intentionally invariant dark media chrome only when scoped to that component.

## Failure Modes

- Invalid persisted values are ignored and resolve to System.
- If an account preference save fails, the main-app control restores the previous preference and surfaces the existing error feedback.
- If the system scheme cannot be observed, adapters use the shared deterministic fallback until it becomes available.
- Server rendering may not know the client's system scheme; CSS and the client theme bootstrap resolve it before or at first paint.

## Test Plan

- Unit-test preference validation, System resolution, request-cookie resolution, raw cookie persistence, and provider configuration.
- Component-test every user-facing Appearance control, including keyboard/accessibility labels and immediate application.
- Regression-test signed-in settings synchronization and API validation.
- Test native mobile provider persistence and system-change handling.
- Test extension storage plus `matchMedia` updates, Electron boot colors, VS Code token usage, and standalone server HTML media queries.
- Run focused tests, affected typechecks, design lint, app builds, and browser visual verification for both resolved themes.
