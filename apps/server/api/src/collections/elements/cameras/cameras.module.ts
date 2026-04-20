/**
 * Cameras Module
 * Camera angle presets: shot types, camera movements, perspective settings,
and cinematography configurations.
 */
import { ElementsCamerasController } from '@api/collections/elements/cameras/controllers/cameras.controller';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsCamerasController],
  exports: [ElementsCamerasService],
  imports: [],
  providers: [ElementsCamerasService],
})
export class ElementsCamerasModule {}
