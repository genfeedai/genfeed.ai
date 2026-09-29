import { createMediaUrlExtension } from '@libs/prisma/media-url.extension';
import { describe, expect, it, vi } from 'vitest';

const extension = createMediaUrlExtension({ cdnUrl: 'https://cdn.genfeed.ai' });
const compute = extension.result.ingredient.cdnUrl.compute;
const allOperations = extension.query.ingredient.$allOperations;

async function forwardedArgs(operation: string, args: unknown) {
  const query = vi.fn(async (next: unknown) => next);
  await allOperations({ args, operation, query });
  return query.mock.calls[0]?.[0];
}

describe('createMediaUrlExtension', () => {
  describe('computed cdnUrl', () => {
    it('derives the URL from the row’s own key', () => {
      expect(compute({ s3Key: 'ingredients/images/a.png' })).toBe(
        'https://cdn.genfeed.ai/ingredients/images/a.png',
      );
    });
  });

  describe('write guard', () => {
    it('strips cdnUrl from create and update data', async () => {
      await expect(
        forwardedArgs('create', {
          data: { cdnUrl: 'https://x/y', label: 'a', s3Key: 'k' },
        }),
      ).resolves.toEqual({ data: { label: 'a', s3Key: 'k' } });

      await expect(
        forwardedArgs('update', {
          data: { cdnUrl: 'https://x/y', status: 'GENERATED' },
          where: { id: 'i1' },
        }),
      ).resolves.toEqual({
        data: { status: 'GENERATED' },
        where: { id: 'i1' },
      });
    });
  });
});
