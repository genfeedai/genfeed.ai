import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';
import { FontFamily } from '@api/collections/font-families/schemas/font-family.schema';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { type PipelineStage, Types } from 'mongoose';

describe('FontFamiliesService', () => {
  type FontFamilyFixture = typeof mockFontFamily;
  type MockFontFamilyModel = vi.Mock & {
    aggregate: ReturnType<typeof vi.fn>;
    aggregatePaginate: ReturnType<typeof vi.fn>;
    collection: { name: string };
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByIdAndDelete: ReturnType<typeof vi.fn>;
    findByIdAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    modelName: string;
    populate: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };

  let service: FontFamiliesService;
  let model: MockFontFamilyModel;
  let logger: LoggerService;

  const mockFontFamily = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
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
    // Must be a callable constructor for `new this.model()` in BaseService.create()
    // Using vi.fn() so tests can override per-test with mockImplementationOnce
    const MockFontFamilyModel = vi.fn().mockImplementation(function (
      data: Record<string, unknown>,
    ) {
      return {
        ...data,
        save: vi.fn().mockResolvedValue(data),
      };
    }) as MockFontFamilyModel;
    MockFontFamilyModel.collection = { name: 'font-families' };
    MockFontFamilyModel.modelName = 'FontFamily';
    MockFontFamilyModel.aggregate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    });
    MockFontFamilyModel.aggregatePaginate = vi.fn().mockResolvedValue({
      docs: [],
      totalDocs: 0,
    });
    MockFontFamilyModel.create = vi.fn();
    MockFontFamilyModel.deleteMany = vi.fn();
    MockFontFamilyModel.find = vi.fn();
    MockFontFamilyModel.findById = vi.fn();
    MockFontFamilyModel.findByIdAndDelete = vi.fn();
    MockFontFamilyModel.findByIdAndUpdate = vi.fn();
    MockFontFamilyModel.findOne = vi.fn();
    MockFontFamilyModel.populate = vi.fn();
    MockFontFamilyModel.save = vi.fn();
    MockFontFamilyModel.updateMany = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FontFamiliesService,
        {
          provide: getModelToken(FontFamily.name, DB_CONNECTIONS.CLOUD),
          useValue: MockFontFamilyModel,
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
    model = module.get(
      getModelToken(FontFamily.name, DB_CONNECTIONS.CLOUD),
    ) as MockFontFamilyModel;
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

      const savedDoc = {
        ...mockFontFamily,
        save: vi.fn().mockResolvedValue(mockFontFamily),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(logger.debug).toHaveBeenCalledWith(
        'Creating new document',
        expect.objectContaining({ createDto }),
      );
      expect(result).toEqual(mockFontFamily);
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
      const savedDoc = {
        ...customFont,
        save: vi.fn().mockResolvedValue(customFont),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.provider).toBe('custom');
      expect(result.url).toBe('/fonts/custom-font.woff2');
    });

    it('should validate font category', async () => {
      const createDto = asCreateDto({
        category: 'invalid-category', // Invalid category
        name: 'Invalid Font',
      });

      const error = new ValidationException('Invalid font category');
      (model as vi.Mock).mockImplementationOnce(function () {
        return { save: vi.fn().mockRejectedValue(error) };
      });

      await expect(service.create(createDto)).rejects.toThrow(
        ValidationException,
      );
    });

    it('should handle duplicate font names', async () => {
      const createDto = asCreateDto({
        category: 'sans-serif',
        name: 'Roboto',
      });

      const error = new Error('Duplicate key error');
      (model as vi.Mock).mockImplementationOnce(function () {
        return { save: vi.fn().mockRejectedValue(error) };
      });

      await expect(service.create(createDto)).rejects.toThrow(error);
    });
  });

  describe('findAll', () => {
    it('should find all active font families', async () => {
      const aggregate: PipelineStage[] = [
        { $match: { isActive: true, isDeleted: false } },
        { $sort: { category: 1, name: 1 } },
      ];
      const options = { limit: 50, page: 1 };
      const mockResult = {
        docs: [mockFontFamily],
        limit: 50,
        page: 1,
        totalDocs: 1,
      };

      model.aggregate = vi.fn().mockReturnValue({ exec: vi.fn() });
      model.aggregatePaginate = vi.fn().mockResolvedValue(mockResult);

      const result = await service.findAll(aggregate, options);

      expect(result).toEqual(mockResult);
    });

    it('should filter fonts by category', async () => {
      const aggregate: PipelineStage[] = [
        { $match: { category: 'sans-serif', isDeleted: false } },
      ];
      const options = { limit: 20, page: 1 };
      const sansSerifFonts = [
        mockFontFamily,
        { ...mockFontFamily, name: 'Open Sans' },
        { ...mockFontFamily, name: 'Lato' },
      ];

      model.aggregate = vi.fn().mockReturnValue({ exec: vi.fn() });
      model.aggregatePaginate = vi.fn().mockResolvedValue({
        docs: sansSerifFonts,
        totalDocs: 3,
      });

      const result = await service.findAll(aggregate, options);

      expect(result.docs).toHaveLength(3);
    });

    it('should filter fonts by provider', async () => {
      const aggregate: PipelineStage[] = [
        { $match: { isDeleted: false, provider: 'google' } },
      ];
      const options = { pagination: false };
      const googleFonts = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...mockFontFamily,
          _id: new Types.ObjectId(),
          name: `Font${i}`,
        }));

      // pagination: false uses model.aggregate(pipeline).exec() directly
      model.aggregate = vi
        .fn()
        .mockReturnValue({ exec: vi.fn().mockResolvedValue(googleFonts) });

      const result = await service.findAll(aggregate, options);

      expect(result.docs).toHaveLength(100);
    });
  });

  describe('findOne', () => {
    it('should find font by name', async () => {
      const params = { name: 'Roboto' };

      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockFontFamily),
      });

      const result = asFontFamilyFixture(await service.findOne(params));

      expect(result?.name).toBe('Roboto');
    });

    it('should find default font', async () => {
      const params = { isDefault: true };
      const defaultFont = { ...mockFontFamily, isDefault: true };

      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(defaultFont),
      });

      const result = asFontFamilyFixture(await service.findOne(params));

      expect(result?.isDefault).toBe(true);
    });

    it('should return null when font not found', async () => {
      const params = { name: 'NonExistentFont' };

      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.findOne(params);

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
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedFont),
        populate: vi.fn().mockReturnThis(),
      });

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
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedFont),
        populate: vi.fn().mockReturnThis(),
      });

      const result = asFontFamilyFixture(await service.patch(id, updateDto));

      expect(result.url).toContain('wght@100;300;400;500;700;900');
    });

    it('should update font fallback', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto = asUpdateDto({
        fallback: 'Arial, sans-serif',
      });

      const updatedFont = { ...mockFontFamily, fallback: 'Arial, sans-serif' };
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedFont),
        populate: vi.fn().mockReturnThis(),
      });

      const result = asFontFamilyFixture(await service.patch(id, updateDto));

      expect(result.fallback).toBe('Arial, sans-serif');
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

    it('should validate font URL format', async () => {
      const createDto = asCreateDto({
        name: 'InvalidURL',
        url: 'not-a-valid-url',
      });

      const error = new ValidationException('Invalid font URL');
      (model as vi.Mock).mockImplementationOnce(function () {
        return { save: vi.fn().mockRejectedValue(error) };
      });

      await expect(service.create(createDto)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete font family', async () => {
      const id = '507f1f77bcf86cd799439011';
      const deletedFont = { ...mockFontFamily, isDeleted: true };

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(deletedFont),
      });

      const result = asFontFamilyFixture(await service.remove(id));

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { isDeleted: true },
        { returnDocument: 'after' },
      );
      expect(result.isDeleted).toBe(true);
    });

    it('should return null when font not found for deletion', async () => {
      const id = '507f1f77bcf86cd799439011';

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.remove(id);

      expect(result).toBeNull();
    });
  });

  describe('patchAll', () => {
    it('should deactivate fonts by provider', async () => {
      const filter = { provider: 'deprecated' };
      const update = { isActive: false };
      const updateResult = { modifiedCount: 10 };

      model.updateMany = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updateResult),
      });

      const result = await service.patchAll(filter, update);

      expect(result.modifiedCount).toBe(10);
    });

    it('should update font category in bulk', async () => {
      const filter = { category: 'old-category' };
      const update = { category: 'display' };
      const updateResult = { modifiedCount: 25 };

      model.updateMany = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updateResult),
      });

      const result = await service.patchAll(filter, update);

      expect(model.updateMany).toHaveBeenCalledWith(filter, update);
      expect(result.modifiedCount).toBe(25);
    });
  });

  describe('fallback handling', () => {
    it('should use proper fallback chain', async () => {
      const createDto = asCreateDto({
        category: 'serif',
        fallback: 'Georgia, Times New Roman, Times, serif',
        name: 'CustomSerif',
      });

      const serifFont = {
        ...mockFontFamily,
        category: 'serif',
        fallback: 'Georgia, Times New Roman, Times, serif',
        name: 'CustomSerif',
      };
      const savedDoc = {
        ...serifFont,
        save: vi.fn().mockResolvedValue(serifFont),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.fallback).toContain('Georgia');
      expect(result.fallback).toContain('serif');
    });

    it('should provide default fallback based on category', async () => {
      const createDto = asCreateDto({
        category: 'monospace',
        name: 'NoFallback',
        // No fallback specified
      });

      const monoFont = {
        ...mockFontFamily,
        category: 'monospace',
        fallback: 'monospace', // Default fallback
        name: 'NoFallback',
      };
      const savedDoc = {
        ...monoFont,
        save: vi.fn().mockResolvedValue(monoFont),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.fallback).toBe('monospace');
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
      const savedDoc = {
        ...simpleFont,
        save: vi.fn().mockResolvedValue(simpleFont),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

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
      const savedDoc = {
        ...intlFont,
        save: vi.fn().mockResolvedValue(intlFont),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

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
      const savedDoc = {
        ...variableFont,
        save: vi.fn().mockResolvedValue(variableFont),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.variants).toContain('variable');
      expect(result.url).toContain('100..900');
    });

    it('should handle local font files', async () => {
      const createDto = asCreateDto({
        category: 'display',
        name: 'LocalFont',
        provider: 'local',
        url: 'file:///usr/share/fonts/custom/myfont.ttf',
      });

      const localFont = {
        ...mockFontFamily,
        name: 'LocalFont',
        provider: 'local',
        url: 'file:///usr/share/fonts/custom/myfont.ttf',
      };
      const savedDoc = {
        ...localFont,
        save: vi.fn().mockResolvedValue(localFont),
      };

      (model as vi.Mock).mockImplementationOnce(function () {
        return savedDoc;
      });

      const result = asFontFamilyFixture(await service.create(createDto));

      expect(result.provider).toBe('local');
      expect(result.url).toContain('file://');
    });
  });

  describe('performance', () => {
    it('should efficiently handle bulk font imports', async () => {
      const fonts = Array(50)
        .fill(null)
        .map((_, i) => ({
          category: i % 2 === 0 ? 'sans-serif' : 'serif',
          name: `Font${i}`,
          provider: 'google',
        }));

      for (const fontDto of fonts) {
        const font = { ...mockFontFamily, ...fontDto };
        const savedDoc = {
          ...font,
          save: vi.fn().mockResolvedValue(font),
        };

        (model as vi.Mock).mockImplementationOnce(function () {
          return savedDoc;
        });

        const result = asFontFamilyFixture(
          await service.create(asCreateDto(fontDto)),
        );
        expect(result.name).toBe(fontDto.name);
      }

      // BaseService.create logs 'Creating new document' once per create call
      expect(logger.debug).toHaveBeenCalled();
    });
  });
});
