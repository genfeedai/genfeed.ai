packages: actions agent contracts helpers hooks pages props serializers services ui

Expose approved Remotion composition contracts, serializers, and workflow actions
for catalog discovery, render submission, status, cancellation, and retry. Render
submission returns a tracked job; consumers must poll its status before using the
completed asset. Only approved composition/version pairs and structured inputs
are accepted. See `docs/remotion-compositions.md` for the invocation contract.

Extend concierge warm-up contracts and client methods with reviewed preparation,
readiness, ledger-backed grants, and invitation/claim state. Grants are
non-expiring. Consumers must honor readiness blockers and treat customer claim as
the activation boundary instead of assuming workspace creation grants access.

Add existing-image character saving and image inspection, refresh agent mention
suggestions after saving, and accept nullable legacy character handles. Consumers
must handle missing handles before constructing mentions. Preserve completed
image assets and their links when displaying Studio and agent action outputs.

Expose `pendingSlugs` from the brand-skills hook. Disable the affected row while
its mutation is pending; use the defaults control's own loading state separately.
Discovery filter controls now mount in the shared page toolbar.

Move route-specific props/state/response declarations into shared prop contracts.
Existing route type exports remain compatible; new consumers should import the
shared contracts. Usage views and customer exports display credits and model names
instead of provider spend. Keep administrative cost reporting separate.

Add Help resource configuration and environment accessors with deployment-aware
defaults and explicit unavailable states. Deployments may override destinations;
no new environment setting is required. See
`apps/app/packages/config/help-resources.md` for supported overrides.
