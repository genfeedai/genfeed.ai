import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';

/**
 * Seed fallback for longer product text (articles, evaluations, replies).
 * The live default is operator-owned in Admin → Automation → Models (the
 * `isDefault` TEXT row) and is read at runtime through
 * `AgentChatModelRegistryService`, the same resolver #5167 added for agent
 * chat. This constant is used only when no Admin default resolves.
 * Text completions go through OpenRouter. Replicate stays image/video/voice.
 */
export const DEFAULT_TEXT_MODEL = LLM_DEFAULTS.planning;
