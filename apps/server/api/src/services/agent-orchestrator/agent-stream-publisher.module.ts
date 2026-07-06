import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { RedisModule } from '@libs/redis/redis.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [AgentStreamPublisherService],
  imports: [
    forwardRef(() => AgentThreadsModule),
    forwardRef(() => AgentThreadingModule),
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
  ],
  providers: [AgentStreamPublisherService],
})
export class AgentStreamPublisherModule {}
