import { Module } from '@nestjs/common';
import { PollUntilService } from '@server/shared/services/poll-until/poll-until.service';

@Module({
  exports: [PollUntilService],
  providers: [PollUntilService],
})
export class PollUntilModule {}
