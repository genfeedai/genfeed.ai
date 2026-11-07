import { ChatBotConfigService } from '@libs/config/create-chat-bot-config';
import { Injectable } from '@nestjs/common';

/** Slack service config: the shared chat-bot config on compose port 3018. */
@Injectable()
export class ConfigService extends ChatBotConfigService {
  constructor() {
    super('slack', 3018);
  }
}
