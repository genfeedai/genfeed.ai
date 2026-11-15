import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { WaitlistService } from '@api/collections/waitlist/services/waitlist.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [WaitlistService],
  imports: [PlatformSettingsModule],
  providers: [WaitlistService],
})
export class WaitlistModule {}
