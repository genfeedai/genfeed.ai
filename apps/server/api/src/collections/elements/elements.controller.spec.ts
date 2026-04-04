import { ElementsController } from '@api/collections/elements/elements.controller';
import { ElementsService } from '@api/collections/elements/elements.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('ElementsController', () => {
  let controller: ElementsController;
  let elementsService: vi.Mocked<ElementsService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      isSuperAdmin: false,
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
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
      .overrideGuard(ClerkGuard)
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
    it('should return all elements for user organization', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(elementsService.findAllElements).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
      );
    });

    it('should return all elements with cameras', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.cameras).toBeDefined();
    });

    it('should return all elements with moods', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.moods).toBeDefined();
    });

    it('should return all elements with scenes', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.scenes).toBeDefined();
    });

    it('should return all elements with styles', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.styles).toBeDefined();
    });

    it('should return all elements with sounds', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.sounds).toBeDefined();
    });

    it('should return all elements with blacklists', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.blacklists).toBeDefined();
    });

    it('should return all elements with lightings', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.lightings).toBeDefined();
    });

    it('should return all elements with lenses', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.lenses).toBeDefined();
    });

    it('should return all elements with camera movements', async () => {
      elementsService.findAllElements.mockResolvedValue(mockElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data.cameraMovements).toBeDefined();
    });

    it('should handle empty results', async () => {
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

      elementsService.findAllElements.mockResolvedValue(emptyElements);

      const result = await controller.findAllElements(mockReq, mockUser);

      expect(result.data).toBeDefined();
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
