import { AnnouncementsCollectionModule } from '@api/collections/announcements/announcements.collection.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { AnnouncementsController } from '@api/endpoints/admin/announcements/announcements.controller';
import { AdminAnnouncementsService } from '@api/endpoints/admin/announcements/announcements.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AnnouncementsController],
  imports: [AnnouncementsCollectionModule, CredentialsModule],
  providers: [AdminAnnouncementsService, IpWhitelistGuard],
})
export class AdminAnnouncementsModule {}
