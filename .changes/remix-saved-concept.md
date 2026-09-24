packages: @genfeedai/contracts @genfeedai/pages @genfeedai/serializers

Brand remix runs now carry an optional saved `concept` (angle, hook, script, and storyboard) on the existing versioned ContentRun config. Consumers should keep using `ContentRun`; there is no second storyboard model.

`isCompleteBrandRemixConcept` reports when that concept can be generated. Saving or revising a concept does not start generation. `start` rejects a first generation until the concept is complete. Scene assembly is unchanged.

The content-run serializer emits `concept` so clients can reopen the saved idea. Existing runs without a concept remain valid and cannot start a new generation until one is saved.
