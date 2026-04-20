import { randomUUID } from 'node:crypto';
import type { CloudDatabaseService } from './cloud-database.service';

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
 * All methods are synchronous (better-sqlite3 is sync).
 */
const LOCAL_USER_ID_KEY = 'local.user.id';
const LOCAL_CLERK_ID_KEY = 'local.user.clerkId';
const ONBOARDING_COMPLETED_KEY = 'onboarding.completed';
const SYNC_THREADS_CURSOR_KEY = 'sync.threads.cursor';

export class LocalIdentityService {
  constructor(private readonly database: CloudDatabaseService) {}

  getLocalUserId(): string {
    const stored = this.database.getValue(LOCAL_USER_ID_KEY);

    if (stored) {
      return stored;
    }

    const id = randomUUID();
    this.database.setValue(LOCAL_USER_ID_KEY, id);
    return id;
  }

  getClerkId(): string | null {
    return this.database.getValue(LOCAL_CLERK_ID_KEY) ?? null;
  }

  setClerkId(clerkId: string): void {
    this.database.setValue(LOCAL_CLERK_ID_KEY, clerkId);
  }

  getOnboardingCompleted(): boolean {
    return this.database.getValue(ONBOARDING_COMPLETED_KEY) === '1';
  }

  setOnboardingCompleted(): void {
    this.database.setValue(ONBOARDING_COMPLETED_KEY, '1');
  }

  getSyncCursor(): string | null {
    return this.database.getValue(SYNC_THREADS_CURSOR_KEY) ?? null;
  }

  setSyncCursor(cursor: string): void {
    this.database.setValue(SYNC_THREADS_CURSOR_KEY, cursor);
  }
}
