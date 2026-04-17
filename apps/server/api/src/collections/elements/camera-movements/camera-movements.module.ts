import { ElementsCameraMovementsController } from '@api/collections/elements/camera-movements/controllers/camera-movements.controller';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsCameraMovementsController],
  exports: [ElementsCameraMovementsService],
  imports: [],
  providers: [ElementsCameraMovementsService],
})
export class ElementsCameraMovementsModule {}
