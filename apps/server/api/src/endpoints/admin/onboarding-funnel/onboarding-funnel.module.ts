import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { OnboardingFunnelController } from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.controller';
import { OnboardingFunnelService } from '@api/endpoints/admin/onboarding-funnel/onboarding-funnel.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OnboardingFunnelController],
  imports: [PrismaModule],
  providers: [IpWhitelistGuard, OnboardingFunnelService, SuperAdminGuard],
})
export class AdminOnboardingFunnelModule {}
