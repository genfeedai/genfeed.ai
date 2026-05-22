import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { DarkroomModule } from '@api/endpoints/admin/darkroom/darkroom.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  imports: [
    forwardRef(() => DarkroomModule),
    forwardRef(() => AdminAnnouncementsModule),
  ],
})
export class AdminModule {}
