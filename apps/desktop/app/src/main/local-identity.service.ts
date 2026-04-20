import { randomUUID } from 'node:crypto';
import type { CloudDatabaseService } from './cloud-database.service';

/**
 * Manages the stable local identity for this desktop installation.
 *
 * Two KV keys — permanent, never rename:
 *   local.user.id      — stable UUID set on first boot, never changes
 *   local.user.clerkId — Clerk user ID persisted after first cloud sign-in,
 *                        survives sign-out and token expiry
 *
 * All methods are synchronous (better-sqlite3 is sync).
 */
const LOCAL_USER_ID_KEY = 'local.user.id';
const LOCAL_CLERK_ID_KEY = 'local.user.clerkId';

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
}
