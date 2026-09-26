packages: @genfeedai/actions @genfeedai/contracts @genfeedai/pages

Scene remix recovery and billing hardening. The hidden `brand-remix.scene-step` action input accepts an optional `sequence`, so a job from a superseded step chain exits. Scene pipeline receipts may record the credit `reservationId` they settle or release. `useStudioRemixRun` keeps refreshing while accepted provider work is still being recorded after a cancellation. All changes are additive and optional.
