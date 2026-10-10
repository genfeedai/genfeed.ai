import type { ImageGenerationContext } from '@api/collections/images/services/image-generation.types';
import {
  resolveImageGenerationCompletion,
  throwImageGatewayTimeoutIfPending,
} from '@api/collections/images/services/image-generation-completion.util';
import type { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function fixture(id = 'owned-image') {
  const rows = [
    {
      id: 'owned-image',
      isDeleted: false,
      organizationId: 'organization-a',
      status: 'processing',
    },
    {
      id: 'foreign-image',
      isDeleted: false,
      organizationId: 'organization-b',
      status: 'foreign-private-status',
    },
    {
      id: 'deleted-image',
      isDeleted: true,
      organizationId: 'organization-a',
      status: 'deleted-private-status',
    },
  ];
  // BaseService excludes deleted rows even when the caller omits that filter.
  // An omitted organization filter, however, leaves foreign rows readable.
  const findOne = vi.fn(async (query: Record<string, unknown>) => {
    return (
      rows.find(
        (row) =>
          row.id === query.id &&
          !row.isDeleted &&
          (query.organizationId === undefined ||
            row.organizationId === query.organizationId),
      ) ?? null
    );
  });
  const imagesService = { findOne } as unknown as ImagesService;
  const ingredientCompletionService = {
    waitForIngredientCompletion: vi.fn(),
    waitForMultipleIngredientsCompletion: vi.fn(),
  } as unknown as IngredientCompletionService;
  const context = {
    ingredientData: { id },
    user: { organizationId: 'organization-a' },
  } as unknown as ImageGenerationContext;
  return { context, findOne, imagesService, ingredientCompletionService, rows };
}

describe('image completion tenant isolation', () => {
  it('returns the authenticated organization image on inline completion', async () => {
    const f = fixture();
    await expect(
      resolveImageGenerationCompletion(
        f.imagesService,
        f.ingredientCompletionService,
        f.context,
        { generationPromise: Promise.resolve(), kind: 'inline' },
      ),
    ).resolves.toEqual(f.rows[0]);
    expect(f.findOne).toHaveBeenCalledWith(
      {
        id: 'owned-image',
        isDeleted: false,
        organizationId: 'organization-a',
      },
      expect.any(Array),
    );
  });

  it.each(['foreign-image', 'deleted-image'])(
    'does not return %s on inline completion',
    async (id) => {
      const f = fixture(id);
      await expect(
        resolveImageGenerationCompletion(
          f.imagesService,
          f.ingredientCompletionService,
          f.context,
          { generationPromise: Promise.resolve(), kind: 'inline' },
        ),
      ).resolves.toBeNull();
    },
  );

  it('preserves the owned-image 504 status response after polling times out', async () => {
    const f = fixture();
    await expect(
      throwImageGatewayTimeoutIfPending(
        f.imagesService,
        new PollTimeoutException('poll expired', 180_000),
        f.context,
      ),
    ).rejects.toMatchObject({
      response: {
        detail:
          'Image generation did not complete within 3 minutes. Current status: processing',
        title: 'Generation timeout',
      },
      status: HttpStatus.GATEWAY_TIMEOUT,
    });
  });

  it.each(['foreign-image', 'deleted-image', 'missing-image'])(
    'does not expose %s status in a timeout response',
    async (id) => {
      const f = fixture(id);
      await expect(
        throwImageGatewayTimeoutIfPending(
          f.imagesService,
          new PollTimeoutException('poll expired', 180_000),
          f.context,
        ),
      ).resolves.toBeUndefined();
    },
  );

  it('does not read an image for errors other than a polling timeout', async () => {
    const f = fixture();
    await expect(
      throwImageGatewayTimeoutIfPending(
        f.imagesService,
        new Error('provider rejected the request'),
        f.context,
      ),
    ).resolves.toBeUndefined();
    expect(f.findOne).not.toHaveBeenCalled();
  });
});
