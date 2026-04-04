import { SubstackService } from '@api/services/integrations/substack/services/substack.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [SubstackService],
  imports: [HttpModule],
  providers: [SubstackService],
})
export class SubstackModule {}
