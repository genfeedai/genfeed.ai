import { DEFAULT_AGENT_CHAT_MODEL_KEY } from '@genfeedai/constants';

/**
 * Default agent chat model for the client runtime. Mirrors the API default so a
 * request that omits the model bills exactly what the picker priced.
 */
export const DEFAULT_RUNTIME_AGENT_MODEL = DEFAULT_AGENT_CHAT_MODEL_KEY;
