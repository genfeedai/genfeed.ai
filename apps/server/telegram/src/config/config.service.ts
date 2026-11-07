import { createChatBotConfig } from '@libs/config/create-chat-bot-config';
import { Injectable } from '@nestjs/common';

/** Telegram service config: the shared chat-bot config on compose port 3019. */
@Injectable()
export class ConfigService extends createChatBotConfig('telegram', 3019) {}
