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

  const emptyElements = {
    blacklists: [],
    cameraMovements: [],
    cameras: [],
    lenses: [],
    lightings: [],
    moods: [],
    scenes: [],
    sounds: [],
    styles: [],
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllElements', () => {
    it('serializes every element type for the user organization', async () => {
      elementsService.findAllElements.mockResolvedValue(emptyElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(elementsService.findAllElements).toHaveBeenCalledWith(
        mockUser.organizationId,
      );
      expect(result.data).toMatchObject({
        blacklists: { data: [] },
        cameraMovements: { data: [] },
        cameras: { data: [] },
        lenses: { data: [] },
        lightings: { data: [] },
        moods: { data: [] },
        scenes: { data: [] },
        sounds: { data: [] },
        styles: { data: [] },
      });
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
