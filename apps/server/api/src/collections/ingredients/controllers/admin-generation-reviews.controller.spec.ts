import { AdminGenerationReviewsController } from '@api/collections/ingredients/controllers/admin-generation-reviews.controller';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({ data })),
}));

describe('AdminGenerationReviewsController', () => {
  it('serves the ledger to superadmins on its own path', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminGenerationReviewsController),
    ).toBe('ingredients/admin/generation-reviews');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminGenerationReviewsController.prototype.list,
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminGenerationReviewsController.prototype.list,
      ),
    ).toEqual(['superadmin']);
  });

  it('serializes the page the service returns', async () => {
    const page = { docs: [{ id: 'ing-1' }] };
    const reviews = { list: vi.fn().mockResolvedValue(page) };
    const controller = new AdminGenerationReviewsController(reviews as never);

    await expect(
      controller.list({} as never, { page: 1 } as never),
    ).resolves.toEqual({
      data: page,
    });
    expect(reviews.list).toHaveBeenCalledWith({ page: 1 });
  });
});
