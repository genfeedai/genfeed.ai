import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { ContentOptimizationService } from '@api/services/content-optimization/content-optimization.service';
import { ContentOptimizationQueueService } from '@api/services/content-optimization/content-optimization-queue.service';
import type { User } from '@clerk/backend';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

describe('ContentOptimizationController', () => {
  let controller: ContentOptimizationController;

  const mockOptimizationService = {
    analyzePerformance: vi.fn(),
    autoApplySuggestion: vi.fn(),
    generateSuggestions: vi.fn(),
    getRecommendations: vi.fn(),
    optimizePrompt: vi.fn(),
  };

  const mockQueueService = {
    queueAnalysis: vi.fn(),
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
      controllers: [ContentOptimizationController],
      providers: [
        {
          provide: ContentOptimizationService,
          useValue: mockOptimizationService,
        },
        {
          provide: ContentOptimizationQueueService,
          useValue: mockQueueService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContentOptimizationController>(
      ContentOptimizationController,
    );
  });

  it('should expose suggestions endpoint', async () => {
    mockOptimizationService.generateSuggestions.mockResolvedValue([
      {
        category: 'timing',
        confidence: 0.8,
        dataPoints: 10,
        id: 'sug-1',
        suggestion: 'Post between 6PM and 8PM',
      },
    ]);

    const result = await controller.getSuggestions('brand-1', mockUser);

    expect(result).toHaveLength(1);
    expect(mockOptimizationService.generateSuggestions).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
    );
  });

  it('should expose auto-apply endpoint', async () => {
    mockOptimizationService.autoApplySuggestion.mockResolvedValue({
      applied: true,
      suggestionId: 'sug-1',
    });

    const result = await controller.autoApplySuggestion('brand-1', mockUser, {
      suggestionId: 'sug-1',
    });

    expect(result).toEqual({
      applied: true,
      suggestionId: 'sug-1',
    });
  });

  it('should call analyzePerformance with date range and topN', async () => {
    mockOptimizationService.analyzePerformance.mockResolvedValue({
      insights: [],
    });

    await controller.getAnalysis(
      'brand-1',
      mockUser,
      '2026-01-01',
      '2026-02-01',
      '5',
    );

    expect(mockOptimizationService.analyzePerformance).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
      { endDate: '2026-02-01', startDate: '2026-01-01', topN: 5 },
    );
  });

  it('should call optimizePrompt with prompt text', async () => {
    mockOptimizationService.optimizePrompt.mockResolvedValue({
      optimizedPrompt: 'better prompt',
    });

    const result = await controller.optimizePrompt('brand-1', mockUser, {
      prompt: 'original prompt',
    });

    expect(mockOptimizationService.optimizePrompt).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
      'original prompt',
    );
    expect(result).toEqual({ optimizedPrompt: 'better prompt' });
  });

  it('should call getRecommendations', async () => {
    mockOptimizationService.getRecommendations.mockResolvedValue([
      { action: 'post more reels' },
    ]);

    const result = await controller.getRecommendations('brand-1', mockUser);

    expect(mockOptimizationService.getRecommendations).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
    );
    expect(result).toHaveLength(1);
  });

  it('should trigger optimization and return queued status', async () => {
    mockQueueService.queueAnalysis.mockResolvedValue('job-123');

    const result = await controller.triggerOptimization('brand-1', mockUser);

    expect(mockQueueService.queueAnalysis).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      'brand-1',
    );
    expect(result).toEqual({ jobId: 'job-123', status: 'queued' });
  });
});
