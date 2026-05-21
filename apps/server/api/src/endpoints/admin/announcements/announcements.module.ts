import { AnnouncementsCollectionModule } from '@api/collections/announcements/announcements.collection.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { AnnouncementsController } from '@api/endpoints/admin/announcements/announcements.controller';
import { AdminAnnouncementsService } from '@api/endpoints/admin/announcements/announcements.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AnnouncementsController],
  imports: [AnnouncementsCollectionModule, CredentialsCoreModule],
  providers: [AdminAnnouncementsService, IpWhitelistGuard],
})
export class AdminAnnouncementsModule {}
