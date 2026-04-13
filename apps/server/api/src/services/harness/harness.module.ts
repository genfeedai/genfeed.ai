import { ConfigModule } from '@api/config/config.module';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ContentHarnessService],
  imports: [ConfigModule, LoggerModule],
  providers: [ContentHarnessService],
})
export class ContentHarnessModule {}
