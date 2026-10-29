import type { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import {
  createExecutableActionNode,
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import type { ConfigService } from '@libs/config/config.service';
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

describe('WorkflowMediaProcessingExecutorRegistrarService brandCover', () => {
  const context = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'workflow-1',
    workflowVersionId: 'version-1',
  };

  function registerBrandCover() {
    const config: Record<string, unknown> = {
      brandId: 'brand-1',
      placement: 'top-left',
      title: 'Configured title',
      variant: 'live',
      width: 3840,
    };
    const helper = {
      extractIngredientId: (value: unknown) =>
        typeof value === 'string' ? value : undefined,
      getOptionalNumberConfig: (
        source: Record<string, unknown>,
        key: string,
        fallback: number,
      ) => (typeof source[key] === 'number' ? source[key] : fallback),
      getOptionalStringInput: (inputs: Map<string, unknown>, key: string) => {
        const value = inputs.get(key);
        return typeof value === 'string' && value ? value : undefined;
      },
      getRequiredBrandId: () => 'brand-1',
      readConfigString: (source: Record<string, unknown>, key: string) =>
        typeof source[key] === 'string' ? source[key] : undefined,
      wrapEngineExecutor,
    } as unknown as WorkflowEngineExecutorHelperService;
    const files = {
      generateThumbnail: vi
        .fn()
        .mockResolvedValue({ thumbnailUrl: 'https://cdn/cover.jpg' }),
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://cdn/in.png'),
    };
    const brandCoverStyle = {
      resolveCoverStyle: vi.fn().mockResolvedValue({
        signature: { opacity: 1, position: 'top-right', text: 'SSS' },
        title: { accentColor: '#E83B3B', color: '#FFFFFF' },
      }),
    };
    const engine = new WorkflowEngine();
    new WorkflowMediaProcessingExecutorRegistrarService(
      helper,
      { isAuthorizedMediaDeliveryEnabled: false } as never,
      undefined,
      undefined,
      undefined,
      files as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      brandCoverStyle as never,
    ).register(engine);
    return { brandCoverStyle, config, engine, files };
  }

  it('covers the source image with the brand title style, signature and configured placement', async () => {
    const { brandCoverStyle, config, engine, files } = registerBrandCover();

    const result = await getActionExecutor(engine, 'brandCover')?.(
      {
        config,
        id: 'cover-1',
        inputs: [],
        label: 'Cover',
        type: 'brandCover',
      },
      new Map([['image', 'image-asset']]),
      context,
    );

    expect(result).toEqual({
      id: 'image-asset',
      image: 'https://cdn/cover.jpg',
      status: 'generated',
    });
    expect(brandCoverStyle.resolveCoverStyle).toHaveBeenCalledWith(
      'brand-1',
      'org-1',
      'live',
    );
    expect(files.generateThumbnail).toHaveBeenCalledWith(
      'https://cdn/in.png',
      'image-asset',
      0,
      3840,
      'Configured title',
      true,
      {
        signature: { opacity: 1, position: 'top-right', text: 'SSS' },
        title: {
          accentColor: '#E83B3B',
          color: '#FFFFFF',
          placement: 'top-left',
        },
      },
    );
  });

  it('prefers a title wired in from an upstream node over the configured one', async () => {
    const { config, engine, files } = registerBrandCover();

    await getActionExecutor(engine, 'brandCover')?.(
      {
        config,
        id: 'cover-1',
        inputs: [],
        label: 'Cover',
        type: 'brandCover',
      },
      new Map([
        ['image', 'image-asset'],
        ['title', 'Wired title'],
      ]),
      context,
    );

    expect(files.generateThumbnail.mock.calls[0]?.[4]).toBe('Wired title');
  });

  it('takes the cover frame from a source video at the configured second', async () => {
    const { config, engine, files } = registerBrandCover();

    await getActionExecutor(engine, 'brandCover')?.(
      {
        config: { ...config, timestampSeconds: 12 },
        id: 'cover-1',
        inputs: [],
        label: 'Cover',
        type: 'brandCover',
      },
      new Map([['video', 'video-asset']]),
      context,
    );

    expect(files.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'video-asset',
      'videos',
    );
    expect(files.generateThumbnail.mock.calls[0]?.[1]).toBe('video-asset');
    expect(files.generateThumbnail.mock.calls[0]?.[2]).toBe(12);
  });

  it('rejects a cover without a source image ingredient', async () => {
    const { config, engine } = registerBrandCover();

    await expect(
      getActionExecutor(engine, 'brandCover')?.(
        {
          config,
          id: 'cover-1',
          inputs: [],
          label: 'Cover',
          type: 'brandCover',
        },
        new Map(),
        context,
      ),
    ).rejects.toThrow('brandCover requires a source image or video ingredient');
  });
});

describe('WorkflowMediaProcessingExecutorRegistrarService', () => {
  it('rejects an activated overlay issuer denial before fetching media or invoking files processing', async () => {
    const helper = {
      requireMediaAsset: vi.fn(async (value: unknown) => ({
        id: String(value),
        brandId: 'brand-1',
        category: 'video',
        storageKey: 'stale-key',
        storageType: 'videos',
      })),
      extractMusicIngredientId: () => undefined,
      readConfigString: () => undefined,
      createWorkflowOutputIngredient: vi.fn().mockResolvedValue({
        ingredientId: 'output-1',
        metadataId: 'metadata-1',
      }),
      patchIngredient: vi.fn().mockResolvedValue(undefined),
      wrapEngineExecutor,
    } as unknown as WorkflowEngineExecutorHelperService;
    const issuer = {
      issueServerPublish: vi
        .fn()
        .mockRejectedValue(new Error('Scoped media unavailable')),
    };
    const files = { audioOverlay: vi.fn(), getPresignedDownloadUrl: vi.fn() };
    const engine = new WorkflowEngine();
    new WorkflowMediaProcessingExecutorRegistrarService(
      helper,
      { isAuthorizedMediaDeliveryEnabled: true } as never,
      undefined,
      undefined,
      undefined,
      files as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      issuer as never,
    ).register(engine);
    await expect(
      getActionExecutor(engine, 'soundOverlay')?.(
        {
          config: {},
          id: 'overlay-1',
          inputs: [],
          label: 'Overlay',
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
    ).rejects.toThrow('Scoped media unavailable');
    expect(files.getPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(files.audioOverlay).not.toHaveBeenCalled();
    expect(issuer.issueServerPublish).toHaveBeenCalledWith('org-1', [
      'video-asset',
    ]);
  });

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

  describe('avatar submission intent', () => {
    it.each(['submission transport lost', 'accepted identity write failed'])(
      'does not convert %s into confirmed provider failure',
      async (message) => {
        const accepted = message === 'accepted identity write failed';
        const helper = {
          createProviderContinuation: vi
            .fn()
            .mockResolvedValue({ continuationId: 'continuation-1' }),
          failProviderContinuationSubmission: vi.fn(),
          getAspectRatioConfig: () => undefined,
          getOptionalStringInput: () => undefined,
          getRequiredStringInput: () => 'script',
          markProviderContinuationSubmitted: accepted
            ? vi.fn().mockRejectedValue(new Error(message))
            : vi.fn(),
          readConfigString: () => undefined,
          wrapEngineExecutor,
        };
        const avatar = {
          generateAvatarVideo: vi.fn(
            async (
              _input: unknown,
              _context: unknown,
              beforeSubmit: (ingredientId: string) => Promise<void>,
            ) => {
              await beforeSubmit('ingredient-1');
              if (!accepted) throw new Error(message);
              return {
                externalId: 'accepted-job',
                ingredientId: 'ingredient-1',
                status: 'PROCESSING',
              };
            },
          ),
        };
        const engine = new WorkflowEngine();
        new WorkflowMediaProcessingExecutorRegistrarService(
          helper as unknown as WorkflowEngineExecutorHelperService,
          { get: vi.fn() } as unknown as ConfigService,
          avatar as unknown as AvatarVideoGenerationService,
        ).register(engine);
        await expect(
          getActionExecutor(engine, 'aiAvatarVideo')?.(
            {
              config: {},
              id: 'avatar-1',
              inputs: [],
              label: 'Avatar',
              type: 'aiAvatarVideo',
            },
            new Map(),
            {
              organizationId: 'org-1',
              runId: 'run-1',
              userId: 'user-1',
              workflowId: 'workflow-1',
              workflowVersionId: 'version-1',
            },
          ),
        ).rejects.toThrow(message);
        expect(helper.createProviderContinuation).toHaveBeenCalledOnce();
        expect(
          helper.failProviderContinuationSubmission,
        ).not.toHaveBeenCalled();
        if (accepted)
          expect(helper.markProviderContinuationSubmitted).toHaveBeenCalledWith(
            {
              continuationId: 'continuation-1',
              externalId: 'accepted-job',
              organizationId: 'org-1',
            },
          );
      },
    );
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
