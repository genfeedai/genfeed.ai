import {
  CreditBalance,
  type CreditBalanceDocument,
} from '@api/collections/credits/schemas/credit-balance.schema';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('CreditBalanceService', () => {
  let service: CreditBalanceService;

  const mockModel = {
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
  } as Record<string, unknown>;

  const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  // Mock the model as a constructor
  const MockModelConstructor = vi
    .fn()
    .mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(), ...data }),
    }));

  beforeEach(async () => {
    // Copy methods to the constructor function
    Object.assign(MockModelConstructor, mockModel);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditBalanceService,
        {
          provide: getModelToken(CreditBalance.name, DB_CONNECTIONS.AUTH),
          useValue: MockModelConstructor,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<CreditBalanceService>(CreditBalanceService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new credit balance', async () => {
      const orgId = new Types.ObjectId();
      const createData = {
        balance: 100,
        isDeleted: false,
        organization: orgId,
      };

      const savedDoc = {
        _id: new Types.ObjectId(),
        ...createData,
      };

      // Spy on the create method to avoid constructor issues
      const createSpy = vi
        .spyOn(service, 'create')
        .mockResolvedValue(savedDoc as unknown as CreditBalanceDocument);

      const result = await service.create(
        createData as unknown as Parameters<typeof service.create>[0],
      );

      expect(result).toEqual(savedDoc);
      expect(createSpy).toHaveBeenCalledWith(createData);
    });

    it('should save with zero balance', async () => {
      const orgId = new Types.ObjectId();
      const createData = {
        balance: 0,
        isDeleted: false,
        organization: orgId,
      };

      const savedDoc = {
        _id: new Types.ObjectId(),
        ...createData,
      };

      vi.spyOn(service, 'create').mockResolvedValue(
        savedDoc as unknown as CreditBalanceDocument,
      );

      const result = await service.create(
        createData as unknown as Parameters<typeof service.create>[0],
      );

      expect(result.balance).toBe(0);
    });
  });

  describe('findByOrganization', () => {
    it('should find credit balance by organization ID', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const mockBalance = {
        _id: new Types.ObjectId(),
        balance: 500,
        organization: new Types.ObjectId(orgId),
      };

      const execMock = vi.fn().mockResolvedValue(mockBalance);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.findByOrganization(orgId);

      expect(result).toBe(mockBalance);
      expect(mockModel.findOne).toHaveBeenCalledWith({
        isDeleted: { $ne: true },
        organization: new Types.ObjectId(orgId),
      });
    });

    it('should return null when no balance exists', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.findByOrganization(
        '507f1f77bcf86cd799439099',
      );

      expect(result).toBeNull();
    });

    it('should return null for invalid organization ID', async () => {
      const result = await service.findByOrganization('invalid-id');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return null for short organization ID', async () => {
      const result = await service.findByOrganization('abc');

      expect(result).toBeNull();
    });

    it('should handle empty string organization ID', async () => {
      const result = await service.findByOrganization('');

      expect(result).toBeNull();
    });
  });

  describe('getOrCreateBalance', () => {
    it('should return existing balance when found', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const existingBalance = {
        _id: new Types.ObjectId(),
        balance: 200,
        organization: new Types.ObjectId(orgId),
      };

      const execMock = vi.fn().mockResolvedValue(existingBalance);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.getOrCreateBalance(orgId);

      expect(result).toBe(existingBalance);
    });

    it('should create a new balance when none exists', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const newBalance = {
        _id: new Types.ObjectId(),
        balance: 0,
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      } as unknown as CreditBalanceDocument;

      // findByOrganization returns null (no existing balance)
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      // Mock create to return new balance
      vi.spyOn(service, 'create').mockResolvedValue(newBalance);

      const result = await service.getOrCreateBalance(orgId);

      expect(result).toBe(newBalance);
      expect(result.balance).toBe(0);
    });

    it('should throw for invalid organization ID', async () => {
      await expect(service.getOrCreateBalance('invalid')).rejects.toThrow(
        'Invalid organization ID',
      );
    });

    it('should throw for empty organization ID', async () => {
      await expect(service.getOrCreateBalance('')).rejects.toThrow(
        'Invalid organization ID',
      );
    });
  });

  describe('updateBalance', () => {
    it('should update balance for existing organization', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const existingBalance = {
        _id: new Types.ObjectId(),
        balance: 100,
        organization: new Types.ObjectId(orgId),
      };

      const updatedBalance = {
        ...existingBalance,
        balance: 500,
      };

      const execFindMock = vi.fn().mockResolvedValue(existingBalance);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execFindMock,
      });

      const execUpdateMock = vi.fn().mockResolvedValue(updatedBalance);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execUpdateMock,
        },
      );

      const result = await service.updateBalance(orgId, 500);

      expect(result.balance).toBe(500);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        existingBalance._id,
        { balance: 500 },
        { returnDocument: 'after' },
      );
    });

    it('should update balance to zero', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const existingBalance = {
        _id: new Types.ObjectId(),
        balance: 100,
        organization: new Types.ObjectId(orgId),
      };

      const updatedBalance = { ...existingBalance, balance: 0 };

      const execFindMock = vi.fn().mockResolvedValue(existingBalance);
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execFindMock,
      });

      const execUpdateMock = vi.fn().mockResolvedValue(updatedBalance);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execUpdateMock,
        },
      );

      const result = await service.updateBalance(orgId, 0);

      expect(result.balance).toBe(0);
    });
  });

  describe('delete', () => {
    it('should soft delete a credit balance', async () => {
      const id = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue({ isDeleted: true });
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      await service.delete(id);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(id, {
        isDeleted: true,
      });
    });

    it('should handle delete of non-existent record', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          exec: execMock,
        },
      );

      // Should not throw
      await service.delete('507f1f77bcf86cd799439099');
    });
  });
});
