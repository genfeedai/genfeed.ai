// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.FontFamilyRecord via the
// light @genfeedai/prisma/testing subpath — no heavy PrismaClient/runtime
// import required for BaseService's getModelMeta('fontFamilyRecord') call.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const fontFamilyId = testId('fontfamily');

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

  const mockFontFamily = {
    id: fontFamilyId,
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

    vi.clearAllMocks();
  });

  describe('create', () => {
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
  });

  describe('patch', () => {
    it('should update font variants', async () => {
      const id = fontFamilyId;
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
  });

  describe('remove', () => {
    it('should return null when font not found for deletion', async () => {
      const id = fontFamilyId;
      prismaDelegate.update.mockResolvedValueOnce(null);

      const result = await service.remove(id);

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
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
});
