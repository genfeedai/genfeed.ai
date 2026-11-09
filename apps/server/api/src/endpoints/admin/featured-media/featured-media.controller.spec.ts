import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminFeaturedMediaController } from '@api/endpoints/admin/featured-media/featured-media.controller';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

const orgId = '0193c3a1-6f2e-7c4b-9d1a-2b3c4d5e6f71';
const validId = '0193c3a1-6f2e-7c4b-9d1a-2b3c4d5e6f70';

function createController() {
  const service = {
    setFeatured: async (
      _organizationId: string,
      id: string,
      isHighlighted: boolean,
    ) => ({
      id,
      isHighlighted,
    }),
  };
  return new AdminFeaturedMediaController(service as never);
}

describe('AdminFeaturedMediaController', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminFeaturedMediaController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('features and unfeatures media by id', async () => {
    const controller = createController();

    await expect(controller.feature(orgId, validId)).resolves.toEqual({
      data: { id: validId, isHighlighted: true },
    });
    await expect(controller.unfeature(orgId, validId)).resolves.toEqual({
      data: { id: validId, isHighlighted: false },
    });
  });

  it.each([
    ['organization', 'not-an-id', validId],
    ['media', orgId, 'not-an-id'],
  ])('rejects an invalid %s id before any write', async (_label, org, id) => {
    await expect(createController().feature(org, id)).rejects.toThrow(
      'Invalid identifier',
    );
  });
});
