/**
 * Blacklists Module
 * Content filtering: manage blacklists, filter inappropriate content,
and content moderation rules.
 */
import { ElementsBlacklistsController } from '@api/collections/elements/blacklists/controllers/blacklists.controller';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsBlacklistsController],
  exports: [ElementsBlacklistsService],
  imports: [],
  providers: [ElementsBlacklistsService],
})
export class ElementsBlacklistsModule {}
