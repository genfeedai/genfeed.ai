import 'reflect-metadata';
import { OutliersController } from '@api/collections/outliers/controllers/outliers.controller';
import {
  OutlierAccountDto,
  OutlierPaginationDto,
  OutlierRankedQueryDto,
} from '@api/collections/outliers/dto/outlier-query.dto';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { MemberRole } from '@genfeedai/contracts';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('outlier HTTP contracts', () => {
  it.each([{ page: 0 }, { limit: 101 }, { page: 1.5 }, { limit: 'nope' }])(
    'rejects invalid pagination %j',
    async (input) =>
      expect(
        (await validate(plainToInstance(OutlierPaginationDto, input))).length,
      ).toBeGreaterThan(0),
  );
  it('transforms string pagination through the endpoint validation pipe', async () => {
    const query = await new ValidationPipe({ transform: true }).transform(
      { page: '2', limit: '10' },
      { type: 'query', metatype: OutlierPaginationDto },
    );
    expect(query).toMatchObject({ page: 2, limit: 10 });
    await expect(
      new ValidationPipe({ transform: true }).transform(
        { limit: 'nope' },
        { type: 'query', metatype: OutlierPaginationDto },
      ),
    ).rejects.toThrow();
  });
  it('requires account and brand identity', async () =>
    expect((await validate(new OutlierAccountDto())).length).toBe(3));
  it('accepts optional ranked-list filters', async () => {
    const query = await new ValidationPipe({ transform: true }).transform(
      { brandId: 'brand', tier: 'breakout', windowSize: '10' },
      { type: 'query', metatype: OutlierRankedQueryDto },
    );
    expect(query).toMatchObject({
      brandId: 'brand',
      tier: 'breakout',
      windowSize: 10,
    });
  });
  it('rejects invalid ranked-list tiers', async () =>
    expect(
      (
        await validate(
          plainToInstance(OutlierRankedQueryDto, { tier: 'winner' }),
        )
      ).length,
    ).toBeGreaterThan(0));
  it.each(['refresh', 'patchConfiguration'] as const)(
    'restricts %s to owner/admin',
    (method) =>
      expect(
        Reflect.getMetadata(ROLES_KEY, OutliersController.prototype[method]),
      ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]),
  );
});
