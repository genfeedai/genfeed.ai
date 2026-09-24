packages: @genfeedai/pages

Export `isObservedTrendContent` from `@genfeedai/pages/trends/desk/desk-items`
to exclude saved items with explicit fallback preview state or generated fallback
IDs before desk normalization, selection, scoring, and remix. Company URLs and
source classifications alone do not cause exclusion. This additive export keeps
existing imports compatible and requires no caller migration.
