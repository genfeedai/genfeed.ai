packages: @genfeedai/libs

`WebSocketGateway` (`@genfeedai/libs/websockets/websockets.gateway`) now rejects
a socket connection outright when its `Authorization` header attempts the
Bearer scheme but fails strict parsing (blank token, or surplus
whitespace-separated fields — see `parseAuthorizationHeader`), instead of
silently falling back to `handshake.auth.token`. A malformed presented
credential is a rejection, not an absence; only a header that carries no
Bearer attempt at all still falls through to the `auth.token` path. Mirrors
`TerminalGateway.hasMalformedBearerHeader` and `CombinedAuthGuard` (#5350).
