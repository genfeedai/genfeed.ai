import {
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY,
} from '@genfeedai/constants';

/**
 * API-side aliases for the catalogue defaults. The catalogue in
 * `@genfeedai/constants` owns the keys so the model the API falls back to is
 * always one the picker offers and the biller has a price for.
 */
export const DEFAULT_AGENT_CHAT_MODEL = DEFAULT_AGENT_CHAT_MODEL_KEY;
export const LOCAL_DEFAULT_AGENT_CHAT_MODEL =
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY;
