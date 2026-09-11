/**
 * Agent-composer constants and helpers for the shared Unified Generation
 * Setup store (`@genfeedai/ui` `generation-setup.store.ts`). The agent
 * surface offers conversation (text) plus image/video generation.
 */
import type { ConversationComposerGenerationSettings } from '@genfeedai/agent/models/conversation-composer.model';
import { RouterPriority } from '@genfeedai/contracts';
import type {
  GenerationSetup,
  GenerationSetupFieldKey,
  GenerationSetupType,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { StudioGenerateCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import type { GenerationSetupTypeOption } from '@genfeedai/props/ui/generation-setup/generation-setup.props';

/** Conversation, stills, or motion — the operator can lock any of the three. */
export type AgentGenerationType = Extract<
  GenerationSetupType,
  'image' | 'text' | 'video'
>;

const AGENT_GENERATION_DEFAULT_ASPECT_RATIO: Record<
  AgentGenerationType,
  string
> = {
  image: '1:1',
  text: '1:1',
  video: '16:9',
};

const AGENT_GENERATION_SETUP_CAPABILITIES: Record<
  AgentGenerationType,
  StudioGenerateCapabilities
> = {
  text: {
    hasAspectRatio: false,
    hasBrandEnrichment: true,
    hasDuration: false,
    hasIdentity: false,
    hasLook: false,
    hasModelSelection: false,
    hasOutputs: false,
    hasReferences: false,
    hasSpeech: false,
  },
  image: {
    hasAspectRatio: true,
    hasBrandEnrichment: true,
    hasDuration: false,
    hasIdentity: false,
    hasLook: true,
    hasModelSelection: true,
    hasOutputs: true,
    hasReferences: true,
    hasSpeech: false,
  },
  video: {
    hasAspectRatio: true,
    hasBrandEnrichment: true,
    hasDuration: true,
    hasIdentity: false,
    hasLook: true,
    hasModelSelection: true,
    hasOutputs: false,
    hasReferences: true,
    hasSpeech: false,
  },
};

export const AGENT_GENERATION_SETUP_TYPE_OPTIONS: readonly GenerationSetupTypeOption[] =
  [
    { label: 'Text', value: 'text' },
    { label: 'Image', value: 'image' },
    { label: 'Video', value: 'video' },
  ];

export function isAgentGenerationType(
  type: GenerationSetupType | null | undefined,
): type is AgentGenerationType {
  return type === 'text' || type === 'image' || type === 'video';
}

export function isAgentOwnedGenerationType(setup: GenerationSetup): boolean {
  if (setup.presetId) {
    return false;
  }
  const typeSource = setup.sources.type;
  return typeSource !== 'user' && typeSource !== 'preset';
}

export function getAgentGenerationSetupCapabilities(
  type: AgentGenerationType,
): StudioGenerateCapabilities {
  return AGENT_GENERATION_SETUP_CAPABILITIES[type];
}

const DIRECT_GENERATION_FIELDS: readonly GenerationSetupFieldKey[] = [
  'type',
  'modelKey',
  'aspectRatio',
  'duration',
  'outputs',
  'prioritize',
  'resolution',
];

/** Any operator or pinned-preset choice commits the composer to direct media. */
export function hasExplicitAgentGenerationSetup(
  setup: GenerationSetup,
): boolean {
  if (setup.presetId) return true;

  return DIRECT_GENERATION_FIELDS.some((field) => {
    const source = setup.sources[field];
    return source === 'user' || source === 'preset';
  });
}

/**
 * Seeds a fresh, fully agent-owned setup for a scope that has never been
 * written. `modelKey` defaults to `''` (Auto — the server `RouterService`
 * resolves the model).
 */
export function buildDefaultAgentGenerationSetupValues(
  type: AgentGenerationType,
  modelKey = '',
): GenerationSetupValues {
  return {
    aspectRatio: AGENT_GENERATION_DEFAULT_ASPECT_RATIO[type],
    brandingMode: 'brand',
    duration: type === 'video' ? 5 : undefined,
    isPromptEnhanceEnabled: true,
    modelKey,
    outputs: 1,
    prioritize: RouterPriority.BALANCED,
    type,
  };
}

/**
 * Maps the shared `GenerationSetupValues` onto the narrower wire shape the
 * conversation-composer send boundary has always used. The wire shape stays
 * unchanged — only its source moved from the old three-way mode + ad hoc
 * settings state onto the shared generation-setup store.
 */
export function buildConversationComposerGenerationSettings(
  values: GenerationSetupValues,
): ConversationComposerGenerationSettings {
  return {
    aspectRatio: values.aspectRatio,
    duration: values.duration,
    model: values.modelKey || undefined,
    outputs: values.outputs,
    prioritize: values.prioritize,
    resolution: values.resolution,
  };
}
