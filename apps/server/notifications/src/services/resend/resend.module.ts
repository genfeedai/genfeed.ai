import { Module } from '@nestjs/common';
import { ResendService } from '@notifications/services/resend/resend.service';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  exports: [ResendService],
  imports: [SharedModule],
  providers: [ResendService],
})
export class ResendModule {}
