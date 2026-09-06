import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { WorkflowEngine } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));

describe('WorkflowMediaProcessingExecutorRegistrarService', () => {
  it('rejects a sound overlay whose soundtrack asset belongs to a different brand than the video', async () => {
    const requireMediaAsset = vi.fn(async (value: unknown) => {
      if (value === 'video-asset') {
        return {
          brandId: 'brand-1',
          category: 'video',
          id: 'video-asset',
          storageKey: 'video-key',
          storageType: 'videos',
        };
      }
      if (value === 'sound-asset') {
        return {
          brandId: 'brand-2',
          category: 'music',
          id: 'sound-asset',
          storageKey: 'sound-key',
          storageType: 'musics',
        };
      }
      throw new Error(`Unexpected media reference: ${String(value)}`);
    });
    const helper = {
      extractMusicIngredientId: () => undefined,
      readConfigString: () => undefined,
      requireMediaAsset,
    } as unknown as WorkflowEngineExecutorHelperService;
    const files = { audioOverlay: vi.fn(), getPresignedDownloadUrl: vi.fn() };
    const engine = new WorkflowEngine();

    new WorkflowMediaProcessingExecutorRegistrarService(
      helper,
      { get: vi.fn() } as never,
      undefined,
      undefined,
      undefined,
      files as never,
    ).register(engine);

    const executor = engine.getExecutor('soundOverlay');
    await expect(
      executor?.(
        {
          config: {},
          id: 'sound-overlay-1',
          inputs: [],
          label: 'Sound overlay',
          type: 'soundOverlay',
        },
        new Map([
          ['videoUrl', 'video-asset'],
          ['soundUrl', 'sound-asset'],
        ]),
        {
          organizationId: 'org-1',
          runId: 'run-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          workflowVersionId: 'version-1',
        },
      ),
    ).rejects.toThrow('Soundtrack brand must match the source video');

    expect(files.getPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(files.audioOverlay).not.toHaveBeenCalled();
  });
});
