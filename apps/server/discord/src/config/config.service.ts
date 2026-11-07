import { createChatBotConfig } from '@libs/config/create-chat-bot-config';
import { Injectable } from '@nestjs/common';

/** Discord service config: the shared chat-bot config on compose port 3016. */
@Injectable()
export class ConfigService extends createChatBotConfig('discord', 3016) {}
