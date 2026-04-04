import type { NodeType, WorkflowNode } from '@genfeedai/types';

export type Difficulty = 'simple' | 'advanced';

export type ProviderName =
  | 'Replicate'
  | 'Fal'
  | 'Luma'
  | 'ElevenLabs'
  | 'Gemini'
  | 'Topaz'
  | 'FFmpeg';

// Map node types to their primary providers
const NODE_TYPE_PROVIDERS: Partial<Record<NodeType, ProviderName>> = {
  animation: 'FFmpeg',
  imageGen: 'Replicate',
  lipSync: 'Replicate',
  llm: 'Gemini',
  reframe: 'Luma',
  resize: 'Luma',
  subtitle: 'FFmpeg',
  textToSpeech: 'ElevenLabs',
  transcribe: 'Replicate',
  upscale: 'Topaz',
  videoGen: 'Replicate',
  videoStitch: 'FFmpeg',
  videoTrim: 'FFmpeg',
};

// Map model ID prefixes to providers
const MODEL_PREFIX_PROVIDERS: Record<string, ProviderName> = {
  'bytedance/': 'Replicate',
  'fal-ai/': 'Fal',
  'photon-': 'Luma',
  'pixverse/': 'Replicate',
  'replicate/': 'Replicate',
  'sync/': 'Replicate',
  'topaz-': 'Topaz',
};

/**
 * Extract providers from template nodes
 */
export function extractProviders(nodes: WorkflowNode[]): ProviderName[] {
  const providers = new Set<ProviderName>();

  for (const node of nodes) {
    const nodeType = node.type as NodeType;

    // Check node type mapping
    const typeProvider = NODE_TYPE_PROVIDERS[nodeType];
    if (typeProvider) {
      providers.add(typeProvider);
    }

    // Check for model-specific providers in node data
    const data = node.data as Record<string, unknown>;
    const model = data?.model as string | undefined;
    const selectedModel = data?.selectedModel as { provider?: string } | undefined;

    // Check selected model provider
    if (selectedModel?.provider) {
      const providerMap: Record<string, ProviderName> = {
        fal: 'Fal',
        huggingface: 'Replicate',
        replicate: 'Replicate',
      };
      const mapped = providerMap[selectedModel.provider];
      if (mapped) {
        providers.add(mapped);
      }
    }

    // Check model ID prefix
    if (model) {
      for (const [prefix, provider] of Object.entries(MODEL_PREFIX_PROVIDERS)) {
        if (model.startsWith(prefix) || model.includes(prefix)) {
          providers.add(provider);
          break;
        }
      }
    }
  }

  return Array.from(providers).sort();
}

/**
 * Derive difficulty from node count
 * Simple = 5 or fewer nodes, Advanced = more than 5 nodes
 */
export function getDifficulty(nodeCount: number): Difficulty {
  return nodeCount <= 5 ? 'simple' : 'advanced';
}

/**
 * Get display color for provider badges
 */
export function getProviderColor(provider: ProviderName): string {
  const colors: Record<ProviderName, string> = {
    ElevenLabs: 'bg-green-500/20 text-green-400',
    Fal: 'bg-purple-500/20 text-purple-400',
    FFmpeg: 'bg-gray-500/20 text-gray-400',
    Gemini: 'bg-cyan-500/20 text-cyan-400',
    Luma: 'bg-pink-500/20 text-pink-400',
    Replicate: 'bg-blue-500/20 text-blue-400',
    Topaz: 'bg-orange-500/20 text-orange-400',
  };
  return colors[provider] ?? 'bg-gray-500/20 text-gray-400';
}

/**
 * Get display color for difficulty badges
 */
export function getDifficultyColor(difficulty: Difficulty): string {
  return difficulty === 'simple'
    ? 'bg-emerald-500/20 text-emerald-400'
    : 'bg-amber-500/20 text-amber-400';
}
