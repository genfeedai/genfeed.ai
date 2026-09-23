packages: @genfeedai/cli

Finish the PKCE login surface (#4981).
`auth status` reports whether a key is stored, the organization, and the
scopes returned by `GET /auth/whoami`. `auth logout` and top-level `logout`
share `runLogout`.

`saveConfig` creates `~/.gf` as mode 0700 and writes `config.json` as mode
0600. The config path is unchanged. `GENFEED_API_KEY` remains the CI override.
New export: `./src/commands/auth-status`. `./src/commands/logout` now also
exports `runLogout` and `createAuthLogoutCommand`.
