packages: @genfeedai/contracts

Add `BrandScrapeErrorCode` (`packages/contracts/src/enums/brand-scrape-error-code.enum.ts`)
and `IBrandScrapeWarning` (`packages/contracts/src/interfaces/onboarding/onboarding.interface.ts`),
and add an optional `scrapeWarning?: IBrandScrapeWarning` field to `IBrandSetupResponse`.

`POST /brands/:id/scrape` now classifies expected scrape failures (invalid URL,
unreachable site, blocked/robots, timeout, upstream provider error, empty
content) into this stable code instead of silently dropping the reason when it
falls back to a minimal brand profile. Consumers of `IBrandSetupResponse` should
read `scrapeWarning` to show the user why scraping degraded (issue #5080).

No migration needed — the field is optional and additive.
