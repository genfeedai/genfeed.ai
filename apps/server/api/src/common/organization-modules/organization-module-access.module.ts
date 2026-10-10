import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { OrganizationModuleExecutionInterceptor } from '@api/common/organization-modules/organization-module-execution.interceptor';
import { OrganizationPaidAccessModule } from '@api/common/subscriptions/organization-paid-access.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [OrganizationPaidAccessModule, PrismaModule],
  providers: [
    OrganizationModuleAccessService,
    OrganizationModuleGuard,
    OrganizationModuleExecutionInterceptor,
  ],
  exports: [
    OrganizationModuleAccessService,
    OrganizationModuleGuard,
    OrganizationModuleExecutionInterceptor,
  ],
})
export class OrganizationModuleAccessModule {}
