packages: @genfeedai/harness

`ContentHarnessBrief` gains a required `appliedPacks: string[]` listing only the
packs that contributed a directive or source; `packs` still lists every
registered pack. New exported types `ContentHarnessPackActivationState`,
`ContentHarnessPackActivation`, and `ContentHarnessActivationReport` describe
per-specifier activation of `CONTENT_HARNESS_PACKAGES`. Callers that build a
brief literal must add `appliedPacks`.
