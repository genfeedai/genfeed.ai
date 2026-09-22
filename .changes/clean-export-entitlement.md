packages: @genfeedai/pricing @genfeedai/props

Add the `cleanExportAccess` tier entitlement and `hasCleanExportAccess()` helper,
and a `canDownloadOriginal` quick-action prop so SaaS tiers without clean exports
see a locked "Original" download option. Self-hosted deployments are unaffected.
