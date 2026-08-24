import type { ExecutableEdge, ExecutableNode } from '../types';
import { getNodeCreditCost } from '../utils/credit-calculator';
import type { WorkflowTemplate } from './cinematic-video.template';

export const DEFAULT_CLIP_CHAIN_SEGMENT_COUNT = 3;
export const CLIP_CHAIN_VIDEO_TEMPLATE_ID = 'clip-chain-video';

const DEFAULT_IDENTITY_DIRECTIVE =
  'Keep the same character identity, wardrobe, lighting, and environment across every clip.';

const DEFAULT_SEGMENT_PROMPTS = [
  'Open on the character in the established setting and hold a clear establishing beat.',
  'Continue the action with a distinct motion or dialogue beat while identity stays locked.',
  'Close the sequence with a resolving beat that matches the previous last frame.',
];

export interface ClipChainTemplateMetadata {
  creditEstimate: number;
  createdAt: string;
  tags: string[];
  version: string;
}

export interface ClipChainWorkflowTemplate
  extends Omit<WorkflowTemplate, 'metadata'> {
  metadata: ClipChainTemplateMetadata;
}

export interface ClipChainTemplateParams {
  identityDirective?: string;
  segmentCount?: number;
  segmentPrompts?: string[];
  videoConfig?: Partial<{
    aspectRatio: string;
    duration: number;
    model: string;
  }>;
}

export interface ClipChainWorkflowInstance extends ClipChainWorkflowTemplate {
  organizationId: string;
  userId: string;
}

/**
 * Prepends the shared identity directive to a per-segment prompt so motion
 * and dialogue can differ while identity persists across clips.
 */
export function composeClipChainSegmentPrompt(
  identityDirective: string,
  segmentPrompt: string,
): string {
  const identity = identityDirective.trim();
  const segment = segmentPrompt.trim();

  if (identity.length === 0) {
    return segment;
  }
  if (segment.length === 0) {
    return identity;
  }

  return `${identity}\n\n${segment}`;
}

/**
 * Catalog credit estimate: N * videoGen + N * frameExtract + 1 stitch.
 * Frame extract has no dedicated cost key; `clip` is the existing extract
 * FFmpeg-pass alias.
 */
export function estimateClipChainCredits(segmentCount: number): number {
  const videoGenCost = getNodeCreditCost('videoGen');
  const frameExtractCost =
    getNodeCreditCost('videoFrameExtract') || getNodeCreditCost('clip');
  const stitchCost = getNodeCreditCost('videoStitch');

  return (
    segmentCount * videoGenCost + segmentCount * frameExtractCost + stitchCost
  );
}

function resolveSegmentPrompt(
  segmentPrompts: string[] | undefined,
  index: number,
): string {
  return (
    segmentPrompts?.[index] ??
    DEFAULT_SEGMENT_PROMPTS[index] ??
    `Segment ${index + 1} beat.`
  );
}

function buildClipChainNodes(
  segmentCount: number,
  identityDirective: string,
  segmentPrompts: string[] | undefined,
  videoConfig: ClipChainTemplateParams['videoConfig'],
): ExecutableNode[] {
  const nodes: ExecutableNode[] = [];

  for (let index = 1; index <= segmentCount; index += 1) {
    const segmentPrompt = resolveSegmentPrompt(segmentPrompts, index - 1);
    const prompt = composeClipChainSegmentPrompt(
      identityDirective,
      segmentPrompt,
    );
    const inputs = index === 1 ? [] : [`frame-extract-${index - 1}`];

    nodes.push({
      config: {
        aspectRatio: videoConfig?.aspectRatio ?? '16:9',
        duration: videoConfig?.duration ?? 8,
        generateAudio: true,
        identityDirective,
        model: videoConfig?.model ?? 'veo-3.1-fast',
        prompt,
        segmentIndex: index,
        segmentPrompt,
      },
      id: `video-gen-${index}`,
      inputs,
      label: `Segment ${index} Video`,
      type: 'videoGen',
    });

    nodes.push({
      config: {
        // TODO(#3435): a future video QA node can gate this last-frame extract
        // before the next start-frame handoff.
        selectionMode: 'last',
      },
      id: `frame-extract-${index}`,
      inputs: [`video-gen-${index}`],
      label: `Segment ${index} Last Frame`,
      type: 'videoFrameExtract',
    });
  }

  const videoGenIds = Array.from(
    { length: segmentCount },
    (_, index) => `video-gen-${index + 1}`,
  );

  nodes.push({
    config: {
      audioCodec: 'aac',
      outputQuality: 'full',
      seamlessLoop: false,
      transitionDuration: 0,
      transitionType: 'cut',
    },
    id: 'video-stitch-1',
    inputs: videoGenIds,
    label: 'Concatenate Clips',
    type: 'videoStitch',
  });

  return nodes;
}

function buildClipChainEdges(segmentCount: number): ExecutableEdge[] {
  const edges: ExecutableEdge[] = [];

  for (let index = 1; index <= segmentCount; index += 1) {
    edges.push({
      id: `edge-video-extract-${index}`,
      source: `video-gen-${index}`,
      sourceHandle: 'video',
      target: `frame-extract-${index}`,
      targetHandle: 'video',
    });

    if (index < segmentCount) {
      edges.push({
        id: `edge-extract-start-${index}`,
        source: `frame-extract-${index}`,
        sourceHandle: 'last_frame',
        target: `video-gen-${index + 1}`,
        targetHandle: 'image',
      });
    }

    edges.push({
      id: `edge-video-stitch-${index}`,
      source: `video-gen-${index}`,
      sourceHandle: 'video',
      target: 'video-stitch-1',
      targetHandle: `video-${index}`,
    });
  }

  return edges;
}

/**
 * Clip-chain long-form video system workflow.
 *
 * Graph: for i in 1..N: videoGen_i → frameExtract_i(last) →
 * videoGen_{i+1}.startFrame; all videoGen outputs → videoStitch.
 *
 * Immutable catalog original. Users inspect/duplicate and parameterize
 * segments; they cannot mutate this template in place.
 */
export function buildClipChainVideoTemplate(
  params: ClipChainTemplateParams = {},
): ClipChainWorkflowTemplate {
  const segmentCount = params.segmentCount ?? DEFAULT_CLIP_CHAIN_SEGMENT_COUNT;
  if (segmentCount < 2) {
    throw new Error('Clip-chain templates require at least 2 segments');
  }

  const identityDirective =
    params.identityDirective ?? DEFAULT_IDENTITY_DIRECTIVE;

  return {
    category: 'video-generation',
    description:
      'Chain N video segments by extracting each last frame as the next start frame, then concatenate into one continuous video',
    edges: buildClipChainEdges(segmentCount),
    id: CLIP_CHAIN_VIDEO_TEMPLATE_ID,
    metadata: {
      createdAt: '2026-08-24T00:00:00.000Z',
      creditEstimate: estimateClipChainCredits(segmentCount),
      tags: [
        'video',
        'clip-chain',
        'long-form',
        'last-frame',
        'start-frame',
        'ai-generation',
      ],
      version: '1.0.0',
    },
    name: 'Clip-Chain Long-Form Video',
    nodes: buildClipChainNodes(
      segmentCount,
      identityDirective,
      params.segmentPrompts,
      params.videoConfig,
    ),
  };
}

export const CLIP_CHAIN_VIDEO_TEMPLATE: ClipChainWorkflowTemplate =
  buildClipChainVideoTemplate();

/**
 * Create a tenant-owned instance from the immutable catalog original.
 */
export const createClipChainWorkflowInstance = (config: {
  workflowId: string;
  organizationId: string;
  userId: string;
  identityDirective?: string;
  segmentCount?: number;
  segmentPrompts?: string[];
  videoConfig?: ClipChainTemplateParams['videoConfig'];
}): ClipChainWorkflowInstance => {
  const template = buildClipChainVideoTemplate({
    identityDirective: config.identityDirective,
    segmentCount: config.segmentCount,
    segmentPrompts: config.segmentPrompts,
    videoConfig: config.videoConfig,
  });
  const { id: _templateId, ...templateWithoutId } = template;

  return {
    ...templateWithoutId,
    id: config.workflowId,
    organizationId: config.organizationId,
    userId: config.userId,
  };
};
