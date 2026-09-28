packages: @genfeedai/contracts @genfeedai/props @genfeedai/services

`IViralHookVideo` and `IViralHookAnalysis` now describe the real `GET /analytics/hooks`
response (`AnalyticsResponseProjection.buildViralHooks`): a text `hook` per post, string
`platforms`, and `totalViews` / `totalEngagement` aggregates. `analysis` carries
`topPlatforms` (`IViralHookPlatformSummary`), `hookEffectiveness` (`IViralHookEffectiveness`,
grouped by hook text) and `topHooks` (`IViralTopHook`). `IViralHooksResult` is the full response.

Removed `IViralHook`, `IViralPlatformMetrics`, `ITopPerformingPlatform` and
`IHookTypeEffectiveness`: no producer ever emitted per-hook timestamps, effectiveness
scores, viral scores or time tracking. Hook page props now take these contract types
directly (`PlatformPerformanceSection` takes `topPlatforms`; `HookStatCards` drops
`formatTimeSpent`). `AnalyticsService.getViralHooks` returns `IViralHooksResult`.

See genfeedai/genfeed.ai#5415.
