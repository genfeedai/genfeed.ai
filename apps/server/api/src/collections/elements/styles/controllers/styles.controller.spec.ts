import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsStylesController } from '@api/collections/elements/styles/controllers/styles.controller';
import { CreateElementStyleDto } from '@api/collections/elements/styles/dto/create-style.dto';
import { UpdateElementStyleDto } from '@api/collections/elements/styles/dto/update-style.dto';
import { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

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
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const organizationId = '550e8400-e29b-41d4-a716-446655440002';
  const styleId = '550e8400-e29b-41d4-a716-446655440003';
  let controller: ElementsStylesController;

  const mockUser: User = {
    isSuperAdmin: true,
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const mockStyle = {
    id: styleId,
    createdAt: new Date(),
    description: 'Modern video style',
    isDeleted: false,
    label: 'Modern Style',
    settings: {},
    updatedAt: new Date(),
    organizationId,
  };

  const mockElementsStylesService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    supportsField: vi.fn((field: string) => field === 'organizationId'),
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

  describe('buildFindAllQuery', () => {
    it('should build query with organization filter', () => {
      const inputQuery = {};
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query).toBeDefined();
      expect(query).toMatchObject({
        where: expect.objectContaining({
          isDeleted: false,
          OR: expect.arrayContaining([
            expect.objectContaining({
              organizationId: expect.any(String),
            }),
          ]),
        }),
      });
    });

    it('should load defaults when no organization', () => {
      const userWithoutOrg: User = {
        userId: userId,
      } as unknown as User;

      const inputQuery = {};
      const query = controller.buildFindAllQuery(userWithoutOrg, inputQuery);

      expect(query).toBeDefined();
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
      const updateDto: UpdateElementStyleDto = {
        label: 'Updated Style',
      };

      const request = {} as Request;
      const updatedStyle = { ...mockStyle, ...updateDto };
      mockElementsStylesService.findOne.mockResolvedValue(mockStyle);
      mockElementsStylesService.patch.mockResolvedValue(updatedStyle);

      const result = await controller.update(
        request,
        mockUser,
        styleId,
        updateDto,
      );

      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a style', async () => {
      const request = {} as Request;

      mockElementsStylesService.findOne.mockResolvedValue(mockStyle);
      mockElementsStylesService.remove.mockResolvedValue(mockStyle);

      const result = await controller.remove(request, mockUser, styleId);

      expect(result).toBeDefined();
    });
  });
});
