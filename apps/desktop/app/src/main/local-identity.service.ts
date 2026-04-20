import { randomUUID } from 'node:crypto';
import type { DesktopDatabaseService } from './database.service';

/**
 * Manages the stable local identity for this desktop installation.
 *
 * KV keys — permanent, never rename:
 *   local.user.id          — stable UUID set on first boot, never changes
 *   local.user.clerkId     — Clerk user ID persisted after first cloud sign-in,
 *                            survives sign-out and token expiry
 *   onboarding.completed   — '1' once the onboarding wizard is dismissed
 *   sync.threads.cursor    — ISO timestamp cursor for bidirectional thread sync
 *
 * Values are cached in memory after initialize() so callers can read them
 * synchronously while persistence stays async on the PGlite layer.
 */
const LOCAL_USER_ID_KEY = 'local.user.id';
const LOCAL_CLERK_ID_KEY = 'local.user.clerkId';
const ONBOARDING_COMPLETED_KEY = 'onboarding.completed';
const SYNC_THREADS_CURSOR_KEY = 'sync.threads.cursor';

export class LocalIdentityService {
  private clerkId: string | null = null;
  private localUserId: string | null = null;
  private onboardingCompleted = false;
  private syncCursor: string | null = null;

  constructor(private readonly database: DesktopDatabaseService) {}

  async initialize(): Promise<void> {
    const [
      storedLocalUserId,
      storedClerkId,
      storedOnboardingCompleted,
      storedSyncCursor,
    ] = await Promise.all([
      this.database.getValue(LOCAL_USER_ID_KEY),
      this.database.getValue(LOCAL_CLERK_ID_KEY),
      this.database.getValue(ONBOARDING_COMPLETED_KEY),
      this.database.getValue(SYNC_THREADS_CURSOR_KEY),
    ]);

    this.localUserId = storedLocalUserId ?? randomUUID();
    this.clerkId = storedClerkId ?? null;
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

  getClerkId(): string | null {
    return this.clerkId;
  }

  async setClerkId(clerkId: string): Promise<void> {
    this.clerkId = clerkId;
    await this.database.setValue(LOCAL_CLERK_ID_KEY, clerkId);
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
