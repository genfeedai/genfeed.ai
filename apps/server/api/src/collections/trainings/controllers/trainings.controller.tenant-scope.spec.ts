import { TrainingsController } from '@api/collections/trainings/controllers/trainings.controller';
import { TrainingsQueryDto } from '@api/collections/trainings/dto/trainings-query.dto';
import {
  adminUser,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadQuery,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';

describe('Training list tenant reads (#6176)', () => {
  const controller = Object.create(
    TrainingsController.prototype,
  ) as TrainingsController;
  it('keeps the admin organization filter trimmed', () => {
    expect(
      controller.buildFindAllQuery(
        adminUser,
        tenantReadQuery(TrainingsQueryDto, {
          organizationId: ` ${targetOrganizationId} `,
        }),
      ).where,
    ).toEqual({ organizationId: targetOrganizationId, isDeleted: false });
  });
  it('rejects a member foreign organization', () => {
    expect(() =>
      controller.buildFindAllQuery(
        memberUser,
        tenantReadQuery(TrainingsQueryDto, {
          organizationId: targetOrganizationId,
        }),
      ),
    ).toThrow(ForbiddenException);
  });
  it('preserves existing member ownership and brand clauses', () => {
    expect(
      controller.buildFindAllQuery(
        memberUser,
        tenantReadQuery(TrainingsQueryDto, {}),
      ).where,
    ).toEqual({
      isDeleted: false,
      OR: [
        { userId: memberUser.userId },
        { brandId: sessionBrandId },
        { brandId: null, organizationId: sessionOrganizationId },
      ],
    });
  });
});
