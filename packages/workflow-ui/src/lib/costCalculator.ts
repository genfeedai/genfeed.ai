import {
  DEFAULT_VIDEO_DURATION,
  IMAGE_NODE_TYPES,
  LUMA_NODE_TYPES,
  PRICING,
  TOPAZ_NODE_TYPES,
  VIDEO_NODE_TYPES,
} from '@genfeedai/core';
import type {
  CostBreakdown,
  NodeCostEstimate,
  WorkflowNode,
} from '@genfeedai/types';

export type { CostBreakdown, NodeCostEstimate };

type TopazImageUpscaleTier = (typeof PRICING)['topaz-image-upscale'][number];

// =============================================================================
// HELPERS
// =============================================================================

function isNodeType(type: string, list: readonly string[]): boolean {
  return list.includes(type);
}

function getDataField<T>(
  data: Record<string, unknown>,
  key: string,
  fallback: T,
): T {
  return (data[key] as T) ?? fallback;
}

// =============================================================================
// COST CALCULATOR
// =============================================================================

export function calculateWorkflowCost(nodes: WorkflowNode[]): CostBreakdown {
  const estimates: NodeCostEstimate[] = [];

  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const type = node.type ?? '';
    const label = getDataField(data, 'label', type);

    // Image generation
    if (isNodeType(type, IMAGE_NODE_TYPES)) {
      const model = getDataField(data, 'model', 'nano-banana');
      const resolution = getDataField(data, 'resolution', '2K');
      let cost = 0;

      const priceEntry = PRICING[model as keyof typeof PRICING];
      if (typeof priceEntry === 'number') {
        cost = priceEntry;
      } else if (
        priceEntry &&
        typeof priceEntry === 'object' &&
        !Array.isArray(priceEntry)
      ) {
        cost =
          (priceEntry as Record<string, number>)[resolution] ??
          Object.values(priceEntry as Record<string, number>)[0] ??
          0;
      }

      estimates.push({
        model,
        nodeId: node.id,
        nodeLabel: label,
        nodeType: type,
        quantity: 1,
        subtotal: cost,
        unit: 'per image',
        unitPrice: cost,
      });
      continue;
    }

    // Video generation
    if (isNodeType(type, VIDEO_NODE_TYPES)) {
      const model = getDataField(data, 'model', 'veo-3.1-fast');
      const duration = getDataField(data, 'duration', DEFAULT_VIDEO_DURATION);
      const generateAudio = getDataField(data, 'generateAudio', true);

      const priceEntry = PRICING[model as keyof typeof PRICING];
      let perSecond = 0;

      if (
        priceEntry &&
        typeof priceEntry === 'object' &&
        !Array.isArray(priceEntry)
      ) {
        const entry = priceEntry as {
          withAudio?: number;
          withoutAudio?: number;
        };
        perSecond = generateAudio
          ? (entry.withAudio ?? 0)
          : (entry.withoutAudio ?? 0);
      }

      const subtotal = perSecond * duration;
      estimates.push({
        duration,
        model,
        nodeId: node.id,
        nodeLabel: label,
        nodeType: type,
        quantity: duration,
        subtotal,
        unit: `${duration}s video`,
        unitPrice: perSecond,
        withAudio: generateAudio,
      });
      continue;
    }

    // Luma reframe
    if (isNodeType(type, LUMA_NODE_TYPES)) {
      const model = getDataField(data, 'model', 'photon-flash-1');
      const inputType = getDataField<string>(data, 'inputType', 'image');

      let subtotal = 0;
      if (inputType === 'video') {
        subtotal =
          (PRICING['luma-reframe-video'] as number) * DEFAULT_VIDEO_DURATION;
      } else {
        const imageEntry = PRICING['luma-reframe-image'];
        subtotal = (imageEntry as Record<string, number>)[model] ?? 0.01;
      }

      estimates.push({
        model,
        nodeId: node.id,
        nodeLabel: label,
        nodeType: type,
        quantity: 1,
        subtotal,
        unit: inputType === 'video' ? 'per video' : 'per image',
        unitPrice: subtotal,
      });
      continue;
    }

    // Topaz upscale
    if (isNodeType(type, TOPAZ_NODE_TYPES)) {
      const inputType = getDataField<string>(data, 'inputType', 'image');

      if (inputType === 'video') {
        const resolution = getDataField(data, 'targetResolution', '1080p');
        const fps = getDataField(data, 'targetFps', 30);
        const key =
          `${resolution}-${fps}` as keyof (typeof PRICING)['topaz-video-upscale'];
        const pricePerChunk = PRICING['topaz-video-upscale'][key] ?? 0.101;
        const duration = DEFAULT_VIDEO_DURATION;
        const chunks = Math.ceil(duration / 5);

        estimates.push({
          duration,
          model: 'topaz-video',
          nodeId: node.id,
          nodeLabel: label,
          nodeType: type,
          quantity: chunks,
          subtotal: pricePerChunk * chunks,
          unit: `${duration}s video`,
          unitPrice: pricePerChunk,
        });
      } else {
        // Image upscale - default to ~1MP tier
        const tier =
          PRICING['topaz-image-upscale'].find(
            (t: TopazImageUpscaleTier) => 1 <= t.maxMP,
          ) ?? PRICING['topaz-image-upscale'][0];

        estimates.push({
          model: getDataField(data, 'model', 'topaz-standard-v2'),
          nodeId: node.id,
          nodeLabel: label,
          nodeType: type,
          quantity: 1,
          subtotal: tier.price,
          unit: 'per image',
          unitPrice: tier.price,
        });
      }
      continue;
    }

    // LLM
    if (type === 'llm') {
      const maxTokens = getDataField(data, 'maxTokens', 1024);
      // Rough estimate: input tokens ~= 2x maxTokens (system prompt + input)
      const estimatedTokens = maxTokens * 3;
      const subtotal = estimatedTokens * PRICING.llama;

      estimates.push({
        model: getDataField(data, 'model', 'llama'),
        nodeId: node.id,
        nodeLabel: label,
        nodeType: type,
        quantity: estimatedTokens,
        subtotal,
        unit: `~${estimatedTokens} tokens`,
        unitPrice: PRICING.llama,
      });
    }
  }

  return {
    items: estimates,
    total: estimates.reduce((sum, e) => sum + e.subtotal, 0),
  };
}

export function formatCost(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
