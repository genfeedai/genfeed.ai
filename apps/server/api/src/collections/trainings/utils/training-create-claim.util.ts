import { createHash, randomUUID } from 'node:crypto';
import type { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import type { CacheService } from '@api/services/cache/cache.service';
import { traced } from '@libs/tracing/traced';
import { BadRequestException, ConflictException } from '@nestjs/common';

/** A request still creating its training holds the claim this long. */
const CLAIM_TTL_SECONDS = 300;
/** A finished request answers a replay of the same key for this long. */
const RESULT_TTL_SECONDS = 3600;
const MAX_KEY_LENGTH = 200;

export type TrainingCreateClaim =
  | {
      outcome: 'proceed';
      /** Records the created training so a replay can return it. */
      commit: (trainingId: string) => Promise<void>;
      /** Gives the key back after a failure so the caller can retry it. */
      abandon: () => Promise<void>;
    }
  | { outcome: 'replay'; trainingId: string };

interface TrainingCreateIdentity {
  organizationId?: string;
  userId?: string;
}

/**
 * The key is bound to the request body: the same key with different sources,
 * label or steps is a different training, not a replay of the first one.
 */
function fingerprintTrainingRequest(dto: CreateTrainingDto): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        category: dto.category ?? null,
        description: dto.description ?? null,
        label: dto.label ?? null,
        model: dto.model ?? null,
        provider: dto.provider ?? null,
        seed: dto.seed ?? null,
        sources: [...(dto.sources ?? [])].sort(),
        steps: dto.steps ?? null,
        trigger: dto.trigger ?? null,
      }),
    )
    .digest('hex');
}

export function readTrainingIdempotencyKey(
  header: string | undefined,
): string | undefined {
  const key = header?.trim();
  if (!key) return undefined;
  if (key.length > MAX_KEY_LENGTH) {
    throw new BadRequestException(
      `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters.`,
    );
  }
  return key;
}

const noop = async (): Promise<void> => undefined;

/**
 * Makes `POST /trainings` safe to retry. A request that times out after the
 * training was created, or a double click, would otherwise start a second
 * training and charge a second time.
 *
 * - First request with a key: `proceed`; it records the training it creates.
 * - Later request with the same key and body: `replay` of that training.
 * - A request that arrives while the first is still creating: 409, so the
 *   caller retries and gets the replay instead of a second training.
 * - Redis down: `proceed` without a claim. A duplicate is possible then, but a
 *   user is never blocked from training because the cache is unreachable.
 */
export const claimTrainingCreate = traced(
  'claimTrainingCreate',
  async (
    cacheService: CacheService,
    identity: TrainingCreateIdentity,
    dto: CreateTrainingDto,
    idempotencyKey: string,
  ): Promise<TrainingCreateClaim> => {
    const claimKey = `training-create:${identity.organizationId}:${identity.userId}:${createHash(
      'sha256',
    )
      .update(`${idempotencyKey}:${fingerprintTrainingRequest(dto)}`)
      .digest('hex')}`;
    const resultKey = `${claimKey}:result`;

    const finished = await cacheService.get<string>(resultKey);
    if (finished) {
      return { outcome: 'replay', trainingId: finished };
    }

    const token = randomUUID();
    const claim = await cacheService.acquireOwnedClaim(
      claimKey,
      token,
      CLAIM_TTL_SECONDS,
    );

    if (claim === 'unavailable') {
      return { abandon: noop, commit: noop, outcome: 'proceed' };
    }

    if (claim === 'duplicate') {
      // The first request may have finished between the two reads.
      const settled = await cacheService.get<string>(resultKey);
      if (settled) {
        return { outcome: 'replay', trainingId: settled };
      }
      throw new ConflictException(
        'This training is already being created. Retry in a moment.',
      );
    }

    return {
      abandon: async () => {
        await cacheService.releaseOwnedClaim(claimKey, token);
      },
      commit: async (trainingId) => {
        await cacheService.setOwnedClaimValue(
          claimKey,
          token,
          resultKey,
          trainingId,
          RESULT_TTL_SECONDS,
        );
      },
      outcome: 'proceed',
    };
  },
);
