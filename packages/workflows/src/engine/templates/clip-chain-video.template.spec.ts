import { describe, expect, it, vi } from 'vitest';
import { WorkflowEngine } from '../execution/engine';
import {
  createVideoQaExecutor,
  type VideoQaContinuityResolver,
  type VideoQaProcessor,
} from '../executors/saas/video-qa-executor';
import { createVideoStitchExecutor } from '../executors/saas/video-stitch-executor';
import type { ExecutableWorkflow } from '../types';
import { DEFAULT_CREDIT_COSTS } from '../utils/credit-calculator';
import {
  buildClipChainIdentityReferences,
  buildClipChainVideoTemplate,
  buildVideoExtensionTemplate,
  CLIP_CHAIN_VIDEO_TEMPLATE,
  composeClipChainSegmentPrompt,
  createClipChainWorkflowInstance,
  DEFAULT_CLIP_CHAIN_SEGMENT_COUNT,
  estimateClipChainCredits,
} from './clip-chain-video.template';
import { getAvailableTemplates, getTemplateById } from './index';

function toExecutableWorkflow(
  template: typeof CLIP_CHAIN_VIDEO_TEMPLATE,
): ExecutableWorkflow {
  return {
    edges: template.edges,
    id: template.id,
    lockedNodeIds: [],
    nodes: template.nodes,
    organizationId: 'org-1',
    userId: 'user-1',
    versionId: 'version-1',
  };
}

function isActionNode(
  node: (typeof CLIP_CHAIN_VIDEO_TEMPLATE.nodes)[number],
  actionId: string,
): boolean {
  return node.type === 'genfeedAction' && node.config.actionId === actionId;
}

function actionParameters(
  node: (typeof CLIP_CHAIN_VIDEO_TEMPLATE.nodes)[number] | undefined,
): Record<string, unknown> {
  const parameters = node?.config.parameters;
  return parameters !== null &&
    typeof parameters === 'object' &&
    !Array.isArray(parameters)
    ? (parameters as Record<string, unknown>)
    : {};
}

const HEALTHY_QA_PROBE_JSON = JSON.stringify({
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
});

const ON_TARGET_QA_LOUDNESS_LOG = `
[Parsed_ebur128_0 @ 0x7fa] Summary:

  Integrated loudness:
    I:         -16.1 LUFS
    Threshold: -26.2 LUFS
`;

function healthyQaProcessor(): VideoQaProcessor {
  return vi.fn().mockResolvedValue({
    contactSheetUrl: 'https://cdn.example/sheet.png',
    decodeOk: true,
    detectLog: '',
    loudnessLog: ON_TARGET_QA_LOUDNESS_LOG,
    probeJson: HEALTHY_QA_PROBE_JSON,
  });
}

function passthroughVideoQaOutput(videoUrl: string): Record<string, unknown> {
  const report = {
    blackSegments: [],
    contactSheetUrl: null,
    decodeOk: true,
    durationSeconds: 8,
    failures: [],
    frameRate: 30,
    freezeSegments: [],
    height: 1080,
    loudnessDeviation: 0,
    loudnessLufs: -16,
    loudnessTargetLufs: -16,
    passed: true,
    streams: [],
    width: 1920,
  };
  return {
    ...report,
    continuityQa: null,
    report,
    video: videoUrl,
  };
}

function registerPassthroughVideoQa(engine: WorkflowEngine): void {
  engine.registerExecutor('videoQa', async (_node, inputs) => {
    const video = inputs.get('video');
    const videoUrl =
      typeof video === 'string'
        ? video
        : ((video as { videoUrl?: string } | undefined)?.videoUrl ?? '');
    return passthroughVideoQaOutput(videoUrl);
  });
}

function registerContinuityVideoQa(
  engine: WorkflowEngine,
  resolver?: VideoQaContinuityResolver,
): void {
  const executor = createVideoQaExecutor(healthyQaProcessor(), resolver);
  engine.registerExecutor('videoQa', async (node, inputs, context) => {
    const result = await executor.execute({ context, inputs, node });
    return result.data;
  });
}

function consistentFinding(videoUrl: string) {
  return {
    character: {
      confidence: 1,
      summary: 'Consistent.',
      verdict: 'consistent' as const,
    },
    clipId: videoUrl,
    clipIndex: 0,
    errors: [],
    evidenceFrames: [
      { kind: 'contact_sheet' as const, url: 'https://cdn.example/sheet.png' },
    ],
    outfit: {
      confidence: 1,
      summary: 'Consistent.',
      verdict: 'consistent' as const,
    },
    product: {
      confidence: null,
      summary: 'Not assessed.',
      verdict: 'not_assessed' as const,
    },
    videoUrl,
  };
}

function driftFinding(videoUrl: string) {
  return {
    ...consistentFinding(videoUrl),
    character: {
      confidence: 0.2,
      summary: 'A different person.',
      verdict: 'drift' as const,
    },
  };
}

function characterVerdicts(output: unknown): string[] {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    return [];
  }
  const continuityQa = (output as { continuityQa?: unknown }).continuityQa;
  if (
    continuityQa === null ||
    typeof continuityQa !== 'object' ||
    Array.isArray(continuityQa)
  ) {
    return [];
  }
  const clips = (continuityQa as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) {
    return [];
  }
  return clips.flatMap((clip) => {
    if (clip === null || typeof clip !== 'object' || Array.isArray(clip)) {
      return [];
    }
    const verdict = (clip as { character?: { verdict?: unknown } }).character
      ?.verdict;
    return typeof verdict === 'string' ? [verdict] : [];
  });
}

describe('ClipChainVideoTemplate', () => {
  describe('Template Structure', () => {
    it('should have all required metadata', () => {
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.id).toBe('clip-chain-video');
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.name).toBeTruthy();
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.description).toBeTruthy();
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.category).toBe('video-generation');
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.metadata.version).toBeTruthy();
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.metadata.tags).toEqual(
        expect.arrayContaining([
          'clip-chain',
          'last-frame',
          'long-form',
          'start-frame',
          'video',
        ]),
      );
    });

    it('defaults to 3 segments', () => {
      expect(DEFAULT_CLIP_CHAIN_SEGMENT_COUNT).toBe(3);
      const videoGenNodes = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.filter((node) =>
        isActionNode(node, 'videoGen'),
      );
      expect(videoGenNodes).toHaveLength(3);
    });

    it('should have unique node and edge IDs', () => {
      const nodeIds = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.map((node) => node.id);
      const edgeIds = CLIP_CHAIN_VIDEO_TEMPLATE.edges.map((edge) => edge.id);
      expect(new Set(nodeIds).size).toBe(nodeIds.length);
      expect(new Set(edgeIds).size).toBe(edgeIds.length);
    });
  });

  describe('Graph', () => {
    it('gates last-frame extract and stitch on per-segment video QA', () => {
      for (
        let index = 1;
        index < DEFAULT_CLIP_CHAIN_SEGMENT_COUNT;
        index += 1
      ) {
        const videoToQa = CLIP_CHAIN_VIDEO_TEMPLATE.edges.find(
          (edge) =>
            edge.source === `video-gen-${index}` &&
            edge.target === `video-qa-${index}` &&
            edge.sourceHandle === 'videoUrl' &&
            edge.targetHandle === 'video',
        );
        const qaToExtract = CLIP_CHAIN_VIDEO_TEMPLATE.edges.find(
          (edge) =>
            edge.source === `video-qa-${index}` &&
            edge.target === `frame-extract-${index}` &&
            edge.sourceHandle === 'video' &&
            edge.targetHandle === 'video',
        );
        const extractToNext = CLIP_CHAIN_VIDEO_TEMPLATE.edges.find(
          (edge) =>
            edge.source === `frame-extract-${index}` &&
            edge.target === `video-gen-${index + 1}` &&
            edge.sourceHandle === 'last_frame' &&
            edge.targetHandle === 'image',
        );

        expect(videoToQa).toBeDefined();
        expect(qaToExtract).toBeDefined();
        expect(extractToNext).toBeDefined();
      }
    });

    it('extracts the last frame of every segment including the last', () => {
      const extractNodes = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.filter((node) =>
        isActionNode(node, 'videoFrameExtract'),
      );
      expect(extractNodes).toHaveLength(DEFAULT_CLIP_CHAIN_SEGMENT_COUNT);
      for (const extractNode of extractNodes) {
        expect(actionParameters(extractNode).selectionMode).toBe('last');
      }
    });

    it('routes every videoQa output into videoStitch', () => {
      const stitchNode = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.find(
        (node) => node.id === 'video-stitch-1',
      );
      expect(stitchNode?.type).toBe('genfeedAction');
      expect(stitchNode?.config.actionId).toBe('videoStitch');
      expect(actionParameters(stitchNode).transitionType).toBe('cut');

      for (
        let index = 1;
        index <= DEFAULT_CLIP_CHAIN_SEGMENT_COUNT;
        index += 1
      ) {
        const stitchEdge = CLIP_CHAIN_VIDEO_TEMPLATE.edges.find(
          (edge) =>
            edge.source === `video-qa-${index}` &&
            edge.target === 'video-stitch-1' &&
            edge.sourceHandle === 'video' &&
            edge.targetHandle === 'videos',
        );
        expect(stitchEdge).toBeDefined();
      }
    });

    it('enables continuity QA without a character gate on the catalog original', () => {
      const qaNodes = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.filter((node) =>
        isActionNode(node, 'videoQa'),
      );
      expect(qaNodes).toHaveLength(DEFAULT_CLIP_CHAIN_SEGMENT_COUNT);
      for (const qaNode of qaNodes) {
        expect(actionParameters(qaNode)).toMatchObject({
          isContactSheetEnabled: true,
          isContinuityCharacterGateEnabled: false,
          isContinuityQaEnabled: true,
        });
        expect(actionParameters(qaNode)).not.toHaveProperty(
          'characterReferenceUrls',
        );
      }
    });
  });

  describe('Prompts and identity', () => {
    it('prepends the identity directive to every segment prompt', () => {
      const identity = 'Keep the same character identity across clips.';
      const composed = composeClipChainSegmentPrompt(
        identity,
        'Walk into the room and sit.',
      );
      expect(composed.startsWith(identity)).toBe(true);
      expect(composed).toContain('Walk into the room and sit.');

      const instance = createClipChainWorkflowInstance({
        identityDirective: identity,
        organizationId: 'org-1',
        segmentPrompts: ['Beat one', 'Beat two', 'Beat three'],
        userId: 'user-1',
        workflowId: 'wf-clip-1',
      });

      for (const node of instance.nodes.filter((item) =>
        isActionNode(item, 'videoGen'),
      )) {
        expect(String(actionParameters(node).prompt).startsWith(identity)).toBe(
          true,
        );
      }
    });

    it('does not mutate the catalog original when creating an instance', () => {
      const originalPrompt = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.find(
        (node) => node.id === 'video-gen-1',
      );

      createClipChainWorkflowInstance({
        identityDirective: 'A mutated identity',
        organizationId: 'org-1',
        segmentPrompts: ['mutated-1', 'mutated-2', 'mutated-3'],
        userId: 'user-1',
        workflowId: 'wf-clip-2',
      });

      expect(
        actionParameters(
          CLIP_CHAIN_VIDEO_TEMPLATE.nodes.find(
            (node) => node.id === 'video-gen-1',
          ),
        ).prompt,
      ).toBe(actionParameters(originalPrompt).prompt);
    });
  });

  describe('Run-level identity lock (#4653)', () => {
    const identity = {
      characterIngredientIds: ['character-1', 'character-1'],
      environmentIngredientIds: ['room-1'],
      productIngredientIds: ['product-1'],
    };
    const expectedReferences = [
      { assetId: 'character-1', role: 'character' },
      { assetId: 'product-1', role: 'product' },
      { assetId: 'room-1', role: 'subject' },
    ];

    it('maps character, product, and environment ids to identity roles once', () => {
      expect(buildClipChainIdentityReferences(identity)).toEqual(
        expectedReferences,
      );
    });

    it('requires a character ingredient id for the identity path', () => {
      expect(() =>
        buildClipChainIdentityReferences({ characterIngredientIds: [] }),
      ).toThrow('at least one character ingredient id');
      expect(() =>
        buildClipChainVideoTemplate({
          identity: { characterIngredientIds: [' '] },
        }),
      ).toThrow('at least one character ingredient id');
    });

    it('stores the identity ids once on the instance and attaches the same refs to every segment', () => {
      const instance = createClipChainWorkflowInstance({
        brandId: 'brand-1',
        identity,
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'wf-identity-1',
      });

      expect(instance.identity).toEqual({
        characterIngredientIds: ['character-1'],
        environmentIngredientIds: ['room-1'],
        productIngredientIds: ['product-1'],
      });
      expect(Object.isFrozen(instance.identity)).toBe(true);
      expect(Object.isFrozen(instance.identity?.characterIngredientIds)).toBe(
        true,
      );
      expect(instance.metadata.tags).toContain('identity-lock');

      const segments = instance.nodes.filter((node) =>
        isActionNode(node, 'videoGen'),
      );
      expect(segments).toHaveLength(DEFAULT_CLIP_CHAIN_SEGMENT_COUNT);
      for (const segment of segments) {
        const parameters = actionParameters(segment);
        expect(parameters.identityReferences).toEqual(expectedReferences);
        expect(parameters.brandId).toBe('brand-1');
      }
      // Each segment owns its copy; a mutation on one cannot drift another.
      expect(actionParameters(segments[0]).identityReferences).not.toBe(
        actionParameters(segments[1]).identityReferences,
      );
      expect(
        actionParameters(
          instance.nodes.find((node) => node.id === 'video-stitch-1'),
        ).brandId,
      ).toBe('brand-1');

      const qaNodes = instance.nodes.filter((node) =>
        isActionNode(node, 'videoQa'),
      );
      expect(qaNodes).toHaveLength(DEFAULT_CLIP_CHAIN_SEGMENT_COUNT);
      for (const qaNode of qaNodes) {
        expect(actionParameters(qaNode)).toEqual({
          characterReferenceUrls: ['character-1'],
          isContactSheetEnabled: true,
          isContinuityCharacterGateEnabled: true,
          isContinuityQaEnabled: true,
          productReferenceUrls: ['product-1'],
        });
      }
      expect(actionParameters(qaNodes[0]).characterReferenceUrls).not.toBe(
        actionParameters(qaNodes[1]).characterReferenceUrls,
      );
    });

    it('keeps the last-frame extract as the next start frame, never as an identity ref', () => {
      const instance = createClipChainWorkflowInstance({
        identity,
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'wf-identity-2',
      });

      for (
        let index = 1;
        index < DEFAULT_CLIP_CHAIN_SEGMENT_COUNT;
        index += 1
      ) {
        expect(instance.edges).toContainEqual(
          expect.objectContaining({
            source: `frame-extract-${index}`,
            sourceHandle: 'last_frame',
            target: `video-gen-${index + 1}`,
            targetHandle: 'image',
          }),
        );
      }
      const references = actionParameters(
        instance.nodes.find((node) => node.id === 'video-gen-2'),
      ).identityReferences as Array<{ assetId: string }>;
      expect(
        references.some((reference) =>
          reference.assetId.startsWith('frame-extract'),
        ),
      ).toBe(false);
    });

    it('leaves the catalog original without identity refs', () => {
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.identity).toBeUndefined();
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.metadata.tags).not.toContain(
        'identity-lock',
      );
      for (const node of CLIP_CHAIN_VIDEO_TEMPLATE.nodes.filter((item) =>
        isActionNode(item, 'videoGen'),
      )) {
        expect(actionParameters(node)).not.toHaveProperty('identityReferences');
      }
    });

    it('delivers the identity refs to every segment executor, including after a last-frame handoff', async () => {
      const seenIdentity = new Map<string, unknown>();
      const startFrames = new Map<string, unknown>();
      const engine = new WorkflowEngine({
        creditCosts: DEFAULT_CREDIT_COSTS,
        retryConfig: {
          backoffMultiplier: 1,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxRetries: 0,
        },
      });
      engine.registerExecutor('videoGen', async (node, inputs) => {
        seenIdentity.set(node.id, node.config.identityReferences);
        startFrames.set(node.id, inputs.get('image'));
        return {
          id: node.id,
          model: 'stub-model',
          provider: 'stub',
          status: 'completed',
          videoUrl: `https://cdn.example/${node.id}.mp4`,
        };
      });
      registerPassthroughVideoQa(engine);
      engine.registerExecutor('videoFrameExtract', async (node) => {
        const lastFrame = `https://cdn.example/last-from-${node.id}.jpg`;
        return {
          image: lastFrame,
          last_frame: lastFrame,
          sourceVideo: `https://cdn.example/${node.id}-source.mp4`,
        };
      });
      engine.registerExecutor('videoStitch', async () => ({
        video: 'https://cdn.example/clip-chain.mp4',
        videoUrl: 'https://cdn.example/clip-chain.mp4',
      }));

      const instance = createClipChainWorkflowInstance({
        identity,
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'wf-identity-3',
      });
      const result = await engine.execute(toExecutableWorkflow(instance));

      expect(result.status).toBe('completed');
      expect(startFrames.get('video-gen-2')).toBe(
        'https://cdn.example/last-from-frame-extract-1.jpg',
      );
      for (const nodeId of ['video-gen-1', 'video-gen-2', 'video-gen-3']) {
        expect(seenIdentity.get(nodeId)).toEqual(expectedReferences);
      }
    });
  });

  describe('Catalog', () => {
    it('is registered in the catalog with tags and credit estimates', () => {
      const templates = getAvailableTemplates();
      const catalogEntry = templates.find(
        (template) => template.id === 'clip-chain-video',
      );

      expect(catalogEntry).toBeDefined();
      expect(catalogEntry?.metadata.tags.length).toBeGreaterThan(0);
      expect(getTemplateById('clip-chain-video')?.id).toBe('clip-chain-video');

      const expectedCredits = estimateClipChainCredits(
        DEFAULT_CLIP_CHAIN_SEGMENT_COUNT,
      );
      expect(CLIP_CHAIN_VIDEO_TEMPLATE.metadata.creditEstimate).toBe(
        expectedCredits,
      );
      expect(expectedCredits).toBe(
        DEFAULT_CLIP_CHAIN_SEGMENT_COUNT * DEFAULT_CREDIT_COSTS.videoGen +
          DEFAULT_CLIP_CHAIN_SEGMENT_COUNT * DEFAULT_CREDIT_COSTS.videoQa +
          DEFAULT_CLIP_CHAIN_SEGMENT_COUNT *
            DEFAULT_CREDIT_COSTS.videoFrameExtract +
          DEFAULT_CREDIT_COSTS.videoStitch,
      );
    });
  });

  describe('createClipChainWorkflowInstance', () => {
    it('parameterizes segment count N', () => {
      const instance = createClipChainWorkflowInstance({
        organizationId: 'org-1',
        segmentCount: 4,
        userId: 'user-1',
        workflowId: 'wf-clip-4',
      });

      expect(
        instance.nodes.filter((node) => isActionNode(node, 'videoGen')),
      ).toHaveLength(4);
      expect(
        instance.nodes.filter((node) => isActionNode(node, 'videoQa')),
      ).toHaveLength(4);
      expect(
        instance.nodes.filter((node) =>
          isActionNode(node, 'videoFrameExtract'),
        ),
      ).toHaveLength(4);
      expect(
        instance.nodes.filter((node) => isActionNode(node, 'videoStitch')),
      ).toHaveLength(1);
    });
  });

  describe('Engine-level 3-segment run', () => {
    it('produces one concatenated video whose boundaries use extracted last frames as start frames', async () => {
      const startFrames = new Map<string, unknown>();
      const engine = new WorkflowEngine({
        creditCosts: DEFAULT_CREDIT_COSTS,
        retryConfig: {
          backoffMultiplier: 1,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxRetries: 0,
        },
      });

      engine.registerExecutor('videoGen', async (node, inputs) => {
        startFrames.set(node.id, inputs.get('image'));
        return {
          id: node.id,
          model: 'stub-model',
          provider: 'stub',
          status: 'completed',
          videoUrl: `https://cdn.example/${node.id}.mp4`,
        };
      });
      registerPassthroughVideoQa(engine);
      engine.registerExecutor('videoFrameExtract', async (node, inputs) => {
        const source = inputs.get('video');
        const sourceVideo =
          typeof source === 'string'
            ? source
            : ((source as { videoUrl?: string } | undefined)?.videoUrl ?? '');
        const lastFrame = `https://cdn.example/last-from-${node.id}.jpg`;
        return {
          image: lastFrame,
          last_frame: lastFrame,
          sourceVideo,
        };
      });

      const stitchProcessor = vi.fn().mockResolvedValue({
        jobId: 'j-concat',
        outputVideoUrl: 'https://cdn.example/clip-chain.mp4',
      });
      const stitchExecutor = createVideoStitchExecutor(stitchProcessor);
      engine.registerExecutor(
        stitchExecutor.nodeType,
        async (node, inputs, context) => {
          const result = await stitchExecutor.execute({
            context,
            inputs,
            node,
          });
          return result.data;
        },
      );

      const result = await engine.execute(
        toExecutableWorkflow(CLIP_CHAIN_VIDEO_TEMPLATE),
      );

      expect(result.status).toBe('completed');
      expect(startFrames.get('video-gen-1')).toBeUndefined();
      expect(startFrames.get('video-gen-2')).toBe(
        'https://cdn.example/last-from-frame-extract-1.jpg',
      );
      expect(startFrames.get('video-gen-3')).toBe(
        'https://cdn.example/last-from-frame-extract-2.jpg',
      );
      expect(stitchProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          videoUrls: [
            'https://cdn.example/video-gen-1.mp4',
            'https://cdn.example/video-gen-2.mp4',
            'https://cdn.example/video-gen-3.mp4',
          ],
        }),
      );
      expect(result.nodeResults.get('video-stitch-1')?.output).toMatchObject({
        video: 'https://cdn.example/clip-chain.mp4',
      });
    });

    it('segment 2 of 3 failing reports partial-failure retaining segment 1 output', async () => {
      const engine = new WorkflowEngine({
        creditCosts: DEFAULT_CREDIT_COSTS,
        retryConfig: {
          backoffMultiplier: 1,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxRetries: 0,
        },
      });

      engine.registerExecutor('videoGen', async (node) => {
        if (node.id === 'video-gen-2') {
          throw new Error('segment 2 generation failed');
        }
        return {
          id: node.id,
          model: 'stub-model',
          provider: 'stub',
          status: 'completed',
          videoUrl: `https://cdn.example/${node.id}.mp4`,
        };
      });
      registerPassthroughVideoQa(engine);
      engine.registerExecutor('videoFrameExtract', async (node) => {
        const lastFrame = `https://cdn.example/last-from-${node.id}.jpg`;
        return {
          image: lastFrame,
          last_frame: lastFrame,
          sourceVideo: `https://cdn.example/${node.id}-source.mp4`,
        };
      });
      engine.registerExecutor('videoStitch', async () => {
        throw new Error('stitch should not run after a failed segment');
      });

      const result = await engine.execute(
        toExecutableWorkflow(CLIP_CHAIN_VIDEO_TEMPLATE),
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('segment 2 generation failed');
      expect(result.nodeResults.get('video-gen-1')?.status).toBe('completed');
      expect(result.nodeResults.get('video-gen-1')?.output).toEqual({
        id: 'video-gen-1',
        model: 'stub-model',
        provider: 'stub',
        status: 'completed',
        videoUrl: 'https://cdn.example/video-gen-1.mp4',
      });
      expect(result.nodeResults.get('video-gen-2')?.status).toBe('failed');
      expect(result.nodeResults.get('video-gen-2')?.retryCount).toBe(0);
      expect(result.nodeResults.has('video-stitch-1')).toBe(false);
    });
  });

  describe('Continuity QA gate (#4654)', () => {
    const identity = {
      characterIngredientIds: ['character-1'],
      productIngredientIds: ['product-1'],
    };
    const zeroRetry = {
      backoffMultiplier: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      maxRetries: 0,
    };

    function registerClipChainExecutors(
      engine: WorkflowEngine,
      generated: Set<string>,
      resolver?: VideoQaContinuityResolver,
    ): void {
      engine.registerExecutor('videoGen', async (node) => {
        generated.add(node.id);
        return {
          id: node.id,
          model: 'stub-model',
          provider: 'stub',
          status: 'completed',
          videoUrl: `https://cdn.example/${node.id}.mp4`,
        };
      });
      registerContinuityVideoQa(engine, resolver);
      engine.registerExecutor('videoFrameExtract', async (node) => {
        const lastFrame = `https://cdn.example/last-from-${node.id}.jpg`;
        return {
          image: lastFrame,
          last_frame: lastFrame,
          sourceVideo: `https://cdn.example/${node.id}-source.mp4`,
        };
      });
      engine.registerExecutor('videoStitch', async () => {
        throw new Error('stitch should not run after a blocked prefix');
      });
    }

    it('does not dispatch segment 3 after character drift on segment 2', async () => {
      const generated = new Set<string>();
      const engine = new WorkflowEngine({
        creditCosts: DEFAULT_CREDIT_COSTS,
        retryConfig: zeroRetry,
      });
      registerClipChainExecutors(engine, generated, async (params) => {
        if (params.videoUrl.includes('video-gen-2')) {
          return {
            finding: driftFinding(params.videoUrl),
            modelKey: 'openai/vision',
          };
        }
        return {
          finding: consistentFinding(params.videoUrl),
          modelKey: 'openai/vision',
        };
      });

      const result = await engine.execute(
        toExecutableWorkflow(
          createClipChainWorkflowInstance({
            identity,
            organizationId: 'org-1',
            userId: 'user-1',
            workflowId: 'wf-continuity-drift',
          }),
        ),
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Character continuity QA is drift');
      expect(generated.has('video-gen-1')).toBe(true);
      expect(generated.has('video-gen-2')).toBe(true);
      expect(generated.has('video-gen-3')).toBe(false);
      expect(result.nodeResults.get('video-qa-1')?.status).toBe('completed');
      expect(result.nodeResults.get('video-qa-1')?.output).toMatchObject({
        continuityQa: {
          clips: [
            expect.objectContaining({
              character: expect.objectContaining({ verdict: 'consistent' }),
            }),
          ],
        },
      });
      expect(result.nodeResults.get('video-qa-2')?.status).toBe('failed');
      expect(result.nodeResults.get('video-qa-2')?.output).toMatchObject({
        continuityQa: {
          clips: [
            expect.objectContaining({
              character: expect.objectContaining({ verdict: 'drift' }),
            }),
          ],
        },
        video: null,
      });
      expect(result.nodeResults.has('video-gen-3')).toBe(false);
      expect(result.nodeResults.has('video-stitch-1')).toBe(false);
    });

    it('skips character QA without inventing consistent when no character ids are locked', async () => {
      const generated = new Set<string>();
      const resolver = vi.fn();
      const engine = new WorkflowEngine({
        creditCosts: DEFAULT_CREDIT_COSTS,
        retryConfig: zeroRetry,
      });
      engine.registerExecutor('videoGen', async (node) => {
        generated.add(node.id);
        return {
          id: node.id,
          model: 'stub-model',
          provider: 'stub',
          status: 'completed',
          videoUrl: `https://cdn.example/${node.id}.mp4`,
        };
      });
      registerContinuityVideoQa(engine, resolver);
      engine.registerExecutor('videoFrameExtract', async (node) => {
        const lastFrame = `https://cdn.example/last-from-${node.id}.jpg`;
        return {
          image: lastFrame,
          last_frame: lastFrame,
          sourceVideo: `https://cdn.example/${node.id}-source.mp4`,
        };
      });
      engine.registerExecutor('videoStitch', async () => ({
        video: 'https://cdn.example/clip-chain.mp4',
        videoUrl: 'https://cdn.example/clip-chain.mp4',
      }));

      const result = await engine.execute(
        toExecutableWorkflow(CLIP_CHAIN_VIDEO_TEMPLATE),
      );

      expect(result.status).toBe('completed');
      expect(generated).toEqual(
        new Set(['video-gen-1', 'video-gen-2', 'video-gen-3']),
      );
      expect(resolver).not.toHaveBeenCalled();
      for (const nodeId of ['video-qa-1', 'video-qa-2', 'video-qa-3']) {
        const output = result.nodeResults.get(nodeId)?.output;
        expect(output).toMatchObject({
          continuityQa: {
            clips: [],
            skipReason: 'canonical_references_unavailable',
            status: 'skipped',
          },
        });
        expect(characterVerdicts(output)).not.toContain('consistent');
      }
    });

    it('does not treat an identity-lock clip as consistent when the vision model is unavailable', async () => {
      const generated = new Set<string>();
      const engine = new WorkflowEngine({
        creditCosts: DEFAULT_CREDIT_COSTS,
        retryConfig: zeroRetry,
      });
      registerClipChainExecutors(engine, generated, async () => ({
        skipReason: 'vision_model_unavailable',
      }));

      const result = await engine.execute(
        toExecutableWorkflow(
          createClipChainWorkflowInstance({
            identity,
            organizationId: 'org-1',
            userId: 'user-1',
            workflowId: 'wf-continuity-vision',
          }),
        ),
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('vision_model_unavailable');
      expect(generated.has('video-gen-2')).toBe(false);
      const output = result.nodeResults.get('video-qa-1')?.output;
      expect(output).toMatchObject({
        continuityQa: {
          clips: [],
          skipReason: 'vision_model_unavailable',
        },
        video: null,
      });
      expect(characterVerdicts(output)).not.toContain('consistent');
    });
  });

  describe('buildClipChainVideoTemplate', () => {
    it('rejects fewer than 2 segments', () => {
      expect(() => buildClipChainVideoTemplate({ segmentCount: 1 })).toThrow(
        'at least 2',
      );
    });
  });

  describe('buildVideoExtensionTemplate', () => {
    it('keeps the source immutable and stitches it before a last-frame continuation', () => {
      const template = buildVideoExtensionTemplate({
        brandId: 'brand-1',
        model: 'seedance-2.5',
        prompt: 'Continue walking through the market',
        sourceVideoId: 'video-source-1',
      });

      expect(
        template.nodes.map((node) => node.config.actionId ?? node.type),
      ).toEqual([
        'input-video',
        'videoFrameExtract',
        'videoGen',
        'videoStitch',
      ]);
      expect(
        template.nodes.find((node) => node.id === 'source-video')?.config,
      ).toMatchObject({ itemId: 'video-source-1' });
      expect(
        actionParameters(
          template.nodes.find((node) => node.id === 'extended-video'),
        ),
      ).toMatchObject({
        dispatchMode: 'fabricated',
        parentId: 'video-source-1',
      });
      expect(template.edges).toContainEqual(
        expect.objectContaining({
          source: 'source-last-frame',
          sourceHandle: 'last_frame',
          target: 'extension-video',
          targetHandle: 'image',
        }),
      );
    });

    it('uses the source video directly and preserves parentage for native extension', () => {
      const template = buildVideoExtensionTemplate({
        brandId: 'brand-1',
        dispatchMode: 'native',
        model: 'bytedance/seedance-2.5',
        prompt: 'Continue walking through the market',
        sourceVideoId: 'video-source-1',
      });

      expect(
        template.nodes.map((node) => node.config.actionId ?? node.type),
      ).toEqual(['input-video', 'videoGen']);
      expect(template.edges).toContainEqual(
        expect.objectContaining({
          source: 'source-video',
          target: 'extension-video',
          targetHandle: 'videoReference',
        }),
      );
      expect(
        actionParameters(
          template.nodes.find((node) => node.id === 'extension-video'),
        ),
      ).toMatchObject({
        actionVerb: 'extend',
        parentIngredientId: 'video-source-1',
      });
    });
  });
});
