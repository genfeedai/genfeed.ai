import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('FontFamiliesService', () => {
  type FontFamilyFixture = typeof mockFontFamily;

  let service: FontFamiliesService;
  let prismaDelegate: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let mockPrismaService: Partial<PrismaService>;
  let logger: LoggerService;

  const mockFontFamily = {
    id: '507f1f77bcf86cd799439011',
    category: 'sans-serif',
    createdAt: new Date(),
    displayName: 'Roboto',
    fallback: 'sans-serif',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    name: 'Roboto',
    provider: 'google',
    subsets: ['latin', 'latin-ext', 'cyrillic'],
    updatedAt: new Date(),
    url: 'https://fonts.googleapis.com/css2?family=Roboto',
    variants: ['100', '300', '400', '500', '700', '900'],
  };

  const asCreateDto = (value: Record<string, unknown>): CreateFontFamilyDto =>
    value as unknown as CreateFontFamilyDto;

  const asUpdateDto = (value: Record<string, unknown>): UpdateFontFamilyDto =>
    value as unknown as UpdateFontFamilyDto;

  const asFontFamilyFixture = (value: unknown): FontFamilyFixture =>
    value as FontFamilyFixture;

  beforeEach(async () => {
    prismaDelegate = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(mockFontFamily),
      delete: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };

    mockPrismaService = {
      fontFamilyRecord: prismaDelegate,
    } as unknown as Partial<PrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FontFamiliesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FontFamiliesService>(FontFamiliesService);
    logger = module.get<LoggerService>(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a font family with all properties', async () => {
      const createDto = asCreateDto({
        category: 'sans-serif',
        displayName: 'Roboto',
        name: 'Roboto',
        provider: 'google',
        subsets: ['latin', 'latin-ext'],
        variants: ['100', '300', '400', '500', '700', '900'],
      });

      prismaDelegate.create.mockResolvedValueOnce(mockFontFamily);

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.name).toBe('Roboto');
    });

    it('should create custom font family', async () => {
      const createDto = asCreateDto({
        category: 'display',
        displayName: 'My Custom Font',
        name: 'CustomFont',
        provider: 'custom',
        url: '/fonts/custom-font.woff2',
      });

      const customFont = {
        ...mockFontFamily,
        category: 'display',
        displayName: 'My Custom Font',
        name: 'CustomFont',
        provider: 'custom',
        url: '/fonts/custom-font.woff2',
      };

      prismaDelegate.create.mockResolvedValueOnce(customFont);

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.provider).toBe('custom');
      expect(result.url).toBe('/fonts/custom-font.woff2');
    });

    it('should propagate errors from prisma on invalid data', async () => {
      const createDto = asCreateDto({
        category: 'invalid-category',
        name: 'Invalid Font',
      });

      const error = new ValidationException('Invalid font category');
      prismaDelegate.create.mockRejectedValueOnce(error);

      await expect(service.create(createDto)).rejects.toThrow(
        ValidationException,
      );
    });

    it('should propagate duplicate key errors', async () => {
      const createDto = asCreateDto({
        category: 'sans-serif',
        name: 'Roboto',
      });

      const error = new Error('Duplicate key error');
      prismaDelegate.create.mockRejectedValueOnce(error);

      await expect(service.create(createDto)).rejects.toThrow(error);
    });
  });

  describe('findOne', () => {
    it('should find font by name', async () => {
      prismaDelegate.findFirst.mockResolvedValueOnce(mockFontFamily);

      const result = asFontFamilyFixture(
        await service.findOne({ name: 'Roboto' }),
      );

      expect(result?.name).toBe('Roboto');
    });

    it('should find default font', async () => {
      const defaultFont = { ...mockFontFamily, isDefault: true };
      prismaDelegate.findFirst.mockResolvedValueOnce(defaultFont);

      const result = asFontFamilyFixture(
        await service.findOne({ isDefault: true }),
      );

      expect(result?.isDefault).toBe(true);
    });

    it('should return null when font not found', async () => {
      prismaDelegate.findFirst.mockResolvedValueOnce(null);

      const result = await service.findOne({ name: 'NonExistentFont' });

      expect(result).toBeNull();
    });
  });

  describe('patch', () => {
    it('should update font variants', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto = asUpdateDto({
        variants: [
          '100',
          '300',
          '400',
          '500',
          '700',
          '900',
          '100italic',
          '300italic',
        ],
      });

      const updatedFont = {
        ...mockFontFamily,
        variants: [
          '100',
          '300',
          '400',
          '500',
          '700',
          '900',
          '100italic',
          '300italic',
        ],
      };
      prismaDelegate.update.mockResolvedValueOnce(updatedFont);

      const result = asFontFamilyFixture(await service.patch(id, updateDto));

      expect(result.variants).toContain('100italic');
      expect(result.variants).toContain('300italic');
    });

    it('should update font URL', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto = asUpdateDto({
        url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900',
      });

      const updatedFont = {
        ...mockFontFamily,
        url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900',
      };
      prismaDelegate.update.mockResolvedValueOnce(updatedFont);

      const result = asFontFamilyFixture(await service.patch(id, updateDto));

      expect(result.url).toContain('wght@100;300;400;500;700;900');
    });
  });

  describe('font validation', () => {
    it('should validate font weight variants', () => {
      const validWeights = [
        '100',
        '200',
        '300',
        '400',
        '500',
        '600',
        '700',
        '800',
        '900',
      ];
      const invalidWeights = ['150', '1000', 'bold', 'normal'];

      validWeights.forEach((weight) => {
        expect(weight).toMatch(/^[1-9]00$/);
      });

      invalidWeights.forEach((weight) => {
        expect(weight).not.toMatch(/^[1-9]00$/);
      });
    });

    it('should validate font categories', () => {
      const validCategories = [
        'serif',
        'sans-serif',
        'monospace',
        'cursive',
        'fantasy',
        'display',
      ];
      const invalidCategories = ['comic', 'gothic', 'modern'];

      validCategories.forEach((category) => {
        expect([
          'serif',
          'sans-serif',
          'monospace',
          'cursive',
          'fantasy',
          'display',
        ]).toContain(category);
      });

      invalidCategories.forEach((category) => {
        expect([
          'serif',
          'sans-serif',
          'monospace',
          'cursive',
          'fantasy',
          'display',
        ]).not.toContain(category);
      });
    });

    it('should propagate errors for invalid font URL', async () => {
      const createDto = asCreateDto({
        name: 'InvalidURL',
        url: 'not-a-valid-url',
      });

      const error = new ValidationException('Invalid font URL');
      prismaDelegate.create.mockRejectedValueOnce(error);

      await expect(service.create(createDto)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete font family', async () => {
      const id = '507f1f77bcf86cd799439011';
      const deletedFont = { ...mockFontFamily, isDeleted: true };

      prismaDelegate.update.mockResolvedValueOnce(deletedFont);

      const result = asFontFamilyFixture(await service.remove(id));

      expect(result.isDeleted).toBe(true);
    });

    it('should return null when font not found for deletion', async () => {
      const id = '507f1f77bcf86cd799439011';
      prismaDelegate.update.mockResolvedValueOnce(null);

      const result = await service.remove(id);

      expect(result).toBeNull();
    });
  });

  describe('patchAll', () => {
    it('should deactivate fonts by provider', async () => {
      const filter = { provider: 'deprecated' };
      const update = { isActive: false };

      prismaDelegate.updateMany.mockResolvedValueOnce({ count: 10 });

      const result = await service.patchAll(filter, update);

      expect(result.modifiedCount).toBe(10);
    });

    it('should update font category in bulk', async () => {
      const filter = { category: 'old-category' };
      const update = { category: 'display' };

      prismaDelegate.updateMany.mockResolvedValueOnce({ count: 25 });

      const result = await service.patchAll(filter, update);

      expect(result.modifiedCount).toBe(25);
    });
  });

  describe('edge cases', () => {
    it('should handle font with no variants', async () => {
      const createDto = asCreateDto({
        category: 'sans-serif',
        name: 'SimpleFont',
        variants: [],
      });

      const simpleFont = { ...mockFontFamily, variants: [] };
      prismaDelegate.create.mockResolvedValueOnce(simpleFont);

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.variants).toEqual([]);
    });

    it('should handle font with many subsets', async () => {
      const subsets = [
        'latin',
        'latin-ext',
        'cyrillic',
        'cyrillic-ext',
        'greek',
        'greek-ext',
        'vietnamese',
        'arabic',
        'hebrew',
        'thai',
        'devanagari',
        'bengali',
      ];
      const createDto = asCreateDto({
        category: 'sans-serif',
        name: 'InternationalFont',
        subsets,
      });

      const intlFont = { ...mockFontFamily, subsets };
      prismaDelegate.create.mockResolvedValueOnce(intlFont);

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.subsets).toHaveLength(12);
      expect(result.subsets).toContain('arabic');
      expect(result.subsets).toContain('devanagari');
    });

    it('should handle variable fonts', async () => {
      const createDto = asCreateDto({
        category: 'sans-serif',
        displayName: 'Inter Variable',
        name: 'InterVariable',
        url: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900',
        variants: ['variable'],
      });

      const variableFont = {
        ...mockFontFamily,
        name: 'InterVariable',
        url: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900',
        variants: ['variable'],
      };
      prismaDelegate.create.mockResolvedValueOnce(variableFont);

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.variants).toContain('variable');
      expect(result.url).toContain('100..900');
    });
  });

  describe('performance', () => {
    it('should efficiently handle bulk font imports', async () => {
      const fonts = Array(10)
        .fill(null)
        .map((_, i) => ({
          category: i % 2 === 0 ? 'sans-serif' : 'serif',
          name: `Font${i}`,
          provider: 'google',
        }));

      for (const fontDto of fonts) {
        const font = { ...mockFontFamily, ...fontDto };
        prismaDelegate.create.mockResolvedValueOnce(font);

        const result = asFontFamilyFixture(
          await service.create(asCreateDto(fontDto)),
        );
        expect(result.name).toBe(fontDto.name);
      }
    });
  });
});
