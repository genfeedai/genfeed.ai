import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { ReleaseStatus } from '@genfeedai/contracts';
import { CONTENT_RELEASE_IDEMPOTENCY_PREFIX } from '@genfeedai/contracts/constants/release-idempotency.constant';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';

/** Content-derived keys retry with `:1`, `:2`, ... after a cancelled release. */
const MAX_KEY_GENERATIONS = 25;

export interface IdempotentCreateResult {
  group: IReleaseGroup;
  /** True when the group was made by an earlier call with the same key. */
  replayed: boolean;
}

/**
 * Makes release creation idempotent on `[organizationId, idempotencyKey]`.
 *
 * - A caller-chosen key replays whatever group holds it, in any state.
 * - A content-derived key (`CONTENT_RELEASE_IDEMPOTENCY_PREFIX`) replays only a
 *   group that is not cancelled. The unique index cannot be reused, so after a
 *   cancelled group the next release is made under `<key>:<n>`.
 * - A create that loses a race on the unique index returns the winner.
 */
@Injectable()
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

    const derived = key.startsWith(CONTENT_RELEASE_IDEMPOTENCY_PREFIX);
    for (let generation = 0; generation < MAX_KEY_GENERATIONS; generation++) {
      const attemptKey = generation === 0 ? key : `${key}:${generation}`;
      const existing = await this.findReplayable(
        organizationId,
        attemptKey,
        derived,
      );
      if (existing === 'cancelled') {
        continue;
      }
      if (existing) {
        return { group: existing, replayed: true };
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
        );
        if (winner && winner !== 'cancelled') {
          return { group: winner, replayed: true };
        }
        if (!derived) {
          throw error;
        }
        // The key is held by a cancelled or deleted group: try the next one.
      }
    }
    throw new ConflictException('Release idempotency key is exhausted');
  }

  private async findReplayable(
    organizationId: string,
    key: string,
    derived: boolean,
  ): Promise<IReleaseGroup | 'cancelled' | undefined> {
    const existing = await this.persistenceService.findByIdempotencyKey(
      organizationId,
      key,
    );
    if (existing && derived && existing.status === ReleaseStatus.CANCELLED) {
      return 'cancelled';
    }
    return existing;
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
