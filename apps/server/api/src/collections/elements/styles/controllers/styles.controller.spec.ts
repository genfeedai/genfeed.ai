import { ElementsStylesController } from '@api/collections/elements/styles/controllers/styles.controller';
import { CreateElementStyleDto } from '@api/collections/elements/styles/dto/create-style.dto';
import { UpdateElementStyleDto } from '@api/collections/elements/styles/dto/update-style.dto';
import { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  getDeserializer: vi.fn((dto) => Promise.resolve(dto)),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

describe('ElementsStylesController', () => {
  let controller: ElementsStylesController;

  const mockUser: User = {
    publicMetadata: {
      isSuperAdmin: true,
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockStyle = {
    _id: '507f1f77bcf86cd799439014',
    createdAt: new Date(),
    description: 'Modern video style',
    isDeleted: false,
    label: 'Modern Style',
    settings: {},
    updatedAt: new Date(),
    user: '507f1f77bcf86cd799439011',
  };

  const mockElementsStylesService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsStylesController],
      providers: [
        {
          provide: ElementsStylesService,
          useValue: mockElementsStylesService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ElementsStylesController>(ElementsStylesController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with organization filter', () => {
      const query = {};
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toBeDefined();
      expect(Array.isArray(pipeline)).toBe(true);
    });

    it('should load defaults when no organization', () => {
      const userWithoutOrg: User = {
        publicMetadata: {
          user: '507f1f77bcf86cd799439011',
        },
      } as unknown as User;

      const query = {};
      const pipeline = controller.buildFindAllPipeline(userWithoutOrg, query);

      expect(pipeline).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a style', async () => {
      const createDto: CreateElementStyleDto = {
        description: 'Modern video style',
        label: 'Modern Style',
      };

      const request = {} as Request;
      mockElementsStylesService.create.mockResolvedValue(mockStyle);

      const result = await controller.create(request, mockUser, createDto);

      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a style', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdateElementStyleDto = {
        label: 'Updated Style',
      };

      const request = {} as Request;
      const updatedStyle = { ...mockStyle, ...updateDto };
      mockElementsStylesService.findOne.mockResolvedValue(mockStyle);
      mockElementsStylesService.patch.mockResolvedValue(updatedStyle);

      const result = await controller.update(request, mockUser, id, updateDto);

      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a style', async () => {
      const id = '507f1f77bcf86cd799439014';
      const request = {} as Request;

      mockElementsStylesService.findOne.mockResolvedValue(mockStyle);
      mockElementsStylesService.remove.mockResolvedValue(mockStyle);

      const result = await controller.remove(request, mockUser, id);

      expect(result).toBeDefined();
    });
  });
});
