/**
 * Announcements Collection Module
 * Global admin announcements: changelog, BIP posts, AI news.
 * Published to Discord and/or Twitter/X channels.
 */
import { AnnouncementsService } from '@api/collections/announcements/services/announcements.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AnnouncementsService],
  imports: [],
  providers: [AnnouncementsService],
})
export class AnnouncementsCollectionModule {}
