import { config } from 'zod';

// Zod 4 probes for `eval` support with `new Function('')` the first time a
// schema is built and falls back to its interpreter when that throws. The throw
// is caught, but a Content-Security-Policy without `'unsafe-eval'` still reports
// the probe as a violation (the policy here is report-only, so every page load
// filed one). Running jitless skips the probe, so nothing is evaluated and the
// CSP stays strict. The cost is the interpreter's validation speed, which is
// irrelevant for the small payloads the browser validates.
//
// Import this module before anything that builds a Zod schema: the setting is
// read when each schema is created.
config({ jitless: true });
