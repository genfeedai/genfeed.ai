/**
 * Services that call the API's /v1/internal/* routes. Each one can hold its
 * own bearer key (`GENFEEDAI_API_KEY_<CALLER>`) so that a leak of one service's
 * key does not open the routes of the others.
 */
export const INTERNAL_CALLERS = [
  'discord',
  'files',
  'notifications',
  'slack',
  'telegram',
] as const;

export type InternalCaller = (typeof INTERNAL_CALLERS)[number];

export type InternalCallerKeyName =
  | 'GENFEEDAI_API_KEY_DISCORD'
  | 'GENFEEDAI_API_KEY_FILES'
  | 'GENFEEDAI_API_KEY_NOTIFICATIONS'
  | 'GENFEEDAI_API_KEY_SLACK'
  | 'GENFEEDAI_API_KEY_TELEGRAM';

export type InternalCallerKeyReader = (
  key: InternalCallerKeyName | 'GENFEEDAI_API_KEY',
) => string | undefined;

const INTERNAL_CALLER_KEY_NAMES: Record<InternalCaller, InternalCallerKeyName> =
  {
    discord: 'GENFEEDAI_API_KEY_DISCORD',
    files: 'GENFEEDAI_API_KEY_FILES',
    notifications: 'GENFEEDAI_API_KEY_NOTIFICATIONS',
    slack: 'GENFEEDAI_API_KEY_SLACK',
    telegram: 'GENFEEDAI_API_KEY_TELEGRAM',
  };

export function internalCallerKeyName(
  caller: InternalCaller,
): InternalCallerKeyName {
  return INTERNAL_CALLER_KEY_NAMES[caller];
}

/**
 * The key a caller sends, and the key the API expects from it: the caller's own
 * `GENFEEDAI_API_KEY_<CALLER>` when set, otherwise the shared
 * `GENFEEDAI_API_KEY`. Falling back keeps a caller working until its own key is
 * provisioned; once every caller has one, the shared key stops opening these
 * routes. Returns `''` when neither is set.
 */
export function resolveInternalCallerKey(
  read: InternalCallerKeyReader,
  caller: InternalCaller,
): string {
  return (
    read(INTERNAL_CALLER_KEY_NAMES[caller])?.trim() ||
    read('GENFEEDAI_API_KEY')?.trim() ||
    ''
  );
}

/** Keys the API accepts on a route that only the given callers may use. */
export function resolveAcceptedInternalCallerKeys(
  read: InternalCallerKeyReader,
  callers: readonly InternalCaller[],
): string[] {
  return callers
    .map((caller) => resolveInternalCallerKey(read, caller))
    .filter((key) => key !== '');
}
