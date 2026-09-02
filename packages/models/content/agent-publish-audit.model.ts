import { AgentPublishAudit as BaseAgentPublishAudit } from '@genfeedai/client/models';
import type { IAgentPublishAudit } from '@genfeedai/contracts/interfaces';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class AgentPublishAudit extends BaseAgentPublishAudit {
  constructor(partial: Partial<IAgentPublishAudit> = {}) {
    super(partial);

    if (partial.organization && typeof partial.organization === 'object') {
      this.organization = new Organization(partial.organization);
    }
    if (partial.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }
  }
}
