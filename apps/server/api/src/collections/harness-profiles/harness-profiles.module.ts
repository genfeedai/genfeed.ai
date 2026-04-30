import { HarnessProfilesController } from '@api/collections/harness-profiles/controllers/harness-profiles.controller';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [HarnessProfilesController],
  exports: [HarnessProfilesService],
  imports: [LoggerModule],
  providers: [HarnessProfilesService],
})
export class HarnessProfilesModule {}
