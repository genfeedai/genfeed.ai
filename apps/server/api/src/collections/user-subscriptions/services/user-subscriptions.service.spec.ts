import { UserSubscription } from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('UserSubscriptionsService', () => {
  let service: UserSubscriptionsService;

  beforeEach(async () => {
    const mockModel = vi.fn().mockImplementation(() => ({ save: vi.fn() }));
    mockModel.findOne = vi
      .fn()
      .mockReturnValue({ exec: vi.fn(), lean: vi.fn().mockReturnThis() });
    mockModel.findByIdAndUpdate = vi
      .fn()
      .mockReturnValue({ exec: vi.fn(), lean: vi.fn().mockReturnThis() });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSubscriptionsService,
        {
          provide: getModelToken(UserSubscription.name, DB_CONNECTIONS.AUTH),
          useValue: mockModel,
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

    service = module.get<UserSubscriptionsService>(UserSubscriptionsService);
  });

  let mockModel: Record<string, unknown>;
  const validUserId = '507f1f77bcf86cd799439011';
  const invalidUserId = 'not-valid';

  beforeEach(() => {
    mockModel = (service as unknown).model;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and save a new subscription', async () => {
      const mockDoc = { _id: 'sub1', stripeCustomerId: 'cus_123' };
      (mockModel as Function).mockImplementation(function () {
        return { save: vi.fn().mockResolvedValue(mockDoc) };
      });

      const result = await service.create({
        stripeCustomerId: 'cus_123',
      } as never);

      expect(result).toBeDefined();
    });
  });

  describe('findByUser', () => {
    it('should return subscription when found', async () => {
      const mockSub = { _id: 'sub1', user: validUserId };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockSub),
      });

      const result = await service.findByUser(validUserId);

      expect(result).toEqual(mockSub);
    });

    it('should return null for invalid ObjectId', async () => {
      const result = await service.findByUser(invalidUserId);

      expect(result).toBeNull();
    });

    it('should return null when not found', async () => {
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.findByUser(validUserId);

      expect(result).toBeNull();
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should return subscription by stripe customer id', async () => {
      const mockSub = { _id: 'sub1', stripeCustomerId: 'cus_123' };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockSub),
      });

      const result = await service.findByStripeCustomerId('cus_123');

      expect(result).toEqual(mockSub);
    });

    it('should return null when not found', async () => {
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.findByStripeCustomerId('cus_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getOrCreateSubscription', () => {
    it('should return existing subscription if found', async () => {
      const existingSub = { _id: 'sub1', user: validUserId };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingSub),
      });

      const result = await service.getOrCreateSubscription(
        validUserId,
        'cus_123',
      );

      expect(result).toEqual(existingSub);
    });

    it('should create a new subscription if not found', async () => {
      const newSub = {
        _id: 'sub2',
        stripeCustomerId: 'cus_123',
        user: validUserId,
      };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      (mockModel as Function).mockImplementation(function () {
        return { save: vi.fn().mockResolvedValue(newSub) };
      });

      const result = await service.getOrCreateSubscription(
        validUserId,
        'cus_123',
      );

      expect(result).toBeDefined();
    });

    it('should throw for invalid user ID', async () => {
      await expect(
        service.getOrCreateSubscription(invalidUserId, 'cus_123'),
      ).rejects.toThrow('Invalid user ID');
    });
  });

  describe('updateStatus', () => {
    it('should update subscription status', async () => {
      const existingSub = { _id: 'sub1', user: validUserId };
      const updatedSub = { ...existingSub, status: 'active' };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingSub),
      });
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedSub),
      });

      const result = await service.updateStatus(validUserId, 'active' as never);

      expect(result).toEqual(updatedSub);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'sub1',
        expect.objectContaining({ status: 'active' }),
        { returnDocument: 'after' },
      );
    });

    it('should include currentPeriodEnd when provided', async () => {
      const existingSub = { _id: 'sub1' };
      const periodEnd = new Date('2026-04-01');
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingSub),
      });
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi
          .fn()
          .mockResolvedValue({ ...existingSub, currentPeriodEnd: periodEnd }),
      });

      await service.updateStatus(validUserId, 'active' as never, periodEnd);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'sub1',
        expect.objectContaining({
          currentPeriodEnd: periodEnd,
          status: 'active',
        }),
        { returnDocument: 'after' },
      );
    });

    it('should include cancelAtPeriodEnd when provided', async () => {
      const existingSub = { _id: 'sub1' };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingSub),
      });
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi
          .fn()
          .mockResolvedValue({ ...existingSub, cancelAtPeriodEnd: true }),
      });

      await service.updateStatus(
        validUserId,
        'active' as never,
        undefined,
        true,
      );

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'sub1',
        expect.objectContaining({ cancelAtPeriodEnd: true, status: 'active' }),
        { returnDocument: 'after' },
      );
    });

    it('should return null when subscription not found', async () => {
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.updateStatus(validUserId, 'active' as never);

      expect(result).toBeNull();
    });
  });

  describe('updateFromStripeSession', () => {
    it('should update subscription with stripe session data', async () => {
      const existingSub = { _id: 'sub1' };
      const updatedSub = { ...existingSub, stripeSubscriptionId: 'sub_stripe' };
      const session = { subscription: 'sub_stripe' } as never;

      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingSub),
      });
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedSub),
      });

      const result = await service.updateFromStripeSession(
        validUserId,
        session,
      );

      expect(result).toEqual(updatedSub);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'sub1',
        expect.objectContaining({ stripeSubscriptionId: 'sub_stripe' }),
        { returnDocument: 'after' },
      );
    });

    it('should return null when subscription not found', async () => {
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.updateFromStripeSession(validUserId, {
        subscription: 'sub_stripe',
      } as never);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should soft-delete a subscription', async () => {
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(undefined),
      });

      await service.delete('sub1');

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith('sub1', {
        isDeleted: true,
      });
    });
  });
});
