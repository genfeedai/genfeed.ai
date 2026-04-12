import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { DarkroomModule } from '@api/endpoints/admin/darkroom/darkroom.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [DarkroomModule, AdminAnnouncementsModule],
})
export class AdminModule {}
