packages: @genfeedai/config

Replace the `@genfeedai/config/*` wildcard export with explicit `./deployment`,
`./interfaces`, `./license`, `./license-server`, and `./schemas` subpaths.
Mutable license state (`license-state`) is now internal to the package: read the
enterprise verdict through `isEEEnabled()` and write it through the server
license verification API.

Consumers importing an undeclared subpath must switch to the package root or one
of the declared subpaths.
