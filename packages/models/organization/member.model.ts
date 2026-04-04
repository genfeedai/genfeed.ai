import type { IMember } from '@cloud/interfaces';
import { Member as BaseMember } from '@genfeedai/client/models';
import { Role } from '@models/auth/role.model';
import { User } from '@models/auth/user.model';
import { Organization } from '@models/organization/organization.model';

export class Member extends BaseMember {
  constructor(partial: Partial<IMember>) {
    super(partial);

    if (
      partial?.organization &&
      typeof partial.organization === 'object' &&
      'id' in partial.organization
    ) {
      this.organization = new Organization(
        partial.organization as unknown as Partial<Organization>,
      );
    }

    if (
      partial?.user &&
      typeof partial.user === 'object' &&
      'id' in partial.user
    ) {
      this.user = new User(partial.user as unknown as Partial<User>);
    }

    if (
      partial?.role &&
      typeof partial.role === 'object' &&
      'id' in partial.role
    ) {
      this.role = new Role(partial.role as unknown as Partial<Role>);
    }
  }

  get userFullName(): string {
    if (this.user instanceof User) {
      return this.user.fullName;
    }
    const name =
      `${this.user?.firstName ?? ''} ${this.user?.lastName ?? ''}`.trim();
    return name || '-';
  }

  get userEmail(): string | undefined {
    return this.user?.email;
  }

  get roleLabel(): string | undefined {
    return this.role?.label;
  }
}
