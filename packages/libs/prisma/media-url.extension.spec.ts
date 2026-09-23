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

    it('is null when the row has no key', () => {
      expect(compute({ s3Key: null })).toBeNull();
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

    it('strips it from every row of a createMany', async () => {
      await expect(
        forwardedArgs('createMany', {
          data: [{ cdnUrl: 'a', id: '1' }, { id: '2' }],
        }),
      ).resolves.toEqual({ data: [{ id: '1' }, { id: '2' }] });
    });

    it('strips it from both branches of an upsert', async () => {
      await expect(
        forwardedArgs('upsert', {
          create: { cdnUrl: 'a', id: '1' },
          update: { cdnUrl: 'b', label: 'x' },
          where: { id: '1' },
        }),
      ).resolves.toEqual({
        create: { id: '1' },
        update: { label: 'x' },
        where: { id: '1' },
      });
    });

    it('leaves reads, including a select of the computed field, untouched', async () => {
      const args = { select: { cdnUrl: true, id: true }, where: { id: 'i1' } };
      await expect(forwardedArgs('findFirst', args)).resolves.toEqual(args);
    });
  });
});
