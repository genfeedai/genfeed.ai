packages: props

`@genfeedai/props` — `ExpertStepHeaderProps` gains an optional `isFinalStep`.
The Expert Path's closing `first-system` screen sets it so the shared step
badge counts it (positioning 2 of 4, corpus 3 of 4, first system 4 of 4)
instead of falling back to the brand step's position. Additive; existing
callers keep compiling.
