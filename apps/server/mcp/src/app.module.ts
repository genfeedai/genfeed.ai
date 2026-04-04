import { HealthModule } from '@libs/health/health.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import { ConfigModule } from '@mcp/config/config.module';
import { ConfigService } from '@mcp/config/config.service';
import { McpGenfeedAiModule } from '@mcp/mcp/mcp.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule,
    HealthModule,
    LoggerModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    McpGenfeedAiModule,
  ],
})
export class AppModule {}
