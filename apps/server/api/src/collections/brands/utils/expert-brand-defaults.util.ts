import type { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type { SkillsService } from '@api/collections/skills/services/skills.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { OrganizationCategory } from '@genfeedai/contracts';
import { applyExpertPublishApprovalDefault } from '@genfeedai/contracts/constants';

type BrandAgentConfigInput =
  | (UpdateBrandAgentConfigDto & Record<string, unknown>)
  | undefined;

/**
 * Validate a new brand's agent config and apply creation-time defaults.
 *
 * Expert Path: brands created inside an expert organization start with
 * publish approval on, unless the caller already enabled auto-publish.
 */
export async function resolveCreateAgentConfig(
  prisma: PrismaService,
  skillsService: SkillsService,
  organizationId: string,
  agentConfig: BrandAgentConfigInput,
): Promise<BrandAgentConfigInput> {
  if (agentConfig?.enabledSkills !== undefined) {
    await skillsService.assertAccessibleSkillSlugs(
      organizationId,
      agentConfig.enabledSkills,
    );
  }

  const organization = await prisma.organization.findFirst({
    select: { accountType: true },
    where: { id: organizationId, isDeleted: false },
  });
  if (organization?.accountType !== OrganizationCategory.EXPERT) {
    return agentConfig;
  }

  return {
    ...agentConfig,
    autoPublish: applyExpertPublishApprovalDefault(agentConfig?.autoPublish),
  };
}
