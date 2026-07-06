/**
 * Users Module
 * User brand management: user profiles, authentication integration,
 * user preferences, and activity tracking.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersService } from '@api/collections/users/services/users.service';
import { CommonModule } from '@api/common/common.module';
import { OnboardingModule } from '@api/endpoints/onboarding/onboarding.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [UsersController],
  exports: [UsersService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => CommonModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => MembersModule),
    forwardRef(() => OnboardingModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => SettingsModule),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [UsersService],
})
export class UsersModule {}
