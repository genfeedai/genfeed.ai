import { z } from 'zod';

/**
 * Zod 4 compiles each object schema into a specialised parser with
 * `new Function(...)`, and probes for that ability first with `Function("")`.
 * The page's Content-Security-Policy has no `'unsafe-eval'`, so the browser
 * reports a violation for the probe on every page load even though zod catches
 * the throw and falls back to its interpreted parser.
 *
 * Turning the compiler off skips the probe. Parsing is unchanged and the CSP
 * stays as strict as it is. `instrumentation-client.ts` imports this module
 * first, because schemas read the setting when they are constructed, so it has
 * to be set before any module that builds one runs.
 */
z.config({ jitless: true });
