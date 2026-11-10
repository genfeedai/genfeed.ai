import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCommunityController } from '@api/endpoints/admin/community/community.controller';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

const orgId = '0193c3a1-6f2e-7c4b-9d1a-2b3c4d5e6f71';
const validId = '0193c3a1-6f2e-7c4b-9d1a-2b3c4d5e6f70';

function createController() {
  const service = {
    getOverview: async (_organizationId: string, page: number) => ({
      creators: [],
      media: [],
      mediaTotal: page,
    }),
    setCreatorFeatured: async (
      _organizationId: string,
      id: string,
      isFeatured: boolean,
    ) => ({ id, isFeatured }),
    setMediaFeatured: async (
      _organizationId: string,
      id: string,
      isFeatured: boolean,
    ) => ({ id, isFeatured }),
    unpublishCreator: async (_organizationId: string, id: string) => ({ id }),
    unpublishMedia: async (_organizationId: string, id: string) => ({ id }),
  };
  return new AdminCommunityController(service as never);
}

describe('AdminCommunityController', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminCommunityController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it.each([
    [undefined, 1],
    ['3', 3],
    ['0', 1],
    ['-2', 1],
    ['abc', 1],
  ])('reads page %s as page %i', async (page, expected) => {
    await expect(
      createController().overview(orgId, page),
    ).resolves.toMatchObject({ data: { mediaTotal: expected } });
  });

  it('features, unfeatures and unpublishes media and creators by id', async () => {
    const controller = createController();

    await expect(controller.featureMedia(orgId, validId)).resolves.toEqual({
      data: { id: validId, isFeatured: true },
    });
    await expect(controller.unfeatureMedia(orgId, validId)).resolves.toEqual({
      data: { id: validId, isFeatured: false },
    });
    await expect(controller.unpublishMedia(orgId, validId)).resolves.toEqual({
      data: { id: validId },
    });
    await expect(controller.featureCreator(orgId, validId)).resolves.toEqual({
      data: { id: validId, isFeatured: true },
    });
    await expect(controller.unfeatureCreator(orgId, validId)).resolves.toEqual({
      data: { id: validId, isFeatured: false },
    });
    await expect(controller.unpublishCreator(orgId, validId)).resolves.toEqual({
      data: { id: validId },
    });
  });

  it.each([
    ['organization', 'not-an-id', validId],
    ['media', orgId, 'not-an-id'],
  ])('rejects an invalid %s id before any write', async (_label, org, id) => {
    const controller = createController();
    await expect(controller.featureMedia(org, id)).rejects.toThrow(
      'Invalid identifier',
    );
    await expect(controller.unpublishCreator(org, id)).rejects.toThrow(
      'Invalid identifier',
    );
  });

  it('rejects an invalid organization id on the overview', async () => {
    await expect(createController().overview('nope')).rejects.toThrow(
      'Invalid identifier',
    );
  });
});
