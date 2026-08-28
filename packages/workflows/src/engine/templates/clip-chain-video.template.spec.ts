import { describe, expect, it, vi } from 'vitest';
import { WorkflowEngine } from '../execution/engine';
import { createVideoStitchExecutor } from '../executors/saas/video-stitch-executor';
import type { ExecutableWorkflow } from '../types';
import { DEFAULT_CREDIT_COSTS } from '../utils/credit-calculator';
import {
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
  };
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
      const videoGenNodes = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.filter(
        (node) => node.type === 'videoGen',
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
    it('chains last-frame extract into the next start-frame handle', () => {
      for (
        let index = 1;
        index < DEFAULT_CLIP_CHAIN_SEGMENT_COUNT;
        index += 1
      ) {
        const videoToExtract = CLIP_CHAIN_VIDEO_TEMPLATE.edges.find(
          (edge) =>
            edge.source === `video-gen-${index}` &&
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

        expect(videoToExtract).toBeDefined();
        expect(extractToNext).toBeDefined();
      }
    });

    it('extracts the last frame of every segment including the last', () => {
      const extractNodes = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.filter(
        (node) => node.type === 'videoFrameExtract',
      );
      expect(extractNodes).toHaveLength(DEFAULT_CLIP_CHAIN_SEGMENT_COUNT);
      for (const extractNode of extractNodes) {
        expect(extractNode.config.selectionMode).toBe('last');
      }
    });

    it('routes every videoGen output into videoStitch', () => {
      const stitchNode = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.find(
        (node) => node.id === 'video-stitch-1',
      );
      expect(stitchNode?.type).toBe('videoStitch');
      expect(stitchNode?.config.transitionType).toBe('cut');

      for (
        let index = 1;
        index <= DEFAULT_CLIP_CHAIN_SEGMENT_COUNT;
        index += 1
      ) {
        const stitchEdge = CLIP_CHAIN_VIDEO_TEMPLATE.edges.find(
          (edge) =>
            edge.source === `video-gen-${index}` &&
            edge.target === 'video-stitch-1' &&
            edge.sourceHandle === 'video' &&
            edge.targetHandle === `video-${index}`,
        );
        expect(stitchEdge).toBeDefined();
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

      for (const node of instance.nodes.filter(
        (item) => item.type === 'videoGen',
      )) {
        expect(String(node.config.prompt).startsWith(identity)).toBe(true);
      }
    });

    it('does not mutate the catalog original when creating an instance', () => {
      const originalPrompt = CLIP_CHAIN_VIDEO_TEMPLATE.nodes.find(
        (node) => node.id === 'video-gen-1',
      )?.config.prompt;

      createClipChainWorkflowInstance({
        identityDirective: 'A mutated identity',
        organizationId: 'org-1',
        segmentPrompts: ['mutated-1', 'mutated-2', 'mutated-3'],
        userId: 'user-1',
        workflowId: 'wf-clip-2',
      });

      expect(
        CLIP_CHAIN_VIDEO_TEMPLATE.nodes.find(
          (node) => node.id === 'video-gen-1',
        )?.config.prompt,
      ).toBe(originalPrompt);
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
          DEFAULT_CLIP_CHAIN_SEGMENT_COUNT * DEFAULT_CREDIT_COSTS.clip +
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
        instance.nodes.filter((node) => node.type === 'videoGen'),
      ).toHaveLength(4);
      expect(
        instance.nodes.filter((node) => node.type === 'videoFrameExtract'),
      ).toHaveLength(4);
      expect(
        instance.nodes.filter((node) => node.type === 'videoStitch'),
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
        return { video: `https://cdn.example/${node.id}.mp4` };
      });
      engine.registerExecutor('videoFrameExtract', async (node, inputs) => {
        const sourceVideo = inputs.get('video');
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
        return { video: `https://cdn.example/${node.id}.mp4` };
      });
      engine.registerExecutor('videoFrameExtract', async (node) => {
        const lastFrame = `https://cdn.example/last-from-${node.id}.jpg`;
        return { image: lastFrame, last_frame: lastFrame };
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
        video: 'https://cdn.example/video-gen-1.mp4',
      });
      expect(result.nodeResults.get('video-gen-2')?.status).toBe('failed');
      expect(result.nodeResults.get('video-gen-2')?.retryCount).toBe(0);
      expect(result.nodeResults.has('video-stitch-1')).toBe(false);
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

      expect(template.nodes.map((node) => node.type)).toEqual([
        'input-video',
        'videoFrameExtract',
        'videoGen',
        'videoStitch',
      ]);
      expect(
        template.nodes.find((node) => node.id === 'source-video')?.config,
      ).toMatchObject({ itemId: 'video-source-1' });
      expect(
        template.nodes.find((node) => node.id === 'extended-video')?.config,
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

      expect(template.nodes.map((node) => node.type)).toEqual([
        'input-video',
        'videoGen',
      ]);
      expect(template.edges).toContainEqual(
        expect.objectContaining({
          source: 'source-video',
          target: 'extension-video',
          targetHandle: 'videoReference',
        }),
      );
      expect(
        template.nodes.find((node) => node.id === 'extension-video')?.config,
      ).toMatchObject({
        actionVerb: 'extend',
        parentIngredientId: 'video-source-1',
      });
    });
  });
});
