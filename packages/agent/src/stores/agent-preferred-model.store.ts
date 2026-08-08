/**
 * Persist the agent composer model choice across full page reloads.
 * Scope is per browser profile (localStorage), not per thread — switching
 * models is a user preference, not thread state.
 */
const STORAGE_KEY = 'genfeed:agent-preferred-chat-model:v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPreferredAgentChatModel(): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const value = storage.getItem(STORAGE_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writePreferredAgentChatModel(modelKey: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const trimmed = modelKey.trim();
  if (!trimmed) {
    return;
  }

  try {
    // Concrete model keys and Auto (`__auto_model__`) are both durable prefs.
    storage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // Quota / private mode — preference is best-effort.
  }
}

export function clearPreferredAgentChatModel(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
