packages: @genfeedai/services

Add `core/deferred-logger` (`deferredLogger`), a drop-in for `logger` with the
same `debug` / `info` / `warn` / `error` methods, for code that ships on every
page but rarely logs: error boundaries, the GSAP entrance hook, copy buttons
and layout guards. It loads the full logger (pino and the Sentry SDK) on the
first call instead of with the page.
