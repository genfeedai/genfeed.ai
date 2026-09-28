packages: @genfeedai/services

Add `core/deferred-logger` (`logErrorDeferred`) for code that ships on every
page but rarely reports: error boundaries and the GSAP entrance hook. It loads
the full logger (pino and the Sentry SDK) on the first error instead of with
the page.
