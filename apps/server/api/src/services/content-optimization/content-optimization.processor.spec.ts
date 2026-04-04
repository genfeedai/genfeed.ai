import { ContentOptimizationProcessor } from '@api/services/content-optimization/content-optimization.processor';
import { ContentOptimizationService } from '@api/services/content-optimization/content-optimization.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentOptimizationProcessor', () => {
  let processor: ContentOptimizationProcessor;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockContentOptimizationService: {
    analyzePerformance: ReturnType<typeof vi.fn>;
    optimizePrompt: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockContentOptimizationService = {
      analyzePerformance: vi.fn().mockResolvedValue({ score: 85 }),
      optimizePrompt: vi.fn().mockResolvedValue({ optimized: 'Better prompt' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentOptimizationProcessor,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: ContentOptimizationService,
          useValue: mockContentOptimizationService,
        },
      ],
    }).compile();

    processor = module.get<ContentOptimizationProcessor>(
      ContentOptimizationProcessor,
    );
  });

  describe('process', () => {
    it('should handle analyze type job successfully', async () => {
      const job = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'analyze',
        },
        id: 'job-1',
        name: 'analyze',
      } as Job<any>;

      const result = await processor.process(job);

      expect(result).toEqual({ score: 85 });
      expect(
        mockContentOptimizationService.analyzePerformance,
      ).toHaveBeenCalledWith('org-1', 'brand-1');
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('starting'),
        expect.any(Object),
      );
    });

    it('should handle optimize-prompt type job successfully', async () => {
      const job = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          prompt: 'Original prompt',
          type: 'optimize-prompt',
        },
        id: 'job-2',
        name: 'optimize-prompt',
      } as Job<any>;

      const result = await processor.process(job);

      expect(result).toEqual({ optimized: 'Better prompt' });
      expect(
        mockContentOptimizationService.optimizePrompt,
      ).toHaveBeenCalledWith('org-1', 'brand-1', 'Original prompt');
    });

    it('should throw error for optimize-prompt without prompt', async () => {
      const job = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'optimize-prompt',
        },
        id: 'job-3',
        name: 'optimize-prompt',
      } as Job<any>;

      await expect(processor.process(job)).rejects.toThrow(
        'Prompt is required for optimize-prompt jobs',
      );
    });

    it('should throw error for unknown job type', async () => {
      const job = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'unknown' as any,
        },
        id: 'job-4',
        name: 'unknown',
      } as Job<any>;

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown content-optimization job type: unknown',
      );
    });

    it('should reset consecutive failures on success', async () => {
      // Simulate a failure first
      const failJob = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'analyze',
        },
        id: 'job-fail',
        name: 'analyze',
      } as Job<any>;

      mockContentOptimizationService.analyzePerformance.mockRejectedValueOnce(
        new Error('Service error'),
      );

      await expect(processor.process(failJob)).rejects.toThrow('Service error');

      // Then succeed
      mockContentOptimizationService.analyzePerformance.mockResolvedValueOnce({
        score: 90,
      });

      const successJob = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'analyze',
        },
        id: 'job-success',
        name: 'analyze',
      } as Job<any>;

      const result = await processor.process(successJob);

      expect(result).toEqual({ score: 90 });
    });

    it('should open circuit breaker after max consecutive failures', async () => {
      mockContentOptimizationService.analyzePerformance.mockRejectedValue(
        new Error('Persistent error'),
      );

      const job = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'analyze',
        },
        id: 'job-fail',
        name: 'analyze',
      } as Job<any>;

      // Trigger 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        await expect(processor.process(job)).rejects.toThrow(
          'Persistent error',
        );
      }

      // 6th call should hit circuit breaker
      await expect(processor.process(job)).rejects.toThrow(
        'Circuit breaker open',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('circuit OPEN'),
        expect.any(Error),
      );
    });

    it('should transition circuit from open to half-open after reset time', async () => {
      vi.useFakeTimers();

      mockContentOptimizationService.analyzePerformance.mockRejectedValue(
        new Error('Persistent error'),
      );

      const job = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'analyze',
        },
        id: 'job-fail',
        name: 'analyze',
      } as Job<any>;

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(processor.process(job)).rejects.toThrow(
          'Persistent error',
        );
      }

      // Circuit should be open
      await expect(processor.process(job)).rejects.toThrow(
        'Circuit breaker open',
      );

      // Advance time past reset window (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Circuit should transition to half-open and retry
      mockContentOptimizationService.analyzePerformance.mockResolvedValueOnce({
        score: 95,
      });

      const result = await processor.process(job);

      expect(result).toEqual({ score: 95 });
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('circuit half-open'),
      );

      vi.useRealTimers();
    });

    it('should log completed event with correct data', async () => {
      const job = {
        data: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          type: 'analyze',
        },
        id: 'job-log',
        name: 'analyze',
      } as Job<any>;

      await processor.process(job);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
        expect.objectContaining({
          brandId: 'brand-1',
          type: 'analyze',
        }),
      );
    });
  });
});
