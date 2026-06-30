import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { AdminFleetModule } from '@api/endpoints/admin/fleet/fleet.module';
import { AdminWarmupAccountsModule } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  imports: [
    forwardRef(() => AdminFleetModule),
    forwardRef(() => AdminAnnouncementsModule),
    forwardRef(() => AdminWarmupAccountsModule),
  ],
})
export class AdminModule {}
