import { randomUUID } from 'node:crypto';
import { CacheService } from '@api/services/cache/cache.service';
import type {
  AgentStudioHandoffPayload,
  AgentStudioHandoffScope,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const CACHE_NAMESPACE = 'agent-studio-handoff';
/** Long enough to read a review/result card and click through; short enough
 * to bound growth and cap how long a leaked id stays live. */
const TTL_SECONDS = 10 * 60;

type StoredAgentStudioHandoff = AgentStudioHandoffScope &
  AgentStudioHandoffPayload & { createdAt: string };

/**
 * #4670 Agent → Studio handoff. Server-side, organization-scoped, short-lived
 * (Redis-backed via the shared `CacheService`, not a Prisma table — nothing
 * here needs to outlive the TTL). `create` never trusts a client-supplied
 * `organizationId`/`userId`; the caller passes the scope resolved from the
 * authenticated request. `consume` is single-use: a handoff is deleted the
 * first time it is read, whether or not the scope matched, so a foreign
 * probe can never be retried into a hit.
 */
@Injectable()
export class AgentStudioHandoffService {
  constructor(private readonly cacheService: CacheService) {}

  async create(
    scope: AgentStudioHandoffScope,
    payload: AgentStudioHandoffPayload,
  ): Promise<string> {
    const id = randomUUID();
    const record: StoredAgentStudioHandoff = {
      ...scope,
      ...payload,
      createdAt: new Date().toISOString(),
    };
    await this.cacheService.set(this.buildKey(id), record, {
      ttl: TTL_SECONDS,
    });
    return id;
  }

  /**
   * Returns the payload once for the matching organization and user, then
   * deletes the record. Returns `null` for a missing, expired, already-
   * consumed, or foreign (wrong org/user) handoff — the caller (Studio
   * generate) treats all four the same way: open with defaults and a notice.
   */
  async consume(
    id: string,
    scope: AgentStudioHandoffScope,
  ): Promise<AgentStudioHandoffPayload | null> {
    const key = this.buildKey(id);
    const record = await this.cacheService.get<StoredAgentStudioHandoff>(key);
    if (!record) {
      return null;
    }
    // Consume on first read regardless of scope match — a foreign read must
    // burn the handoff too, or an attacker could keep probing organizationId/
    // userId guesses against the same still-live id.
    await this.cacheService.del(key);

    if (
      record.organizationId !== scope.organizationId ||
      record.userId !== scope.userId
    ) {
      return null;
    }

    const {
      organizationId: _organizationId,
      userId: _userId,
      createdAt: _createdAt,
      ...payload
    } = record;
    return payload;
  }

  private buildKey(id: string): string {
    return this.cacheService.generateKey(CACHE_NAMESPACE, id);
  }
}
