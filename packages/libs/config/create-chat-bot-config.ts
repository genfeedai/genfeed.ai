import { createServiceConfig, type IEnvConfig } from '@genfeedai/config';
import {
  type InternalCaller,
  resolveInternalCallerKey,
} from '@libs/auth/internal-caller-keys';
import Joi from 'joi';

export type ChatBotCaller = Extract<
  InternalCaller,
  'discord' | 'slack' | 'telegram'
>;

const CALLER_KEY_NAMES = {
  discord: 'GENFEEDAI_API_KEY_DISCORD',
  slack: 'GENFEEDAI_API_KEY_SLACK',
  telegram: 'GENFEEDAI_API_KEY_TELEGRAM',
} as const satisfies Record<ChatBotCaller, string>;

const DEFAULT_API_URL = 'http://localhost:3010';

/**
 * Config base shared by the Discord, Slack and Telegram bot services. They only
 * differ in app name and compose port, so each service declares
 * `class ConfigService extends createChatBotConfig('<caller>', <port>) {}`.
 *
 * `PORT` carries the compose default because nothing in the bot deployment
 * paths is required to set it, and `baseSchema` marks it `required()`. The API
 * URL and keys are deliberately not `.uri()`-constrained: the getters supply
 * working fallbacks, so tightening them would turn a soft misconfiguration
 * into a boot failure.
 */
export function createChatBotConfig(caller: ChatBotCaller, port: number) {
  const ServiceConfig = createServiceConfig<IEnvConfig>({
    appName: caller,
    extend: {
      GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
      [CALLER_KEY_NAMES[caller]]: Joi.string().optional().allow(''),
      GENFEEDAI_API_URL: Joi.string().optional().allow(''),
      PORT: Joi.number().default(port),
    },
  });

  return class ChatBotConfigService extends ServiceConfig {
    get API_URL(): string {
      return this.get('GENFEEDAI_API_URL') || DEFAULT_API_URL;
    }

    get API_KEY(): string {
      return resolveInternalCallerKey((key) => this.get(key), caller);
    }
  };
}
