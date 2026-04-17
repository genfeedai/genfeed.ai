import { CustomersService } from '@api/collections/customers/services/customers.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let mockModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockLoggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockModel = {
      aggregate: vi.fn().mockResolvedValue([]),
      aggregatePaginate: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      countDocuments: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      }),
      findById: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    };
    mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new CustomersService(
      mockModel as never,
      mockLoggerService as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findByOrganizationId queries with ObjectId', async () => {
    const orgId = new Types.ObjectId().toString();
    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ _id: 'cust-1', organization: orgId }),
    });
    const result = await service.findByOrganizationId(orgId);
    expect(mockModel.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      organization: expect.any(Types.ObjectId),
    });
    expect(result).toBeDefined();
  });

  it('findByOrganizationId returns null when not found', async () => {
    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });
    const result = await service.findByOrganizationId(
      new Types.ObjectId().toString(),
    );
    expect(result).toBeNull();
  });

  it('findByStripeCustomerId queries by stripe customer id', async () => {
    const customer = { _id: 'cust-1', stripeCustomerId: 'cus_abc' };
    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(customer),
    });
    const result = await service.findByStripeCustomerId('cus_abc');
    expect(mockModel.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      stripeCustomerId: 'cus_abc',
    });
    expect(result).toEqual(customer);
  });

  it('findByStripeCustomerId returns null when not found', async () => {
    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });
    const result = await service.findByStripeCustomerId('cus_nonexistent');
    expect(result).toBeNull();
  });

  it('extends BaseService with logger', () => {
    expect(service.logger).toBeDefined();
  });

  it('has access to the model', () => {
    expect(service).toHaveProperty('model');
  });

  it('findByOrganizationId converts string to ObjectId', async () => {
    const orgId = '507f1f77bcf86cd799439011';
    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });
    await service.findByOrganizationId(orgId);
    const callArg = mockModel.findOne.mock.calls[0][0];
    expect(callArg.organization).toBeInstanceOf(Types.ObjectId);
    expect(callArg.organization.toString()).toBe(orgId);
  });

  it('findByStripeCustomerId does not convert id to ObjectId', async () => {
    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });
    await service.findByStripeCustomerId('cus_xyz');
    const callArg = mockModel.findOne.mock.calls[0][0];
    expect(typeof callArg.stripeCustomerId).toBe('string');
  });
});
