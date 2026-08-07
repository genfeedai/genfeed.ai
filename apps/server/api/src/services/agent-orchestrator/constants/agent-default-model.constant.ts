/**
 * @deprecated Seed-side aliases only. Runtime defaults resolve from the
 * `models` registry via `AgentChatModelRegistryService`. Import
 * `DEFAULT_AGENT_CHAT_MODEL_KEY` from `@genfeedai/constants` solely for seed
 * input / last-resort empty-registry fallbacks.
 */
import {
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY,
} from '@genfeedai/constants';

export const DEFAULT_AGENT_CHAT_MODEL = DEFAULT_AGENT_CHAT_MODEL_KEY;
export const LOCAL_DEFAULT_AGENT_CHAT_MODEL =
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY;
