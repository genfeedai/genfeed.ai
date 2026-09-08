packages: agent cli helpers pages

Studio preset payload construction and projection now live in
`@genfeedai/helpers/studio-look.helper`. Existing agent and pages hook exports
remain available through re-exports; consumers can use the shared helper directly.

CLI request bodies now use the transport library's accepted body type. The unused
`ApiResponse` type and `getCommandOptions` wrapper are removed; callers should use
`command.optsWithGlobals()` directly. The unused `src/utils/helpers` module was
removed. Consumers importing its formatting, timing, progress, or idempotency
helpers must retain their own implementations before upgrading.
