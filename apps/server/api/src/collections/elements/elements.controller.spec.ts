import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsController } from '@api/collections/elements/elements.controller';
import { ElementsService } from '@api/collections/elements/elements.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ElementsController', () => {
  let controller: ElementsController;
  let elementsService: vi.Mocked<ElementsService>;

  const sharedUserId = testId('user');

  const mockUser = {
    id: 'user-123',
    brandId: sharedUserId,
    isSuperAdmin: false,
    organizationId: sharedUserId,
    userId: sharedUserId,
  } as unknown as User;

  const mockElements = {
    blacklists: [{ _id: '1', label: 'Blacklist 1' }],
    cameraMovements: [{ _id: '1', label: 'Movement 1' }],
    cameras: [
      { _id: '1', label: 'Camera 1' },
      { _id: '2', label: 'Camera 2' },
    ],
    lenses: [{ _id: '1', label: 'Lens 1' }],
    lightings: [{ _id: '1', label: 'Lighting 1' }],
    moods: [
      { _id: '1', label: 'Mood 1' },
      { _id: '2', label: 'Mood 2' },
    ],
    scenes: [{ _id: '1', label: 'Scene 1' }],
    sounds: [{ _id: '1', label: 'Sound 1' }],
    styles: [{ _id: '1', label: 'Style 1' }],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsController],
      providers: [
        {
          provide: ElementsService,
          useValue: {
            findAllElements: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ElementsController>(ElementsController);
    elementsService = module.get(ElementsService);
  });

  const mockReq = { originalUrl: '/elements' } as unknown as Request;

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findAllElements', () => {
    it('should return all elements for user organization', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(elementsService.findAllElements).toHaveBeenCalledWith(
        mockUser.organizationId,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      elementsService.findAllElements.mockRejectedValue(error);

      await expect(
        controller.findAllElements(mockReq, mockUser),
      ).rejects.toThrow(error);
    });
  });
});
