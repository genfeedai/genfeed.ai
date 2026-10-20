import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostGenerationModule } from '@api/collections/posts/post-generation.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { OnboardingFirstDraftsService } from '@api/endpoints/onboarding/services/onboarding-first-drafts.service';
import { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import { AgentGenerationGatewayModule } from '@api/services/agent-generation-gateway/agent-generation-gateway.module';
import { SignupPrefillModule } from '@api/services/signup-prefill/signup-prefill.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OnboardingController],
  exports: [OnboardingService],
  imports: [
    AgentGenerationGatewayModule,
    BrandsModule,
    CommonModule,
    ConfigModule,
    MembersModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    PostGenerationModule,
    RolesModule,
    SignupPrefillModule,
    UserSetupModule,
    UsersModule,
  ],
  providers: [
    OnboardingFirstDraftsService,
    OnboardingReadinessService,
    OnboardingService,
  ],
})
export class OnboardingModule {}
