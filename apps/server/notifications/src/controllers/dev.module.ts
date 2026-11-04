import { Module } from '@nestjs/common';
import { DevDiscordController } from '@notifications/controllers/dev.controller';
import { DiscordModule } from '@notifications/services/discord/discord.module';

/**
 * Development-only endpoints. `AppModule` imports this module only when
 * NODE_ENV is `development`, so the unauthenticated Discord test routes do not
 * exist on any other install — including a self-hosted image that leaves
 * NODE_ENV unset.
 */
@Module({
  controllers: [DevDiscordController],
  imports: [DiscordModule],
})
export class DevModule {}
