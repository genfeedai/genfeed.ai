/**
 * Links Module
 * URL management: link tracking, short URLs, link analytics,
and QR code generation.
 */
import { LinksController } from '@api/collections/links/controllers/links.controller';
import { LinksService } from '@api/collections/links/services/links.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [LinksController],
  exports: [LinksService],
  imports: [],
  providers: [LinksService],
})
export class LinksModule {}
