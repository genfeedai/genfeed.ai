import type {
  CampaignMemoryExtractionJobData,
  OrchestratorRunJobData,
  TriggerEvaluationJobData,
} from '@genfeedai/queue-contracts';
import { CampaignMemoryProcessor } from '@workers/processors/api/services/agent-campaign/campaign-memory.processor';
import { OrchestratorProcessor } from '@workers/processors/api/services/agent-campaign/orchestrator.processor';
import { TriggerEvaluatorProcessor } from '@workers/processors/api/services/agent-campaign/trigger-evaluator.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const jobData = {
  campaignId: 'campaign-1',
  organizationId: 'org-1',
  scheduledAt: '2026-08-09T00:00:00.000Z',
  userId: 'user-1',
};

function buildJob<T>(): Job<T> {
  return { data: jobData, name: 'scheduled' } as unknown as Job<T>;
}

describe('agent-campaign processors', () => {
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    logger = { error: vi.fn(), log: vi.fn() };
  });

  describe('CampaignMemoryProcessor', () => {
    it('extracts winner patterns for the campaign', async () => {
      const contentEngineService = {
        extractWinnerPatterns: vi.fn().mockResolvedValue({
          extractedCount: 2,
          memoryId: 'memory-1',
          skippedReason: undefined,
        }),
      };
      const processor = new CampaignMemoryProcessor(
        logger as never,
        contentEngineService as never,
      );

      const result = await processor.process(
        buildJob<CampaignMemoryExtractionJobData>(),
      );

      expect(contentEngineService.extractWinnerPatterns).toHaveBeenCalledWith(
        'campaign-1',
        'org-1',
      );
      expect(result).toEqual({
        extractedCount: 2,
        memoryId: 'memory-1',
        skippedReason: undefined,
      });
    });

    it('logs and rethrows extraction failures', async () => {
      const contentEngineService = {
        extractWinnerPatterns: vi
          .fn()
          .mockRejectedValue(new Error('extraction failed')),
      };
      const processor = new CampaignMemoryProcessor(
        logger as never,
        contentEngineService as never,
      );

      await expect(
        processor.process(buildJob<CampaignMemoryExtractionJobData>()),
      ).rejects.toThrow('extraction failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('OrchestratorProcessor', () => {
    it('runs the orchestration cycle for the campaign', async () => {
      const contentEngineService = {
        runOrchestrationCycle: vi.fn().mockResolvedValue({
          dispatchCount: 3,
          nextOrchestratedAt: new Date('2026-08-10T00:00:00.000Z'),
        }),
      };
      const processor = new OrchestratorProcessor(
        logger as never,
        contentEngineService as never,
      );

      const result = await processor.process(
        buildJob<OrchestratorRunJobData>(),
      );

      expect(contentEngineService.runOrchestrationCycle).toHaveBeenCalledWith(
        'campaign-1',
        'org-1',
      );
      expect(result).toMatchObject({ dispatchCount: 3 });
    });

    it('handles a cycle result without a next orchestration date', async () => {
      const contentEngineService = {
        runOrchestrationCycle: vi.fn().mockResolvedValue({
          dispatchCount: 0,
          nextOrchestratedAt: undefined,
        }),
      };
      const processor = new OrchestratorProcessor(
        logger as never,
        contentEngineService as never,
      );

      await processor.process(buildJob<OrchestratorRunJobData>());

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs and rethrows orchestration failures', async () => {
      const contentEngineService = {
        runOrchestrationCycle: vi
          .fn()
          .mockRejectedValue(new Error('cycle failed')),
      };
      const processor = new OrchestratorProcessor(
        logger as never,
        contentEngineService as never,
      );

      await expect(
        processor.process(buildJob<OrchestratorRunJobData>()),
      ).rejects.toThrow('cycle failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('TriggerEvaluatorProcessor', () => {
    it('evaluates campaign triggers', async () => {
      const triggerEvaluatorService = {
        evaluateCampaign: vi.fn().mockResolvedValue({
          dispatchCount: 1,
          dispatchedTriggerTypes: ['viral_moment'],
        }),
      };
      const processor = new TriggerEvaluatorProcessor(
        logger as never,
        triggerEvaluatorService as never,
      );

      const result = await processor.process(
        buildJob<TriggerEvaluationJobData>(),
      );

      expect(triggerEvaluatorService.evaluateCampaign).toHaveBeenCalledWith(
        'campaign-1',
        'org-1',
      );
      expect(result).toMatchObject({ dispatchCount: 1 });
    });

    it('logs and rethrows evaluation failures', async () => {
      const triggerEvaluatorService = {
        evaluateCampaign: vi
          .fn()
          .mockRejectedValue(new Error('evaluation failed')),
      };
      const processor = new TriggerEvaluatorProcessor(
        logger as never,
        triggerEvaluatorService as never,
      );

      await expect(
        processor.process(buildJob<TriggerEvaluationJobData>()),
      ).rejects.toThrow('evaluation failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
