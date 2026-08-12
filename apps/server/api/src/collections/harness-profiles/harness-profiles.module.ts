import { HarnessProfilesController } from '@api/collections/harness-profiles/controllers/harness-profiles.controller';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [HarnessProfilesController],
  exports: [HarnessProfilesService],
  imports: [LoggerModule, forwardRef(() => ContentHarnessModule)],
  providers: [HarnessProfilesService],
})
export class HarnessProfilesModule {}
