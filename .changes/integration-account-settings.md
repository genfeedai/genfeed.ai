packages: @genfeedai/client, @genfeedai/pages, @genfeedai/props, @genfeedai/services

Per-account integration settings: history import is chosen per connected account instead of per brand.

- `pages`: new `AccountSettingsDialog` and `AccountHistoryImportPanel`; `BrandSocialHistoryImportCard` is removed; the accounts table, row actions and connection-status util change.
- `client`, `props`, `services`: brand and credential shapes carry the per-account `isHistoryImportRequested` choice.
