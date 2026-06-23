import { randomUUID } from 'node:crypto';
import type { DesktopKvService } from './kv.service';

/**
 * Manages the stable local identity for this desktop installation.
 *
 * KV keys — permanent, never rename:
 *   local.user.id          — stable UUID set on first boot, never changes
 *   local.user.betterAuthId     — Better Auth user ID persisted after first cloud sign-in,
 *                            survives sign-out and token expiry
 *   onboarding.completed   — '1' once the onboarding wizard is dismissed
 *   sync.threads.cursor    — ISO timestamp cursor for bidirectional thread sync
 *
 * Values are cached in memory after initialize() so callers can read them
 * synchronously while persistence stays async on the PGlite layer.
 */
const LOCAL_USER_ID_KEY = 'local.user.id';
const LOCAL_BETTER_AUTH_ID_KEY = 'local.user.betterAuthId';
const LEGACY_LOCAL_AUTH_ID_KEY = ['local.user.', 'auth', 'ProviderId'].join('');
const ONBOARDING_COMPLETED_KEY = 'onboarding.completed';
const SYNC_THREADS_CURSOR_KEY = 'sync.threads.cursor';

export class LocalIdentityService {
  private betterAuthId: string | null = null;
  private localUserId: string | null = null;
  private onboardingCompleted = false;
  private syncCursor: string | null = null;

  constructor(private readonly database: DesktopKvService) {}

  async initialize(): Promise<void> {
    const [
      storedLocalUserId,
      storedBetterAuthId,
      storedLegacyAuthId,
      storedOnboardingCompleted,
      storedSyncCursor,
    ] = await Promise.all([
      this.database.getValue(LOCAL_USER_ID_KEY),
      this.database.getValue(LOCAL_BETTER_AUTH_ID_KEY),
      this.database.getValue(LEGACY_LOCAL_AUTH_ID_KEY),
      this.database.getValue(ONBOARDING_COMPLETED_KEY),
      this.database.getValue(SYNC_THREADS_CURSOR_KEY),
    ]);

    this.localUserId = storedLocalUserId ?? randomUUID();
    this.betterAuthId = storedBetterAuthId ?? storedLegacyAuthId ?? null;
    this.onboardingCompleted = storedOnboardingCompleted === '1';
    this.syncCursor = storedSyncCursor ?? null;

    if (!storedLocalUserId) {
      await this.database.setValue(LOCAL_USER_ID_KEY, this.localUserId);
    }
  }

  getLocalUserId(): string {
    if (!this.localUserId) {
      throw new Error('Local identity service not initialized');
    }

    return this.localUserId;
  }

  getBetterAuthId(): string | null {
    return this.betterAuthId;
  }

  async setBetterAuthId(betterAuthId: string): Promise<void> {
    this.betterAuthId = betterAuthId;
    await this.database.setValue(LOCAL_BETTER_AUTH_ID_KEY, betterAuthId);
  }

  getOnboardingCompleted(): boolean {
    return this.onboardingCompleted;
  }

  async setOnboardingCompleted(): Promise<void> {
    this.onboardingCompleted = true;
    await this.database.setValue(ONBOARDING_COMPLETED_KEY, '1');
  }

  getSyncCursor(): string | null {
    return this.syncCursor;
  }

  async setSyncCursor(cursor: string): Promise<void> {
    this.syncCursor = cursor;
    await this.database.setValue(SYNC_THREADS_CURSOR_KEY, cursor);
  }
}
