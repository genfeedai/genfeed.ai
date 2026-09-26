packages: @genfeedai/contracts

`IDesktopGenerationOptions` gains an optional `brandId`, and
`IDesktopDataService.generateHooks` / the desktop bridge's
`cloud.generateHooks` gain an optional `brandId` second parameter —
generation always runs in an explicit brand context (#5219). Desktop callers
send the active workspace's `linkedBrandId` / `cloudLink.cloudBrandId`.
