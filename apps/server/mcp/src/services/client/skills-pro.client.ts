import type {
  SkillsProEntitlement,
  SkillsProInstallation,
} from '@mcp/shared/interfaces/skills-pro.interface';
import type { BaseApiClient } from './base-api-client';

export class SkillsProClient {
  constructor(private readonly base: BaseApiClient) {}

  verifyEntitlement(receiptId: string): Promise<SkillsProEntitlement> {
    return this.base.request(
      'verifying Skills Pro entitlement',
      async (http) => {
        const response = await http.post('/skills-pro/verify', { receiptId });
        return this.base.unwrapObject<SkillsProEntitlement>(response);
      },
      this.base.failWithDetail('Failed to verify Skills Pro entitlement'),
    );
  }

  installSkill(
    receiptId: string,
    skillSlug: string,
  ): Promise<SkillsProInstallation> {
    return this.base.request(
      'installing Skills Pro skill',
      async (http) => {
        const response = await http.post('/skills-pro/install', {
          receiptId,
          skillSlug,
        });
        const attributes =
          this.base.unwrapAttributes<SkillsProInstallation>(response);
        const resource = this.base.unwrapObject<{ id?: string }>(response);
        return { ...attributes, id: resource.id ?? attributes.id };
      },
      this.base.failWithDetail('Failed to install Skills Pro skill'),
    );
  }
}
