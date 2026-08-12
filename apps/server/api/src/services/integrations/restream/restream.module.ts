import { RestreamController } from '@api/services/integrations/restream/controllers/restream.controller';
import { RestreamService } from '@api/services/integrations/restream/services/restream.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RestreamController],
  exports: [RestreamService],
  imports: [HttpModule],
  providers: [RestreamService],
})
export class RestreamModule {}
