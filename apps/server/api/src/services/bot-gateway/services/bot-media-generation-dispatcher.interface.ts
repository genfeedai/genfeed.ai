import type { BotCommandType } from '@genfeedai/contracts';
import type { IBotResolvedUser } from '@genfeedai/contracts/interfaces';

export const BOT_MEDIA_GENERATION_DISPATCHER = Symbol(
  'BOT_MEDIA_GENERATION_DISPATCHER',
);

export interface BotMediaGenerationDispatcher {
  generate(input: {
    command: BotCommandType;
    onPlaceholderCreated: (ingredientId: string) => Promise<void>;
    prompt: string;
    user: IBotResolvedUser;
  }): Promise<{ ingredientId: string }>;
}
