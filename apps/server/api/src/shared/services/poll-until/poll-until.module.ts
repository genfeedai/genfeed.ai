import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [PollUntilService],
  providers: [PollUntilService],
})
export class PollUntilModule {}
