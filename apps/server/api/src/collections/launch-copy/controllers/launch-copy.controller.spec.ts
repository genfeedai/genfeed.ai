vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
}));

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f191e810c19729de860eb',
    user: '507f191e810c19729de860ec',
  })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { LaunchCopyController } from '@api/collections/launch-copy/controllers/launch-copy.controller';
import type { GenerateLaunchCopyDto } from '@api/collections/launch-copy/dto/generate-launch-copy.dto';
import { LaunchCopyGeneratorService } from '@api/collections/launch-copy/services/launch-copy-generator.service';
import { Platform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('LaunchCopyController', () => {
  let controller: LaunchCopyController;
  let generatorService: { generate: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  const mockUser = {
    publicMetadata: {
      organization: '507f191e810c19729de860eb',
      user: '507f191e810c19729de860ec',
    },
  } as unknown as User;

  const dto: GenerateLaunchCopyDto = {
    brandId: '507f191e810c19729de860ea',
    channel: Platform.PRODUCT_HUNT,
    description: 'A CLI that lints Postgres migrations',
    productName: 'MigraLint',
  };

  beforeEach(async () => {
    generatorService = { generate: vi.fn() };
    brandsService = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LaunchCopyController],
      providers: [
        { provide: LaunchCopyGeneratorService, useValue: generatorService },
        { provide: BrandsService, useValue: brandsService },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<LaunchCopyController>(LaunchCopyController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('generates copy when the brand is accessible', async () => {
    brandsService.findOne.mockResolvedValue({ _id: dto.brandId });
    generatorService.generate.mockResolvedValue({
      channel: Platform.PRODUCT_HUNT,
      makerComment: 'story',
      taglines: ['a', 'b'],
    });

    const result = await controller.generate(mockUser, dto);

    expect(generatorService.generate).toHaveBeenCalledWith(
      '507f191e810c19729de860eb',
      dto,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it('returns bad request when the brand is not accessible', async () => {
    brandsService.findOne.mockResolvedValue(null);

    const result = await controller.generate(mockUser, dto);

    expect(result).toHaveProperty('errors');
    expect(generatorService.generate).not.toHaveBeenCalled();
  });

  it('returns internal server error when generation throws', async () => {
    brandsService.findOne.mockResolvedValue({ _id: dto.brandId });
    generatorService.generate.mockRejectedValue(new Error('llm down'));

    const result = await controller.generate(mockUser, dto);

    expect(result).toHaveProperty('errors');
  });
});
