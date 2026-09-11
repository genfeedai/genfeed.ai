packages: @genfeedai/config, @genfeedai/hooks

Keep desktop-surface renders hydration-safe for the hosted studio inside the
desktop shell.

- `config`: `deployment` exports `isDesktopShellBuild()`, the build-time
  `NEXT_PUBLIC_DESKTOP_SHELL` flag the server render also sees.
  `getClientSurface()` and `isDesktopClient()` are unchanged.
- `hooks`: adds `ui/use-is-desktop-client`. Render paths should read
  `useIsDesktopClient()` instead of calling `isDesktopClient()` during render;
  it hydrates from `isDesktopShellBuild()` and re-renders with the runtime
  surface right after.
