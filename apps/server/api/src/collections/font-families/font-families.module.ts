/**
 * Font Families Module
 * Font library: typography management, font families, text styling,
and font pairing recommendations.
 */
import { FontFamiliesController } from '@api/collections/font-families/controllers/font-families.controller';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [FontFamiliesController],
  exports: [FontFamiliesService],
  imports: [],
  providers: [FontFamiliesService],
})
export class FontFamiliesModule {}
