import { ContentHarnessService } from '@api/services/harness/harness.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ContentHarnessService],
  imports: [ConfigModule, LoggerModule],
  providers: [ContentHarnessService],
})
export class ContentHarnessModule {}
