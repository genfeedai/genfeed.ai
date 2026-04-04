import { Module } from '@nestjs/common';
import { GenFeedService } from '@notifications/services/genfeed/genfeed.service';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  exports: [GenFeedService],
  imports: [SharedModule],
  providers: [GenFeedService],
})
export class GenFeedModule {}
