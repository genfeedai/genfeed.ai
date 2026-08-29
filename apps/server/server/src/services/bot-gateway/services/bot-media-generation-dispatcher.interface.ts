import type { BotCommandType } from '@genfeedai/enums';
import type { IBotResolvedUser } from '@genfeedai/interfaces';
import type { Request } from 'express';

export const BOT_MEDIA_GENERATION_DISPATCHER = Symbol(
  'BOT_MEDIA_GENERATION_DISPATCHER',
);

export interface BotMediaGenerationDispatcher {
  generate(input: {
    command: BotCommandType;
    onPlaceholderCreated: (ingredientId: string) => Promise<void>;
    prompt: string;
    request: Request;
    user: IBotResolvedUser;
  }): Promise<{ ingredientId: string }>;
}
