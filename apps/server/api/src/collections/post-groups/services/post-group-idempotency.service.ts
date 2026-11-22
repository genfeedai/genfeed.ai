import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { ReleaseStatus } from '@genfeedai/contracts';
import { CONTENT_RELEASE_IDEMPOTENCY_PREFIX } from '@genfeedai/contracts/constants/release-idempotency.constant';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { ConflictException, Injectable } from '@nestjs/common';

/**
 * A content-derived key replays a release made within this window. The MCP
 * client times out after 30 s and agents retry at once, so a retry always falls
 * inside it; a deliberate repeat of the same post later does not.
 */
export const CONTENT_KEY_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/** Keys walked in one call; holes left by deleted groups are far fewer. */
const MAX_KEY_STEPS = 25;

export interface IdempotentCreateResult {
  group: IReleaseGroup;
  /** True when the group was made by an earlier call with the same key. */
  replayed: boolean;
}

/**
 * Makes release creation idempotent on `[organizationId, idempotencyKey]`.
 *
 * - A caller-chosen key (or an approval-id key) replays whatever group holds
 *   it, in any state, with no time limit.
 * - A content-derived key (`CONTENT_RELEASE_IDEMPOTENCY_PREFIX`) replays a group
 *   only while it is live (not cancelled) and younger than
 *   `CONTENT_KEY_DEDUPE_WINDOW_MS`. Otherwise it is a deliberate repeat and
 *   gets a new release.
 *
 * The unique index cannot be reused, so the n-th release of identical content
 * is stored under `<key>` (n = 0) or `<key>:<n>`. The latest release is the
 * only one that can still be fresh, and every earlier one is stale or
 * cancelled. A call therefore counts the live groups under the key prefix, and
 * starts its walk at the last of them instead of at `<key>`; the walk is in
 * order and stops at the first fresh live group (replay) or the first free key
 * (create). The count never exceeds the highest generation, so the walk cannot
 * start past a fresh group, and it stays short however often the same post is
 * repeated, so identical content never runs out of keys.
 *
 * Two concurrent identical calls walk to the same free key; one create wins the
 * unique index and the other re-reads and replays it. A key held by a deleted
 * group (invisible to the read) fails the create the same way, and the walk
 * moves on to the next key.
 */
@Injectable()
@Traced()
export class PostGroupIdempotencyService {
  constructor(
    private readonly persistenceService: PostGroupPersistenceService,
  ) {}

  async run(
    organizationId: string,
    key: string | undefined,
    create: (key: string | undefined) => Promise<IReleaseGroup>,
  ): Promise<IdempotentCreateResult> {
    if (!key) {
      return { group: await create(undefined), replayed: false };
    }

    const now = new Date();
    const derived = key.startsWith(CONTENT_RELEASE_IDEMPOTENCY_PREFIX);
    const start = derived
      ? Math.max(
          0,
          (await this.persistenceService.countByIdempotencyKeyPrefix(
            organizationId,
            key,
          )) - 1,
        )
      : 0;

    for (let step = 0; step < MAX_KEY_STEPS; step++) {
      const generation = start + step;
      const attemptKey = generation === 0 ? key : `${key}:${generation}`;
      const found = await this.findReplayable(
        organizationId,
        attemptKey,
        derived,
        now,
      );
      if (found.state === 'replay') {
        return { group: found.group, replayed: true };
      }
      if (found.state === 'stale') {
        continue;
      }

      try {
        return { group: await create(attemptKey), replayed: false };
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
        const winner = await this.findReplayable(
          organizationId,
          attemptKey,
          derived,
          now,
        );
        if (winner.state === 'replay') {
          return { group: winner.group, replayed: true };
        }
        if (!derived) {
          throw error;
        }
        // The key is held by a stale, cancelled or deleted group: go on.
      }
    }
    throw new ConflictException('Release idempotency key is exhausted');
  }

  private async findReplayable(
    organizationId: string,
    key: string,
    derived: boolean,
    now: Date,
  ): Promise<
    | { state: 'replay'; group: IReleaseGroup }
    | { state: 'stale' }
    | { state: 'free' }
  > {
    const existing = await this.persistenceService.findByIdempotencyKey(
      organizationId,
      key,
    );
    if (!existing) {
      return { state: 'free' };
    }
    if (
      derived &&
      (existing.status === ReleaseStatus.CANCELLED ||
        now.getTime() - new Date(existing.createdAt).getTime() >
          CONTENT_KEY_DEDUPE_WINDOW_MS)
    ) {
      return { state: 'stale' };
    }
    return { group: existing, state: 'replay' };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
