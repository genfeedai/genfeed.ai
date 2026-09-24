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

  createScopedSkill(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'creating scoped skill',
      async (http) => {
        const response = await http.post('/skills/scoped', body);
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to create skill'),
    );
  }

  forkSkill(skillId: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'forking skill',
      async (http) => {
        const response = await http.post(`/skills/${skillId}/fork`, {});
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to fork skill'),
    );
  }

  exportSkill(skillId: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'exporting skill',
      async (http) => {
        const response = await http.get(`/skills/${skillId}/export`);
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to export skill'),
    );
  }

  publishSkill(
    skillId: string,
    audience: 'organization' | 'public',
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'publishing skill',
      async (http) => {
        const response = await http.post(`/skills/${skillId}/publish`, {
          audience,
        });
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to publish skill'),
    );
  }

  rollbackSkill(
    skillId: string,
    versionId: string,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'rolling back skill',
      async (http) => {
        const response = await http.post(`/skills/${skillId}/rollback`, {
          versionId,
        });
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to roll back skill'),
    );
  }

  archiveSkill(skillId: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'archiving skill',
      async (http) => {
        const response = await http.post(`/skills/${skillId}/archive`, {});
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to archive skill'),
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
