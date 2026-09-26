packages: @genfeedai/client @genfeedai/config @genfeedai/helpers @genfeedai/integrations @genfeedai/serializers

Adds a root `vitest-globals.d.ts` (`/// <reference types="vitest/globals" />`)
to each package whose shipping `tsconfig.json` sets no explicit `types` array
(implicit-all: every `@types/*` package is already visible). The new
`tsconfig.typecheck.specs.json` these packages enroll with (#5244, the
apps/app and packages/* spec typecheck ratchet) includes this file so vitest's
globals resolve during the ratchet's own program, without adding an explicit
`types` override that would silently narrow whatever `@types/*` packages
implicit-all mode was already providing.

This file is internal to each package's own typecheck configuration, not a
consumer-facing API; it is not otherwise imported or re-exported. No consumer
action is required.
