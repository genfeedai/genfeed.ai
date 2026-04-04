import { LoggerModule } from '@libs/logger/logger.module';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@notifications/config/config.module';

@Global()
@Module({
  exports: [ConfigModule, LoggerModule],
  imports: [ConfigModule, LoggerModule],
})
export class SharedModule {}
