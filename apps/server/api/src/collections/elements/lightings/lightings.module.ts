import { ElementsLightingsController } from '@api/collections/elements/lightings/controllers/lightings.controller';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsLightingsController],
  exports: [ElementsLightingsService],
  imports: [],
  providers: [ElementsLightingsService],
})
export class ElementsLightingsModule {}
