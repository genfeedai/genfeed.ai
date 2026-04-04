vi.mock('@api/collections/credentials/credentials.module', () => ({
  CredentialsModule: class CredentialsModule {},
}));
vi.mock('@api/collections/reply-bot-configs/reply-bot-configs.module', () => ({
  ReplyBotConfigsModule: class ReplyBotConfigsModule {},
}));
vi.mock('@api/services/reply-bot/reply-bot.module', () => ({
  ReplyBotModule: class ReplyBotModule {},
}));

import { CronReplyBotModule } from '@workers/crons/reply-bot/cron.reply-bot.module';

describe('CronReplyBotModule', () => {
  it('should be defined', () => {
    expect(CronReplyBotModule).toBeDefined();
  });
});
