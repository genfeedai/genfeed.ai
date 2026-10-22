import { BackfillContextEmbeddingsDto } from '@api/collections/contexts/dto/backfill-context-embeddings.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('explicit bounded context embedding backfill', () => {
  it.each([1, 200])('accepts boundary %s', async (maxEntries) => {
    expect(
      await validate(
        plainToInstance(BackfillContextEmbeddingsDto, {
          maxEntries,
          cursor: 'entry-cursor',
        }),
      ),
    ).toEqual([]);
  });
  it.each([undefined, null, 0, -1, 201, 1.2, '1', Infinity, NaN])(
    'rejects invalid bound %s',
    async (maxEntries) => {
      expect(
        await validate(
          plainToInstance(BackfillContextEmbeddingsDto, { maxEntries }),
        ),
      ).not.toEqual([]);
    },
  );
  it.each([null, '', '   ', 'a'.repeat(201), 1, {}])(
    'rejects malformed cursor %s',
    async (cursor) => {
      expect(
        await validate(
          plainToInstance(BackfillContextEmbeddingsDto, {
            maxEntries: 1,
            cursor,
          }),
        ),
      ).not.toEqual([]);
    },
  );
});
