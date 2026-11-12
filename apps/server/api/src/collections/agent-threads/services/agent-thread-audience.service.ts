import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { AgentThreadKind, AgentThreadShareScope } from '@genfeedai/contracts';
import {
  AGENT_CHAT_CHANNEL,
  AGENT_THREAD_ACCESS_REVOKED_EVENT_TYPE,
} from '@genfeedai/contracts/constants';
import type { AgentThreadAccessRevokedEvent } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** The members a thread's live events are delivered to. */
export interface AgentThreadAudience {
  organizationId: string;
  ownerUserId: string;
  /** Every member who passes the thread access check now, the owner included. */
  recipientUserIds: string[];
}

interface CachedAudience {
  audience: AgentThreadAudience;
  resolvedAt: number;
}

/**
 * How long a resolved audience is reused. This is the longest a member who
 * lost brand access or their role keeps receiving a thread's events: removing a
 * share ends delivery at once (`refresh`), but those changes carry no hook.
 */
const AGENT_THREAD_AUDIENCE_TTL_MS = 5_000;
const MAX_CACHED_AUDIENCES = 1_000;
/** Candidates checked at the same time: each check reads membership and role. */
const CHECK_CONCURRENCY = 8;

/**
 * Who receives a shared thread's live events (#9938). The audience is the
 * thread owner plus every member `AgentThreadAccessService` still lets view
 * the thread, so socket delivery and the thread routes can never disagree on
 * who has access. The gateway routes by this list and never decides access.
 *
 * The result is cached for a few seconds because the stream publisher asks on
 * every flushed token batch. A member who drops out of the audience is told
 * through `agent:thread_access_revoked`, so their open stream for the thread
 * ends. Resolution that fails delivers to the owner alone.
 */
@Traced()
@Injectable()
export class AgentThreadAudienceService {
  private readonly constructorName = String(this.constructor.name);
  private readonly cache = new Map<string, CachedAudience>();
  /** Bumped when sharing changes, so a resolution that started before it is not trusted. */
  private sharingEpoch = 0;
  private readonly inFlight = new Map<
    string,
    Promise<AgentThreadAudience | null>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AgentThreadAccessService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly redisService: RedisService,
    private readonly loggerService: LoggerService,
  ) {}

  /** The cached audience while it is fresh, otherwise a fresh resolution. */
  async resolve(threadId: string): Promise<AgentThreadAudience | null> {
    const cached = this.cache.get(threadId);
    if (
      cached &&
      Date.now() - cached.resolvedAt < AGENT_THREAD_AUDIENCE_TTL_MS
    ) {
      return cached.audience;
    }
    return this.refresh(threadId);
  }

  /**
   * Resolves the audience now and tells every member who dropped out of it,
   * compared with `baseline` or, without one, with what this process last
   * resolved. A caller that changes sharing passes the audience it read before
   * the change, since another process may be the one holding the stream. Such a
   * call also drops what is cached at once: until the new audience is known,
   * a caller resolves it afresh instead of getting the one from before the
   * change. Never throws.
   */
  refresh(
    threadId: string,
    baseline?: AgentThreadAudience | null,
  ): Promise<AgentThreadAudience | null> {
    if (baseline !== undefined) {
      this.cache.delete(threadId);
      this.sharingEpoch += 1;
    }
    if (baseline === undefined) {
      const pending = this.inFlight.get(threadId);
      if (pending) {
        return pending;
      }
    }
    const resolution = this.resolveAndAnnounce(threadId, baseline).finally(
      () => {
        if (this.inFlight.get(threadId) === resolution) {
          this.inFlight.delete(threadId);
        }
      },
    );
    this.inFlight.set(threadId, resolution);
    return resolution;
  }

  private async resolveAndAnnounce(
    threadId: string,
    baseline?: AgentThreadAudience | null,
  ): Promise<AgentThreadAudience | null> {
    const previous =
      baseline === undefined ? this.cache.get(threadId)?.audience : baseline;
    let audience: AgentThreadAudience | null;
    try {
      audience = await this.computeCurrent(threadId);
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} failed to resolve the thread audience`,
        {
          error: error instanceof Error ? error.message : String(error),
          threadId,
        },
      );
      // Deliver to the owner alone rather than to a stale list.
      return previous
        ? { ...previous, recipientUserIds: [previous.ownerUserId] }
        : null;
    }

    if (!audience) {
      this.cache.delete(threadId);
      return null;
    }

    this.remember(threadId, audience);
    if (previous && previous.organizationId === audience.organizationId) {
      const stillThere = new Set(audience.recipientUserIds);
      await this.announceRevoked(
        audience.organizationId,
        threadId,
        previous.recipientUserIds.filter((userId) => !stillThere.has(userId)),
      );
    }
    return audience;
  }

  /**
   * Resolves the audience, again when sharing changed while it was being read:
   * a read that began before a removal must not put the removed member back in
   * the cache.
   */
  private async computeCurrent(
    threadId: string,
  ): Promise<AgentThreadAudience | null> {
    let audience: AgentThreadAudience | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const epoch = this.sharingEpoch;
      audience = await this.compute(threadId);
      if (epoch === this.sharingEpoch) {
        break;
      }
    }
    return audience;
  }

  private async compute(threadId: string): Promise<AgentThreadAudience | null> {
    const thread = await this.agentThreadsService.findOneSelect(
      { id: threadId, isDeleted: false },
      { kind: true, organizationId: true, userId: true },
    );
    if (!thread?.organizationId || !thread.userId) {
      return null;
    }
    const organizationId = String(thread.organizationId);
    const ownerUserId = String(thread.userId);
    const owner: AgentThreadAudience = {
      organizationId,
      ownerUserId,
      recipientUserIds: [ownerUserId],
    };
    // A master thread belongs to its owner alone.
    if (thread.kind !== AgentThreadKind.THREAD) {
      return owner;
    }

    // sql-risk-audit: ignore unbounded-read -- One thread in one organization; a thread holds at most one live share per target.
    const shares = await this.prisma.agentThreadShare.findMany({
      select: { scope: true, targetUserId: true },
      where: scopedWhere(organizationId, { threadId }),
    });
    if (shares.length === 0) {
      return owner;
    }

    const candidates = new Set<string>();
    let isOpenToMembers = false;
    for (const share of shares) {
      if (share.scope === AgentThreadShareScope.MEMBER) {
        if (share.targetUserId) {
          candidates.add(share.targetUserId);
        }
      } else {
        isOpenToMembers = true;
      }
    }
    if (isOpenToMembers) {
      // sql-risk-audit: ignore unbounded-read -- Active members of one organization, read once per resolution and cached.
      const members = await this.prisma.member.findMany({
        select: { userId: true },
        where: { isActive: true, isDeleted: false, organizationId },
      });
      for (const member of members) {
        candidates.add(member.userId);
      }
    }
    candidates.delete(ownerUserId);

    const allowed = new Set<string>([ownerUserId]);
    const queue = [...candidates];
    while (queue.length > 0) {
      const batch = queue.splice(0, CHECK_CONCURRENCY);
      const results = await Promise.all(
        batch.map(
          async (userId) =>
            [
              userId,
              await this.access.hasAccess(
                { organizationId, userId },
                threadId,
                'view',
              ),
            ] as const,
        ),
      );
      for (const [userId, hasAccess] of results) {
        if (hasAccess) {
          allowed.add(userId);
        }
      }
    }
    return { organizationId, ownerUserId, recipientUserIds: [...allowed] };
  }

  private remember(threadId: string, audience: AgentThreadAudience): void {
    this.cache.delete(threadId);
    this.cache.set(threadId, { audience, resolvedAt: Date.now() });
    while (this.cache.size > MAX_CACHED_AUDIENCES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.cache.delete(oldest);
    }
  }

  private async announceRevoked(
    organizationId: string,
    threadId: string,
    userIds: string[],
  ): Promise<void> {
    for (const userId of userIds) {
      const data: AgentThreadAccessRevokedEvent = {
        organizationId,
        threadId,
        timestamp: new Date().toISOString(),
        userId,
      };
      try {
        await this.redisService.publish(AGENT_CHAT_CHANNEL, {
          data,
          type: AGENT_THREAD_ACCESS_REVOKED_EVENT_TYPE,
        });
      } catch (error: unknown) {
        this.loggerService.warn(
          `${this.constructorName} failed to publish a thread access revoke`,
          {
            error: error instanceof Error ? error.message : String(error),
            threadId,
          },
        );
      }
    }
  }
}
