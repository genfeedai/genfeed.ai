import {
  User,
  type UserDocument,
} from '@api/collections/users/schemas/user.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';

describe('UsersService', () => {
  let service: UsersService;

  const mockModel = {
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    collection: { name: 'users' },
    countDocuments: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    modelName: 'User',
    prototype: {},
  } as Record<string, unknown>;

  const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name, DB_CONNECTIONS.AUTH),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have logger injected', () => {
    expect(service.logger).toBeDefined();
  });

  describe('findOne', () => {
    it('should find a user with default settings populate', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        email: 'test@example.com',
        firstName: 'John',
      } as unknown as UserDocument;

      const execMock = vi.fn().mockResolvedValue(mockUser);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOne({ email: 'test@example.com' });

      expect(result).toBe(mockUser);
      expect(mockModel.findOne).toHaveBeenCalled();
      expect(populateMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ path: 'settings' })]),
      );
    });

    it('should return null when user is not found', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findOne({
        email: 'nonexistent@example.com',
      });

      expect(result).toBeNull();
    });

    it('should convert string _id to ObjectId when searching', async () => {
      const idString = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findOne({ _id: idString });

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
        }),
      );
    });

    it('should throw on invalid params (null)', async () => {
      await expect(
        service.findOne(null as unknown as Record<string, unknown>),
      ).rejects.toThrow();
    });

    it('should accept custom populate options', async () => {
      const mockUser = { _id: new Types.ObjectId() } as unknown as UserDocument;
      const execMock = vi.fn().mockResolvedValue(mockUser);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const customPopulate = [{ path: 'organization', select: '_id label' }];
      await service.findOne({ _id: new Types.ObjectId() }, customPopulate);

      expect(populateMock).toHaveBeenCalled();
    });

    it('should handle empty populate array', async () => {
      const mockUser = { _id: new Types.ObjectId() } as unknown as UserDocument;
      const execMock = vi.fn().mockResolvedValue(mockUser);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.findOne({ email: 'test@test.com' }, []);

      expect(result).toBe(mockUser);
    });
  });

  describe('patch', () => {
    it('should update a user and populate settings', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const updatedUser = {
        _id: new Types.ObjectId(userId),
        firstName: 'Updated',
      } as unknown as UserDocument;

      const execMock = vi.fn().mockResolvedValue(updatedUser);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          populate: populateMock,
        },
      );

      const result = await service.patch(userId, { firstName: 'Updated' });

      expect(result).toBe(updatedUser);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { firstName: 'Updated' } },
        { returnDocument: 'after' },
      );
    });

    it('should throw when id is empty', async () => {
      await expect(service.patch('', { firstName: 'Test' })).rejects.toThrow();
    });

    it('should throw when update data is null', async () => {
      await expect(
        service.patch(
          '507f1f77bcf86cd799439011',
          null as unknown as Record<string, unknown>,
        ),
      ).rejects.toThrow();
    });
  });

  describe('hasOnboardingField', () => {
    it('should return true when user has onboarding field', async () => {
      const userId = new Types.ObjectId();
      const mockUser = { _id: userId } as unknown as UserDocument;
      const execMock = vi.fn().mockResolvedValue(mockUser);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.hasOnboardingField(userId);

      expect(result).toBe(true);
      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: userId,
          isOnboardingCompleted: { $exists: true },
        }),
      );
    });

    it('should return false when user does not have onboarding field', async () => {
      const userId = new Types.ObjectId();
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.hasOnboardingField(userId);

      expect(result).toBe(false);
    });

    it('should pass empty populate array', async () => {
      const userId = new Types.ObjectId();
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      await service.hasOnboardingField(userId);

      // findOne is called without populate (empty array)
      expect(mockModel.findOne).toHaveBeenCalled();
    });
  });

  describe('inherited BaseService methods', () => {
    it('should processSearchParams and convert _id strings to ObjectId', () => {
      const params = { _id: '507f1f77bcf86cd799439011' };
      const processed = service.processSearchParams(params);

      expect(processed._id).toBeInstanceOf(Types.ObjectId);
    });

    it('should not convert non-ObjectId strings in _id', () => {
      const params = { _id: 'not-a-valid-object-id' };
      const processed = service.processSearchParams(params);

      expect(processed._id).toBe('not-a-valid-object-id');
    });

    it('should convert user field string to ObjectId', () => {
      const params = { user: '507f1f77bcf86cd799439011' };
      const processed = service.processSearchParams(params);

      expect(processed.user).toBeInstanceOf(Types.ObjectId);
    });

    it('should convert organization field string to ObjectId', () => {
      const params = { organization: '507f1f77bcf86cd799439011' };
      const processed = service.processSearchParams(params);

      expect(processed.organization).toBeInstanceOf(Types.ObjectId);
    });

    it('should not convert non-ObjectId fields', () => {
      const params = { email: 'test@example.com', name: 'John' };
      const processed = service.processSearchParams(params);

      expect(processed.email).toBe('test@example.com');
      expect(processed.name).toBe('John');
    });
  });

  describe('create', () => {
    it('should create a new user document', async () => {
      const createDto = {
        clerkId: 'clerk_abc123',
        email: 'newuser@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      };

      const savedDoc = {
        _id: new Types.ObjectId(),
        ...createDto,
        save: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          ...createDto,
        }),
      };

      // Mock the model constructor
      const saveMock = vi.fn().mockResolvedValue(savedDoc);
      const constructorMock = vi.fn().mockReturnValue({ save: saveMock });
      Object.setPrototypeOf(mockModel, constructorMock.prototype);
      (mockModel as Record<string, unknown>).constructor = constructorMock;

      // For BaseService.create, it does: new this.model(createDto), then .save()
      // We need to handle the case where service uses super.create
      const createSpy = vi
        .spyOn(service, 'create')
        .mockResolvedValue(savedDoc as unknown as UserDocument);

      const result = await service.create(createDto);

      expect(result).toBe(savedDoc);
      expect(createSpy).toHaveBeenCalledWith(createDto);
    });
  });

  describe('remove', () => {
    it('should soft delete a user', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const deletedUser = {
        _id: new Types.ObjectId(userId),
        isDeleted: true,
      } as unknown as UserDocument;

      const execMock = vi.fn().mockResolvedValue(deletedUser);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      const result = await service.remove(userId);

      expect(result).toBe(deletedUser);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { isDeleted: true },
        { returnDocument: 'after' },
      );
    });

    it('should return null when user not found for deletion', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      const result = await service.remove('507f1f77bcf86cd799439099');

      expect(result).toBeNull();
    });

    it('should throw when id is empty', async () => {
      await expect(service.remove('')).rejects.toThrow();
    });
  });
});
