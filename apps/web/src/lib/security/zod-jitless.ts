/**
 * Zod 4 compiles each object schema into a specialised parser with
 * `new Function(...)`, and probes for that ability first with `Function("")`.
 * The page's Content-Security-Policy has no `'unsafe-eval'`, so the browser
 * reports a violation for the probe on every page load even though zod catches
 * the throw and falls back to its interpreted parser.
 *
 * Turning the compiler off skips the probe. Parsing is unchanged and the CSP
 * stays as strict as it is.
 *
 * `instrumentation-client.ts` imports this module first, because schemas read
 * the setting when they are constructed.
 *
 * Zod keeps its global config on `globalThis.__zod_globalConfig` and reuses an
 * object that is already there, so setting the flag on that object works
 * whether zod has loaded yet or not. This avoids `import { config } from 'zod'`
 * on purpose: every zod entry point leaves several kB of schema code in the
 * first-load bundle of every route (measured +32 kB gzip for `z`, +4.9 kB for
 * `zod/v4/core`). `zod-jitless.test.ts` pins the behaviour to the installed
 * zod version, so an upgrade that moves the global fails the test.
 */
interface ZodGlobalScope {
  __zod_globalConfig?: { jitless?: boolean };
}

const zodGlobal = globalThis as typeof globalThis & ZodGlobalScope;

zodGlobal.__zod_globalConfig ??= {};
zodGlobal.__zod_globalConfig.jitless = true;
