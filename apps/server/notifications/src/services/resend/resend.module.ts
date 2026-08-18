import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from '@notifications/guards/internal-api-key.guard';
import { EmailDeliveriesController } from '@notifications/services/resend/email-deliveries.controller';
import { ResendService } from '@notifications/services/resend/resend.service';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  controllers: [EmailDeliveriesController],
  exports: [ResendService],
  imports: [SharedModule],
  providers: [InternalApiKeyGuard, ResendService],
})
export class ResendModule {}
