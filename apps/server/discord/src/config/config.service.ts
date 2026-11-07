import { ChatBotConfigService } from '@libs/config/create-chat-bot-config';
import { Injectable } from '@nestjs/common';

/** Discord service config: the shared chat-bot config on compose port 3016. */
@Injectable()
export class ConfigService extends ChatBotConfigService {
  constructor() {
    super('discord', 3016);
  }
}
