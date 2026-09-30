import type { ContentRunRecord } from '@services/content/content-runs.service';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';

type EntryResult = Pick<ContentRunRecord, 'id'>;
type EntryIntent = { clientRequestId: string; pending?: Promise<EntryResult> };
const intents = new Map<string, EntryIntent>();

function isDefinitiveFailure(error: unknown): boolean {
  const memberStatus = getJsonApiErrorMember(error)?.status;
  const directStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : undefined;
  const responseStatus =
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'status' in error.response
      ? Number(error.response.status)
      : undefined;
  const status = memberStatus ?? directStatus ?? responseStatus;
  // Timeouts and server failures can follow a committed create. Replay the UUID.
  return (
    status !== undefined && status >= 400 && status < 500 && status !== 408
  );
}

/** One explicit asset intent across mounted entry surfaces; no paid operation. */
export function runStoryboardEntryIntent(
  key: string,
  create: (clientRequestId: string) => Promise<EntryResult>,
): Promise<EntryResult> {
  const existing = intents.get(key);
  if (existing?.pending) return existing.pending;
  const intent = existing ?? { clientRequestId: crypto.randomUUID() };
  // Start in a microtask so the shared promise exists before create can re-enter.
  const pending = Promise.resolve().then(() => create(intent.clientRequestId));
  intent.pending = pending;
  intents.set(key, intent);
  void pending.then(
    () => {
      if (intents.get(key) === intent) intents.delete(key);
    },
    (error: unknown) => {
      if (intents.get(key) !== intent) return;
      if (isDefinitiveFailure(error)) intents.delete(key);
      else delete intent.pending;
    },
  );
  return pending;
}
