import {
  Organization,
  type OrganizationDocument,
} from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const mockModel = {
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    collection: { name: 'organizations' },
    countDocuments: vi.fn(),
    exists: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    modelName: 'Organization',
    updateMany: vi.fn(),
  } as Record<string, unknown>;

  const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  // Mock constructor for creating new documents
  const MockModelConstructor = vi
    .fn()
    .mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: vi.fn().mockResolvedValue({ _id: 'test-object-id', ...data }),
    }));

  beforeEach(async () => {
    Object.assign(MockModelConstructor, mockModel);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: MockModelConstructor },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should find organization with populate (settings and credits)', async () => {
      const orgId = 'test-object-id';
      const mockOrg = {
        _id: orgId,
        label: 'Test Org',
        settings: { brandsLimit: 5 },
      } as unknown as OrganizationDocument;

      const execMock = vi.fn().mockResolvedValue(mockOrg);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOne({ _id: orgId });

      expect(result).toBe(mockOrg);
      expect(mockModel.findOne).toHaveBeenCalled();
      expect(populateMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'settings' }),
          expect.objectContaining({ path: 'credits', select: '_id balance' }),
        ]),
      );
    });

    it('should return null when organization not found', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOne({ _id: 'test-object-id' });

      expect(result).toBeNull();
    });

    it('should find by label', async () => {
      const mockOrg = {
        _id: 'test-object-id',
        label: 'My Organization',
      } as unknown as OrganizationDocument;

      const execMock = vi.fn().mockResolvedValue(mockOrg);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOne({ label: 'My Organization' });

      expect(result).toBe(mockOrg);
    });

    it('should convert string _id to ObjectId', async () => {
      const idStr = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findOne({ _id: idStr });

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(string),
        }),
      );
    });
  });

  describe('create', () => {
    it('should create an organization with settings/credits populate', async () => {
      const createDto = {
        label: 'New Organization',
        slug: 'new-org',
      };

      const savedOrg = {
        _id: 'test-object-id',
        ...createDto,
      } as unknown as OrganizationDocument;

      // Spy on the inherited create to check it uses populate
      const createSpy = vi.spyOn(service, 'create').mockResolvedValue(savedOrg);

      const result = await service.create(
        createDto as Parameters<typeof service.create>[0],
      );

      expect(result).toBe(savedOrg);
      expect(createSpy).toHaveBeenCalledWith(createDto);
    });
  });

  describe('patch', () => {
    it('should update organization with populate', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const updateDto = { label: 'Updated Org' };

      const updatedOrg = {
        _id: new string(orgId),
        label: 'Updated Org',
      } as unknown as OrganizationDocument;

      const execMock = vi.fn().mockResolvedValue(updatedOrg);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          populate: populateMock,
        },
      );

      const result = await service.patch(orgId, updateDto);

      expect(result).toBe(updatedOrg);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        orgId,
        { $set: updateDto },
        { returnDocument: 'after' },
      );
    });

    it('should throw on empty id', async () => {
      await expect(service.patch('', { label: 'test' })).rejects.toThrow();
    });

    it('should throw on null update data', async () => {
      await expect(
        service.patch(
          '507f1f77bcf86cd799439011',
          null as unknown as Record<string, unknown>,
        ),
      ).rejects.toThrow();
    });
  });

  describe('count', () => {
    it('should count organizations matching filter', async () => {
      (mockModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(
        5,
      );

      const result = await service.count({ isDeleted: false });

      expect(result).toBe(5);
      expect(mockModel.countDocuments).toHaveBeenCalledWith({
        isDeleted: false,
      });
    });

    it('should return 0 when no organizations match', async () => {
      (mockModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(
        0,
      );

      const result = await service.count({ label: 'nonexistent' });

      expect(result).toBe(0);
    });
  });

  describe('getGetShareableOrganization', () => {
    it('should find the GetShareable organization', async () => {
      const mockOrg = {
        _id: 'test-object-id',
        label: 'GetShareable',
      } as unknown as OrganizationDocument;

      const execMock = vi.fn().mockResolvedValue(mockOrg);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.getGetShareableOrganization();

      expect(result).toBe(mockOrg);
      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          label: 'GetShareable',
        }),
      );
    });

    it('should return null when GetShareable org does not exist', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.getGetShareableOrganization();

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should soft delete an organization', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const deletedOrg = {
        _id: new string(orgId),
        isDeleted: true,
      } as unknown as OrganizationDocument;

      const execMock = vi.fn().mockResolvedValue(deletedOrg);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      const result = await service.remove(orgId);

      expect(result).toBe(deletedOrg);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        orgId,
        { isDeleted: true },
        { returnDocument: 'after' },
      );
    });

    it('should return null when org not found for deletion', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      const result = await service.remove('507f1f77bcf86cd799439099');

      expect(result).toBeNull();
    });
  });

  describe('processSearchParams', () => {
    it('should convert organization string to ObjectId', () => {
      const params = { organization: '507f1f77bcf86cd799439011' };
      const processed = service.processSearchParams(params);

      expect(processed.organization).toBeInstanceOf(string);
    });

    it('should not modify non-id fields', () => {
      const params = { isDeleted: false, label: 'test' };
      const processed = service.processSearchParams(params);

      expect(processed.label).toBe('test');
      expect(processed.isDeleted).toBe(false);
    });
  });

  describe('generateSlug', () => {
    it('should convert a label to a hyphenated slug', () => {
      expect(service.generateSlug('Genfeed AI')).toBe('genfeed-ai');
    });

    it('should strip special characters', () => {
      expect(service.generateSlug('Hello World! @#$%')).toBe('hello-world');
    });

    it('should collapse multiple hyphens', () => {
      expect(service.generateSlug('foo---bar')).toBe('foo-bar');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(service.generateSlug('--hello--')).toBe('hello');
    });

    it('should handle single word labels', () => {
      expect(service.generateSlug('Genfeed')).toBe('genfeed');
    });

    it('should handle labels with numbers', () => {
      expect(service.generateSlug('Studio 42')).toBe('studio-42');
    });
  });

  describe('findBySlug', () => {
    it('should find an organization by slug', async () => {
      const mockOrg = {
        _id: 'test-object-id',
        label: 'Genfeed AI',
        slug: 'genfeed-ai',
      } as unknown as OrganizationDocument;

      const execMock = vi.fn().mockResolvedValue(mockOrg);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findBySlug('genfeed-ai');

      expect(result).toBe(mockOrg);
      expect(mockModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        slug: 'genfeed-ai',
      });
    });

    it('should return null when slug not found', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('generateUniqueSlug', () => {
    it('should return the base slug when it is available', async () => {
      (mockModel.exists as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.generateUniqueSlug('Genfeed AI');

      expect(result).toBe('genfeed-ai');
      expect(mockModel.exists).toHaveBeenCalledWith({
        isDeleted: false,
        slug: 'genfeed-ai',
      });
    });

    it('should append a counter when the base slug is taken', async () => {
      (mockModel.exists as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ _id: 'test-object-id' })
        .mockResolvedValueOnce(null);

      const result = await service.generateUniqueSlug('Genfeed AI');

      expect(result).toBe('genfeed-ai-2');
      expect(mockModel.exists).toHaveBeenCalledWith({
        isDeleted: false,
        slug: 'genfeed-ai',
      });
      expect(mockModel.exists).toHaveBeenCalledWith({
        isDeleted: false,
        slug: 'genfeed-ai-2',
      });
    });

    it('should increment counter until a unique slug is found', async () => {
      (mockModel.exists as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ _id: 'test-object-id' })
        .mockResolvedValueOnce({ _id: 'test-object-id' })
        .mockResolvedValueOnce(null);

      const result = await service.generateUniqueSlug('Genfeed AI');

      expect(result).toBe('genfeed-ai-3');
      expect(mockModel.exists).toHaveBeenCalledWith({
        isDeleted: false,
        slug: 'genfeed-ai-3',
      });
    });

    it('should throw BadRequestException when label is too short for a valid slug', async () => {
      await expect(service.generateUniqueSlug('A')).rejects.toThrow(
        'Label too short to generate a valid slug',
      );
    });
  });

  describe('patchAll', () => {
    it('should bulk update organizations', async () => {
      const execMock = vi.fn().mockResolvedValue({
        matchedCount: 3,
        modifiedCount: 3,
      });
      (mockModel.updateMany as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.patchAll(
        { isDeleted: false },
        { $set: { isActive: true } },
      );

      expect(result.modifiedCount).toBe(3);
    });

    it('should throw on invalid filter', async () => {
      await expect(
        service.patchAll(null as unknown as Record<string, unknown>, {
          $set: { isActive: true },
        }),
      ).rejects.toThrow();
    });

    it('should throw on invalid update data', async () => {
      await expect(
        service.patchAll(
          { isDeleted: false },
          null as unknown as Record<string, unknown>,
        ),
      ).rejects.toThrow();
    });
  });
});
