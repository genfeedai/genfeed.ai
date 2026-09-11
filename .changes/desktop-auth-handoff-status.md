packages: @genfeedai/props

Add `DesktopAuthCodeStatus` (`exchanged | expired | pending`) and the
`awaiting-desktop` flow step to `@genfeedai/props/auth/oauth-cli-content.props`.

The desktop OAuth handoff page now polls `POST /auth/desktop/status` instead of
inferring the deep-link launch from browser visibility. Consumers rendering
`FlowStep` must handle the new `awaiting-desktop` value.
