import 'reflect-metadata';
import { OutlierLibraryQueryDto } from '@api/collections/outlier-library/dto/outlier-library-query.dto';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('outlier library list query', () => {
  it('reads string query values into a page, a limit, a platform and a tier', async () => {
    const query = await new ValidationPipe({ transform: true }).transform(
      { limit: '10', page: '2', platform: 'tiktok', tier: 'breakout' },
      { metatype: OutlierLibraryQueryDto, type: 'query' },
    );
    expect(query).toMatchObject({
      limit: 10,
      page: 2,
      platform: 'tiktok',
      tier: 'breakout',
    });
  });

  it.each([
    { platform: 'myspace' },
    { tier: 'winner' },
    { page: 0 },
    { limit: 101 },
  ])('rejects %j', async (input) =>
    expect(
      (await validate(plainToInstance(OutlierLibraryQueryDto, input))).length,
    ).toBeGreaterThan(0),
  );

  it('accepts no filter at all', async () =>
    expect(
      await validate(plainToInstance(OutlierLibraryQueryDto, {})),
    ).toHaveLength(0));
});
