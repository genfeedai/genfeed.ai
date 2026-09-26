import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';

/**
 * Seed fallback for short product text (draft posts, prompt enhancement).
 * The live default is operator-owned in Admin → Automation → Models (the
 * `isDefault` TEXT row) and is read at runtime through
 * `AgentChatModelRegistryService`, the same resolver #5167 added for agent
 * chat. This constant is used only when no Admin default resolves.
 */
export const DEFAULT_MINI_TEXT_MODEL = LLM_DEFAULTS.productTextFallback;
