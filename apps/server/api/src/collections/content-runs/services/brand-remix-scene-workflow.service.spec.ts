import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { describe, expect, it, vi } from 'vitest';
import { BrandRemixSceneWorkflowService } from './brand-remix-scene-workflow.service';

vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-analysis.service',
  () => ({ BrandRemixSceneAnalysisService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-generation.service',
  () => ({ BrandRemixSceneGenerationService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-assembly.service',
  () => ({ BrandRemixSceneAssemblyService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-source.service',
  () => ({ BrandRemixSceneSourceService: class {} }),
);
vi.mock(
  '@api/collections/workflows/services/workflow-execution-queue.service',
  () => ({ WorkflowExecutionQueueService: class {} }),
);
vi.mock('@api/collections/workflows/system-workflow-runner.service', () => ({
  SystemWorkflowRunnerService: class {},
}));

describe('scene workflow registration', () => {
  it('registers the hidden scene step action and workflow', () => {
    const runner = { registerAction: vi.fn(), registerWorkflow: vi.fn() };
    const service = new BrandRemixSceneWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runner as unknown as SystemWorkflowRunnerService,
    );
    service.onModuleInit();
    expect(runner.registerAction).toHaveBeenCalledWith(
      'brand-remix.scene-step',
      expect.any(Function),
    );
    expect(runner.registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'brand-remix.scene-step' }),
    );
  });
});
