/**
 * Telegram Bot Constants
 *
 * Configuration constants for the Telegram workflow bot.
 * Separate from the existing Telegram social integration module.
 */

export const TELEGRAM_BOT_CONSTANTS = {
  /** Callback data prefixes for inline keyboards */
  CALLBACK_PREFIX: {
    CONFIG_OPTION: 'cfg:',
    CONFIRM_CANCEL: 'confirm:cancel',
    CONFIRM_EDIT: 'confirm:edit',
    CONFIRM_RUN: 'confirm:run',
    WORKFLOW_SELECT: 'wf:',
  },

  /** Supported bot commands */
  COMMANDS: {
    ANALYTICS: 'analytics',
    CANCEL: 'cancel',
    CONNECT: 'connect',
    GENERATE: 'generate',
    POST: 'post',
    RUN: 'run',
    START: 'start',
    STATUS: 'status',
    WORKFLOWS: 'workflows',
  },
  /** Maximum conversation idle time before state is cleared (30 minutes) */
  CONVERSATION_TIMEOUT_MS: 30 * 60 * 1000,

  /** Maximum number of concurrent conversations */
  MAX_CONCURRENT_CONVERSATIONS: 100,
} as const;

/** Environment variable keys */
export const TELEGRAM_BOT_ENV = {
  ALLOWED_USER_IDS: 'TELEGRAM_ALLOWED_USER_IDS',
  DEFAULT_ORGANIZATION_ID: 'TELEGRAM_BOT_DEFAULT_ORGANIZATION_ID',
  DEFAULT_USER_ID: 'TELEGRAM_BOT_DEFAULT_USER_ID',
  MODE: 'TELEGRAM_BOT_MODE',
  TOKEN: 'TELEGRAM_BOT_TOKEN',
} as const;
