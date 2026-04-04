/**
 * User Setup Module
 * Provides the UserSetupService for initializing user resources.
 * This module is separate from UsersModule to avoid circular dependencies.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [UserSetupService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => MembersModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => RolesModule),
    forwardRef(() => SettingsModule),
  ],
  providers: [UserSetupService],
})
export class UserSetupModule {}
