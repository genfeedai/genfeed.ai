import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import {
  adminUser,
  memberUser,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { BadRequestException } from '@nestjs/common';

describe('Trend idea generation organization (#6176)', () => {
  it.each([memberUser, adminUser])(
    'rejects a foreign organization for either role',
    async (user) => {
      const read = vi.fn();
      const charge = vi.fn();
      const controller = Object.create(
        TrendsController.prototype,
      ) as TrendsController;
      Object.assign(controller, {
        brandsService: { findOne: read },
        creditsUtilsService: { getBalance: charge },
      });
      await expect(
        controller.getTrendIdeas(tenantReadRequest(user), user, {
          organizationId: targetOrganizationId,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Trend ideas are generated in your active organization; switch organizations instead.',
        ),
      );
      expect(read).not.toHaveBeenCalled();
      expect(charge).not.toHaveBeenCalled();
    },
  );
});
