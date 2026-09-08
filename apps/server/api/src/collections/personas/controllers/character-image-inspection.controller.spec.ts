import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CharacterImageInspectionController } from '@api/collections/personas/controllers/character-image-inspection.controller';
import { CharacterImageInspectionService } from '@api/collections/personas/services/character-image-inspection.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

describe('CharacterImageInspectionController', () => {
  const inspection = { inspect: vi.fn() };
  const user: AuthenticatedUser = {
    id: 'user-1',
    userId: 'user-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
  };
  const request = {
    originalUrl: '/personas/inspect-image',
  } as RequestWithContext;
  let controller: CharacterImageInspectionController;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CharacterImageInspectionController],
      providers: [
        { provide: CharacterImageInspectionService, useValue: inspection },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(CharacterImageInspectionController);
  });

  it('uses authenticated scope and serializes detection and saved-character fields', async () => {
    inspection.inspect.mockResolvedValue({
      id: 'image-1',
      hasFace: null,
      isCharacter: null,
      characterId: 'character-1',
      handle: 'anna',
      label: 'Anna',
    });
    const response = await controller.inspect(request, user, {
      assetId: 'image-1',
    });
    expect(inspection.inspect).toHaveBeenCalledWith(
      'image-1',
      'org-1',
      'brand-1',
    );
    expect(response).toMatchObject({
      data: {
        id: 'image-1',
        type: 'character-image-inspection',
        attributes: {
          hasFace: null,
          isCharacter: null,
          characterId: 'character-1',
          handle: 'anna',
          label: 'Anna',
        },
      },
    });
  });

  it.each(['organizationId', 'brandId'])(
    'rejects missing %s before inspection',
    async (field) => {
      await expect(
        controller.inspect(
          request,
          { ...user, [field]: '' },
          { assetId: 'image-1' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(inspection.inspect).not.toHaveBeenCalled();
    },
  );
});
