import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import {
  createExecutableActionNode,
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));

const wrapEngineExecutor =
  (executor: INodeExecutor) =>
  async (...args: Parameters<NodeExecutor>) =>
    (
      await executor.execute({
        context: args[2],
        inputs: args[1],
        node: args[0],
      })
    ).data;

function getActionExecutor(
  engine: WorkflowEngine,
  actionId: string,
): NodeExecutor | undefined {
  const executor = engine.getExecutor('genfeedAction');
  return executor
    ? (node, inputs, context) =>
        executor(
          createExecutableActionNode({
            actionId,
            id: node.id,
            label: node.label,
            parameters: node.config,
          }),
          inputs,
          context,
        )
    : undefined;
}

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
      wrapEngineExecutor,
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

    await expect(
      getActionExecutor(engine, 'soundOverlay')?.(
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

  describe('videoQa continuity references', () => {
    const executionContext = {
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'workflow-1',
      workflowVersionId: 'version-1',
    };
    const healthyInspection = {
      contactSheetUrl: 'https://cdn.example/sheet.png',
      decodeOk: true,
      detectLog: '',
      loudnessLog: `
[Parsed_ebur128_0 @ 0x7fa] Summary:

  Integrated loudness:
    I:         -16.1 LUFS
    Threshold: -26.2 LUFS
`,
      probeJson: JSON.stringify({
        format: { duration: '8.000000' },
        streams: [
          {
            avg_frame_rate: '30/1',
            codec_name: 'h264',
            codec_type: 'video',
            height: 1080,
            r_frame_rate: '30/1',
            width: 1920,
          },
          { channels: 2, codec_name: 'aac', codec_type: 'audio' },
        ],
      }),
    };

    function createVideoQaHarness(options?: {
      requireMediaAsset?: ReturnType<typeof vi.fn>;
    }) {
      const requireMediaAsset =
        options?.requireMediaAsset ??
        vi.fn(async (value: unknown) => ({
          brandId: 'brand-1',
          category: 'IMAGE',
          id: String(value),
          storageKey: `${String(value)}.png`,
          storageType: 'images',
        }));
      const helper = {
        buildMediaIngredientUrl: (ingredientId: string) =>
          `https://api.test/images/${ingredientId}`,
        requireMediaAsset,
        wrapEngineExecutor,
      } as unknown as WorkflowEngineExecutorHelperService;
      const files = {
        getPresignedDownloadUrl: vi
          .fn()
          .mockImplementation(async (key: string) => `https://cdn.test/${key}`),
        inspectVideoQa: vi.fn().mockResolvedValue(healthyInspection),
      };
      const continuityResolver = {
        resolve: vi.fn().mockResolvedValue({
          finding: {
            character: {
              confidence: 1,
              summary: 'Consistent.',
              verdict: 'consistent',
            },
            clipId: 'clip-1',
            clipIndex: 0,
            errors: [],
            evidenceFrames: [],
            outfit: {
              confidence: 1,
              summary: 'Consistent.',
              verdict: 'consistent',
            },
            product: {
              confidence: null,
              summary: 'Not assessed.',
              verdict: 'not_assessed',
            },
            videoUrl: 'https://cdn.example/clip.mp4',
          },
          modelKey: 'openai/vision',
        }),
      };
      const engine = new WorkflowEngine();
      new WorkflowMediaProcessingExecutorRegistrarService(
        helper,
        { get: vi.fn() } as never,
        undefined,
        undefined,
        undefined,
        files as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        continuityResolver as never,
      ).register(engine);

      return { continuityResolver, engine, files, requireMediaAsset };
    }

    it('resolves locked character ingredient ids to reachable image URLs', async () => {
      const { continuityResolver, engine, files, requireMediaAsset } =
        createVideoQaHarness();

      await getActionExecutor(engine, 'videoQa')?.(
        {
          config: {
            characterReferenceUrls: ['character-1'],
            isContinuityQaEnabled: true,
            productReferenceUrls: ['product-1'],
          },
          id: 'video-qa-1',
          inputs: [],
          label: 'Segment 1 Continuity QA',
          type: 'videoQa',
        },
        new Map([['video', 'https://cdn.example/clip.mp4']]),
        executionContext,
      );

      expect(requireMediaAsset).toHaveBeenCalledWith(
        'character-1',
        'org-1',
        expect.arrayContaining(['IMAGE', 'AVATAR']),
      );
      expect(files.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'character-1.png',
        'images',
      );
      expect(continuityResolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          characterReferenceUrls: ['https://cdn.test/character-1.png'],
          productReferenceUrls: ['https://cdn.test/product-1.png'],
        }),
      );
    });

    it('skips with canonical_references_unavailable when locked refs cannot be resolved', async () => {
      const { continuityResolver, engine } = createVideoQaHarness({
        requireMediaAsset: vi.fn(async () => {
          throw new Error('unavailable');
        }),
      });

      const output = await getActionExecutor(engine, 'videoQa')?.(
        {
          config: {
            characterReferenceUrls: ['character-1'],
            isContinuityQaEnabled: true,
          },
          id: 'video-qa-1',
          inputs: [],
          label: 'Segment 1 Continuity QA',
          type: 'videoQa',
        },
        new Map([['video', 'https://cdn.example/clip.mp4']]),
        executionContext,
      );

      expect(continuityResolver.resolve).not.toHaveBeenCalled();
      expect(output).toMatchObject({
        continuityQa: {
          clips: [],
          skipReason: 'canonical_references_unavailable',
          status: 'skipped',
        },
      });
      expect(
        (
          output as {
            continuityQa?: {
              clips?: Array<{ character?: { verdict?: string } }>;
            };
          }
        ).continuityQa?.clips?.some(
          (clip) => clip.character?.verdict === 'consistent',
        ),
      ).toBeFalsy();
    });
  });
});
