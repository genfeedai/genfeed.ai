import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AbTestSuggestionHarnessService } from '@api/services/content-optimization/ab-test-suggestion-harness.service';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { ContentOptimizationService } from '@api/services/content-optimization/content-optimization.service';
import { ContentOptimizationQueueService } from '@api/services/content-optimization/content-optimization-queue.service';
import { testId } from '@helpers/testing/test-id.helper';
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

  const mockAbTestHarness = {
    executeSuggestion: vi.fn(),
    resolveOutcomes: vi.fn(),
  };

  const organizationId = testId('org');

  const mockUser = {
    organizationId,
    userId: testId('user'),
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
        {
          provide: AbTestSuggestionHarnessService,
          useValue: mockAbTestHarness,
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
      organizationId,
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
      organizationId,
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
      organizationId,
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
      organizationId,
      'brand-1',
    );
    expect(result).toHaveLength(1);
  });

  it('should execute an A/B suggestion as attributed arms', async () => {
    mockAbTestHarness.executeSuggestion.mockResolvedValue({
      armCount: 2,
      groupId: 'group-1',
      postIds: ['post-a', 'post-b'],
      suggestionId: 'sug-1',
    });

    const result = await controller.executeAbTest('brand-1', mockUser, {
      hypothesis: 'Question hooks win',
      platform: 'instagram',
      suggestionId: 'sug-1',
      variable: 'hook_style',
      variantA: 'A',
      variantB: 'B',
    });

    expect(mockAbTestHarness.executeSuggestion).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId,
      suggestion: {
        hypothesis: 'Question hooks win',
        platform: 'instagram',
        suggestionId: 'sug-1',
        variable: 'hook_style',
        variantA: 'A',
        variantB: 'B',
      },
      userId: mockUser.userId,
    });
    expect(result.armCount).toBe(2);
  });

  it('should trigger optimization and return queued status', async () => {
    mockQueueService.queueAnalysis.mockResolvedValue('job-123');

    const result = await controller.triggerOptimization('brand-1', mockUser);

    expect(mockQueueService.queueAnalysis).toHaveBeenCalledWith(
      organizationId,
      'brand-1',
    );
    expect(result).toEqual({ jobId: 'job-123', status: 'queued' });
  });
});
