import type { Organization } from '@api/collections/organizations/schemas/organization.schema';
import { BaseEntity } from '@api/entities/base.entity';

export class OrganizationEntity extends BaseEntity implements Organization {
  declare readonly id: string;
  declare readonly authProviderLogoUrl: string | null;
  declare readonly userId: string;
  declare readonly billingAccountId: string | null;

  declare readonly label: string;
  declare readonly slug: string;

  declare readonly prefix: Organization['prefix'];

  declare readonly logo?: string;
  declare readonly banner?: string;
  declare readonly isSelected: boolean;
  declare readonly isDefault: boolean;
  declare readonly category: Organization['category'];
  declare readonly accountType: Organization['accountType'];
  declare readonly onboardingCompleted: boolean;
  declare readonly isProactiveOnboarding: boolean;
  declare readonly proactiveWelcomeDismissed: boolean;
}
