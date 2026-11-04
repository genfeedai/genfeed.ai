import { AsyncLocalStorage } from 'node:async_hooks';

/** Name logged for a run whose entry point did not name itself. */
export const UNATTRIBUTED_APIFY_CALLER = 'unattributed';

const storage = new AsyncLocalStorage<string>();

/**
 * The caller that started the current Apify work. Apify records every API
 * run with `meta.origin = API` and offers no label on a run, so the caller is
 * kept here and written next to the run id in our own log.
 */
export function currentApifyCaller(): string {
  return storage.getStore() ?? UNATTRIBUTED_APIFY_CALLER;
}

/** Runs `callback` so every Apify run it starts is attributed to `caller`. */
export function runWithApifyCaller<T>(caller: string, callback: () => T): T {
  return storage.run(caller, callback);
}
