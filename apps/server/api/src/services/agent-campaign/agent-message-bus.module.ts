import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
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
