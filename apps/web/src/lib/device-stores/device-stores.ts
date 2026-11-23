import { clearBootRecord } from '@/lib/boot-record/boot-record';
import { clearPersistedQueryCache } from '@/lib/query-cache/persisted-query-cache';

/**
 * Every browser store that holds something a workspace returned, or a draft
 * made in one. Sign-out, a refused organization and another user all wipe
 * exactly these. A store that holds workspace data is added here in the same
 * change that creates it.
 *
 * Kept on purpose, because they hold a layout or UI preference and nothing a
 * workspace returned: the theme, `genfeed:sidebar:*` (width, collapsed
 * groups), `genfeed-agent-panel-open`, `genfeed:connect-card-dismissed:*` (one
 * timestamp), `genfeed-session-id` (a random id) and the onboarding handoff
 * keys (they belong to a visitor who has no workspace yet).
 */
export const WIPED_LOCAL_STORAGE_PREFIXES = [
  // The boot record, any version.
  'genfeed:boot:',
  // Saved copies of reads, scoped by user and organization.
  'analytics:top-posts:',
  'analytics:leaderboards:',
  'analytics:scoped:',
  'analytics:timeseries:',
  'ingredients:list:',
  'ingredients:detail:',
  'trends:evaluation-videos:',
  // The Home connection line (a connection status per organization).
  'genfeed:connect-line:',
  // Which dock thread belongs to which record.
  'genfeed:agent-dock:thread-keys:',
  'genfeed:terminal:sessions',
  'genfeed-agent-dashboard-blocks:',
  'genfeed:streak-announcements:',
  // The studio playground: its prompts and results, and its session.
  'genfeed.studio.generate.',
  'genfeed-brand-interview-drafts-',
] as const;

export const WIPED_SESSION_STORAGE_PREFIXES = [
  'genfeed:storyboard-draft:',
  'genfeed:conversation-composer:',
  'genfeed.studio.generate.',
] as const;

function removeByPrefix(storage: Storage, prefixes: readonly string[]): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    storage.removeItem(key);
  }
}

/**
 * Removes what this device kept of a workspace: the boot record, the device
 * query cache and every store listed above. Safe to call at any time and more
 * than once; a blocked store is skipped, not thrown.
 */
export async function wipeDeviceStores(): Promise<void> {
  clearBootRecord();
  for (const [read, prefixes] of [
    [() => window.localStorage, WIPED_LOCAL_STORAGE_PREFIXES],
    [() => window.sessionStorage, WIPED_SESSION_STORAGE_PREFIXES],
  ] as const) {
    try {
      removeByPrefix(read(), prefixes);
    } catch {
      // Storage can be blocked; there is nothing to wipe in it.
    }
  }
  await clearPersistedQueryCache();
}
