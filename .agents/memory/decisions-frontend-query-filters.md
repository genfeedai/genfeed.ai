# Frontend query filter decisions — #5133

Compared retaining path presets (smallest change, perpetuates inconsistent identity), replacing every tab with a query (breaks distinct destinations), and migrating only list filters with shared matching fixes (selected).

Use view for inbox presets; place and shelf for Library, leaving its existing view key for grid/list/canvas; existing repeated categories for asset types; type for model types; assetType for admin ingredients because type already has a filter meaning; filter for tag category. Preserve current defaults. Keep query-aware navigation links as the existing segmented single-select UI. No multi-select All/Unread/Recent combination.

Audit includes app/admin routes and shared frontend packages, plus other web/mobile/extension route inventories. Distinct voices/captions managers, analytics dashboards, entity routes, editors and settings panels remain paths. Library place/shelf URL policy in older memory is superseded by this user-requested migration.
