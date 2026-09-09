import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { EmailProductSignalsService } from './email-product-signals.service';

@Module({
  imports: [
    WorkflowsCoreModule,
    NotificationsModule,
    PrismaModule,
    ConfigModule,
  ],
  providers: [EmailProductSignalsService],
  exports: [EmailProductSignalsService],
})
export class EmailProductSignalsModule {}
