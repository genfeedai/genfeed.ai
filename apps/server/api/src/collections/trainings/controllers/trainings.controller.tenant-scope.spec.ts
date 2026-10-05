import { TrainingsController } from '@api/collections/trainings/controllers/trainings.controller';
import {
  adminUser,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';

describe('Training list tenant reads (#6176)', () => {
  const controller = Object.create(
    TrainingsController.prototype,
  ) as TrainingsController;
  it('keeps the admin organization filter trimmed', () => {
    expect(
      controller.buildFindAllQuery(adminUser, {
        organizationId: ` ${targetOrganizationId} `,
      }).where,
    ).toEqual({ organizationId: targetOrganizationId, isDeleted: false });
  });
  it('rejects a member foreign organization', () => {
    expect(() =>
      controller.buildFindAllQuery(memberUser, {
        organizationId: targetOrganizationId,
      }),
    ).toThrow(ForbiddenException);
  });
  it('preserves existing member ownership and brand clauses', () => {
    expect(controller.buildFindAllQuery(memberUser, {}).where).toEqual({
      isDeleted: false,
      OR: [
        { userId: memberUser.userId },
        { brandId: sessionBrandId },
        { brandId: null, organizationId: sessionOrganizationId },
      ],
    });
  });
});
