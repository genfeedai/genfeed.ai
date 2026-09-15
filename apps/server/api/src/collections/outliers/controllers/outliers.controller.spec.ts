import 'reflect-metadata';
import { OutliersController } from '@api/collections/outliers/controllers/outliers.controller';
import {
  OutlierAccountDto,
  OutlierPaginationDto,
} from '@api/collections/outliers/dto/outlier-query.dto';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { MemberRole } from '@genfeedai/contracts';
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
  it('requires account and brand identity', async () =>
    expect((await validate(new OutlierAccountDto())).length).toBe(3));
  it.each(['refresh', 'patchConfiguration'] as const)(
    'restricts %s to owner/admin',
    (method) =>
      expect(
        Reflect.getMetadata(ROLES_KEY, OutliersController.prototype[method]),
      ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]),
  );
});
