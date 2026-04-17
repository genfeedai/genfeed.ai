/**
 * Styles Module
 * Visual style presets: color schemes, artistic styles, visual themes,
and style application to generated content.
 */
import { ElementsStylesController } from '@api/collections/elements/styles/controllers/styles.controller';
import { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsStylesController],
  exports: [ElementsStylesService],
  imports: [],
  providers: [ElementsStylesService],
})
export class ElementsStylesModule {}
