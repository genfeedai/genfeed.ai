import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [OrganizationPaidAccessService],
  imports: [LoggerModule, PrismaModule],
  providers: [OrganizationPaidAccessService],
})
export class OrganizationPaidAccessModule {}
