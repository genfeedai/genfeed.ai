import { WaitlistModule } from '@api/collections/waitlist/waitlist.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { WaitlistController } from '@api/endpoints/admin/waitlist/waitlist.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [WaitlistController],
  imports: [WaitlistModule],
  providers: [SuperAdminGuard],
})
export class AdminWaitlistModule {}
