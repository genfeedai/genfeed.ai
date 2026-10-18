import { AdminPromptsController } from '@api/collections/prompts/controllers/admin-prompts.controller';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({ data })),
}));

describe('AdminPromptsController', () => {
  it('serves superadmins on a path that cannot shadow GET /prompts/:promptId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminPromptsController)).toBe(
      'prompts/admin/without-generation',
    );
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminPromptsController.prototype.list,
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminPromptsController.prototype.list),
    ).toEqual(['superadmin']);
  });

  it('serializes the page the service returns', async () => {
    const page = { docs: [{ id: 'prompt-1' }] };
    const adminPrompts = { withoutGeneration: vi.fn().mockResolvedValue(page) };
    const controller = new AdminPromptsController(adminPrompts as never);

    await expect(
      controller.list({} as never, { page: 1 } as never),
    ).resolves.toEqual({ data: page });
    expect(adminPrompts.withoutGeneration).toHaveBeenCalledWith({ page: 1 });
  });
});
