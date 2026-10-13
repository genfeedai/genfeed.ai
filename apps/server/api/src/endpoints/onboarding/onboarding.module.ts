import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OnboardingController],
  exports: [OnboardingService],
  imports: [
    BrandsModule,
    CommonModule,
    MembersModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    RolesModule,
    UserSetupModule,
    UsersModule,
  ],
  providers: [OnboardingService, OnboardingReadinessService],
})
export class OnboardingModule {}
