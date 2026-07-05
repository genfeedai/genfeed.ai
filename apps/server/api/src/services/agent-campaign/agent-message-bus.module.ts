import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [AgentMessageBusService],
  imports: [
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
  ],
  providers: [AgentMessageBusService],
})
export class AgentMessageBusModule {}
