import type { BotCommandType } from '@genfeedai/enums';
import type { IBotResolvedUser } from '@genfeedai/interfaces';

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
