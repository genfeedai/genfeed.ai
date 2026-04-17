/**
 * Monitored Accounts Module
 * Manages Twitter/X accounts being monitored for the reply bot system.
 * When a monitored account tweets, the bot can auto-reply.
 */
import { MonitoredAccountsController } from '@api/collections/monitored-accounts/controllers/monitored-accounts.controller';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [MonitoredAccountsController],
  exports: [MonitoredAccountsService],
  imports: [ApifyModule, forwardRef(() => ReplyBotModule)],
  providers: [MonitoredAccountsService],
})
export class MonitoredAccountsModule {}
