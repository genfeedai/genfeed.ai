/**
 * Which conversation the dock last held for a record (`post:<id>` → thread
 * id), kept per browser so reopening the record reopens its own thread.
 */
export const AGENT_DOCK_THREAD_KEYS_STORAGE_KEY =
  'genfeed:agent-dock:thread-keys:v1';

// Plenty for a working set of records without growing storage forever.
const MAX_REMEMBERED_THREAD_KEYS = 200;

function readThreadKeys(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(
      AGENT_DOCK_THREAD_KEYS_STORAGE_KEY,
    );
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function writeThreadKeys(threadKeys: Record<string, string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      AGENT_DOCK_THREAD_KEYS_STORAGE_KEY,
      JSON.stringify(threadKeys),
    );
  } catch {
    // Storage can be blocked (private windows); the record then opens fresh.
  }
}

export function readRememberedThreadId(threadKey: string): string | null {
  return readThreadKeys()[threadKey] ?? null;
}

export function rememberThreadId(threadKey: string, threadId: string): void {
  const { [threadKey]: _previous, ...rest } = readThreadKeys();
  // Newest last, so trimming drops the records touched longest ago.
  const entries = [...Object.entries(rest), [threadKey, threadId]];
  writeThreadKeys(
    Object.fromEntries(entries.slice(-MAX_REMEMBERED_THREAD_KEYS)),
  );
}

export function forgetThreadId(threadKey: string): void {
  const { [threadKey]: _forgotten, ...rest } = readThreadKeys();
  writeThreadKeys(rest);
}
