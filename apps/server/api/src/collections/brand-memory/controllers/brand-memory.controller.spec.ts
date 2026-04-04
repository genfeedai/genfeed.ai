import { BrandMemoryController } from '@api/collections/brand-memory/controllers/brand-memory.controller';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

describe('BrandMemoryController', () => {
  let controller: BrandMemoryController;

  const mockBrandMemoryService = {
    distillLongTermMemory: vi.fn(),
    getInsights: vi.fn(),
    getMemory: vi.fn(),
  };

  const mockUser = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandMemoryController],
      providers: [
        {
          provide: BrandMemoryService,
          useValue: mockBrandMemoryService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BrandMemoryController>(BrandMemoryController);
  });

  it('should return memory range', async () => {
    mockBrandMemoryService.getMemory.mockResolvedValue([{ date: new Date() }]);
    const mockReq = { headers: {}, originalUrl: '/brand-memory' } as never;

    await controller.getMemory(
      mockReq,
      'brand-1',
      mockUser,
      '2026-02-01T00:00:00.000Z',
      '2026-02-25T00:00:00.000Z',
    );

    expect(mockBrandMemoryService.getMemory).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
      {
        from: new Date('2026-02-01T00:00:00.000Z'),
        to: new Date('2026-02-25T00:00:00.000Z'),
      },
    );
  });

  it('should return insights list', async () => {
    mockBrandMemoryService.getInsights.mockResolvedValue([
      { category: 'timing', insight: 'Evenings win' },
    ]);
    const mockReq = {
      headers: {},
      originalUrl: '/brand-memory/insights',
    } as never;

    await controller.getInsights(mockReq, 'brand-1', mockUser, '5');

    expect(mockBrandMemoryService.getInsights).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
      5,
    );
  });

  it('should trigger distillation', async () => {
    mockBrandMemoryService.distillLongTermMemory.mockResolvedValue([
      { category: 'format', confidence: 0.87 },
    ]);

    const result = await controller.distillMemory('brand-1', mockUser);

    expect(result).toEqual({
      insights: [{ category: 'format', confidence: 0.87 }],
      status: 'completed',
    });
  });
});
