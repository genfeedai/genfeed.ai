# Frontend query filters — #5133

List filters use query parameters; resource identities, editors and distinct product surfaces use paths. Preserve existing presets and defaults, single-select semantics for mutually exclusive views and multi-select semantics for independent asset categories. The URL remains the source of truth across reload/back/forward.

Migrate inbox view, library place/shelf/type, model type, admin ingredient type and tag category. Keep Library voices/captions (different data and management UI), automation bot setup, analytics detail dashboards and settings sections as destinations. Existing publishing filters already use queries.

Acceptance: old filter paths redirect with unrelated query values preserved; changed filters reset pagination while preserving other applicable filters; menu aliases and query identity both match; query tabs match their own parameters rather than pathname alone. Brand, organization, admin and self-hosted routes retain their scope.

Verification: focused route, menu, tab, library and page regressions; affected typechecks; lint; independent review and required PR CI.
