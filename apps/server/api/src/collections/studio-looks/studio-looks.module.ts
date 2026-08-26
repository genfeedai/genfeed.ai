import { StudioLooksController } from '@api/collections/studio-looks/controllers/studio-looks.controller';
import { StudioLooksService } from '@api/collections/studio-looks/services/studio-looks.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [StudioLooksController],
  exports: [StudioLooksService],
  providers: [StudioLooksService],
})
export class StudioLooksModule {}
