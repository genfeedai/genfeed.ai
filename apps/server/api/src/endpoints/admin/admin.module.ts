import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { CrmModule } from '@api/endpoints/admin/crm/crm.module';
import { DarkroomModule } from '@api/endpoints/admin/darkroom/darkroom.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [DarkroomModule, CrmModule, AdminAnnouncementsModule],
})
export class AdminModule {}
