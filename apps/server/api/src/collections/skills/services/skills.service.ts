import type {
  CreateSkillDto,
  CustomizeSkillDto,
  ImportSkillDto,
  UpdateSkillDto,
} from '@api/collections/skills/dto/skill.dto';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface ResolveBrandSkillsOptions {
  channel?: string;
  modality?: string;
  requestedSlugs?: string[];
  workflowStage?: string;
}

export interface ResolvedBrandSkill {
  priority: number;
  skill: SkillDocument;
  targetSkill: SkillDocument;
  variant: SkillDocument | null;
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly byokProviderFactoryService: ByokProviderFactoryService,
    private readonly loggerService: LoggerService,
  ) {}

  async createSkill(
    organizationId: string,
    payload: CreateSkillDto,
  ): Promise<SkillDocument> {
    const isBuiltIn = payload.isBuiltIn ?? payload.source === 'built_in';

    if (organizationId && !isBuiltIn) {
      this.requireOrganizationId(organizationId);
    }

    const result = await this.prisma.skill.create({
      data: {
        ...payload,
        configSchema: payload.configSchema as never,
        inputSchema: payload.inputSchema as never,
        isBuiltIn,
        isDeleted: false,
        organizationId: isBuiltIn ? null : organizationId,
        outputSchema: payload.outputSchema as never,
        reviewDefaults: payload.reviewDefaults as never,
        source: payload.source ?? (isBuiltIn ? 'built_in' : 'custom'),
        status: payload.status ?? 'published',
      } as never,
    });

    return result as unknown as SkillDocument;
  }

  importSkill(
    organizationId: string,
    payload: ImportSkillDto,
  ): Promise<SkillDocument> {
    return this.createSkill(organizationId, {
      ...payload,
      isBuiltIn: false,
      source: 'imported',
      status: payload.status ?? 'draft',
    });
  }

  async customizeSkill(
    organizationId: string,
    idOrSlug: string,
    payload: CustomizeSkillDto,
  ): Promise<SkillDocument> {
    this.requireOrganizationId(organizationId);
    const baseSkill = await this.getSkillById(organizationId, idOrSlug);

    if (!baseSkill) {
      throw new NotFoundException('Skill', idOrSlug);
    }

    const customizedSlug =
      payload.slug?.trim() || this.buildCustomizedSlug(baseSkill.slug);

    const result = await this.prisma.skill.create({
      data: {
        baseSkillId: String(baseSkill._id),
        category: baseSkill.category,
        channels: baseSkill.channels,
        configSchema: baseSkill.configSchema as never,
        defaultInstructions: baseSkill.defaultInstructions,
        description: payload.description?.trim() || baseSkill.description,
        inputSchema: baseSkill.inputSchema as never,
        isBuiltIn: false,
        isDeleted: false,
        isEnabled: true,
        modalities: baseSkill.modalities,
        name: payload.name?.trim() || `${baseSkill.name} Custom`,
        organizationId,
        outputSchema: baseSkill.outputSchema as never,
        requiredProviders: baseSkill.requiredProviders,
        reviewDefaults: baseSkill.reviewDefaults as never,
        slug: customizedSlug,
        source: 'custom',
        status: 'draft',
        workflowStage: baseSkill.workflowStage,
      } as never,
    });

    return result as unknown as SkillDocument;
  }

  async updateSkill(
    organizationId: string,
    idOrSlug: string,
    payload: UpdateSkillDto,
  ): Promise<SkillDocument> {
    this.requireOrganizationId(organizationId);
    const skill = await this.getSkillById(organizationId, idOrSlug);

    if (!skill) {
      throw new NotFoundException('Skill', idOrSlug);
    }

    const updated = await this.prisma.skill.update({
      data: { ...payload, organizationId } as never,
      where: { id: String(skill._id) },
    });

    return updated as unknown as SkillDocument;
  }

  async listAllForOrg(organizationId: string): Promise<SkillDocument[]> {
    const results = await this.prisma.skill.findMany({
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }, { source: 'asc' }],
      where: this.buildAccessibleSkillWhere(organizationId) as never,
    });
    return results as unknown as SkillDocument[];
  }

  async getAvailableForOrg(organizationId: string): Promise<SkillDocument[]> {
    const allSkills = await this.prisma.skill.findMany({
      where: {
        ...this.buildAccessibleSkillWhere(organizationId),
        isEnabled: true,
        status: { not: 'disabled' },
      } as never,
    });

    const availableSkills: SkillDocument[] = [];

    for (const skill of allSkills) {
      const hasAllProviders = await this.hasRequiredProviders(
        organizationId,
        (skill as unknown as SkillDocument).requiredProviders,
      );

      if (hasAllProviders) {
        availableSkills.push(skill as unknown as SkillDocument);
      }
    }

    return availableSkills;
  }

  async getSkillById(
    organizationId: string,
    idOrSlug: string,
  ): Promise<SkillDocument | null> {
    const result = await this.prisma.skill.findFirst({
      where: {
        ...this.buildAccessibleSkillWhere(organizationId),
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      } as never,
    });
    return result as unknown as SkillDocument | null;
  }

  async assertBrandSkillEnabled(
    organizationId: string,
    brandId: string,
    skillSlug: string,
  ): Promise<void> {
    const enabledSkills = await this.getEnabledSkillSlugs(
      organizationId,
      brandId,
    );

    if (!enabledSkills.includes(skillSlug)) {
      throw new ValidationException(
        `Skill "${skillSlug}" is not enabled for this brand`,
      );
    }
  }

  async getEnabledSkillSlugs(
    organizationId: string,
    brandId: string,
    requestedSlugs?: string[],
  ): Promise<string[]> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const agentConfig = brand.agentConfig as Record<string, unknown> | null;
    const enabledSkills: string[] =
      (agentConfig?.enabledSkills as string[]) || [];

    if (!requestedSlugs || requestedSlugs.length === 0) {
      return enabledSkills;
    }

    return requestedSlugs.filter((slug) => enabledSkills.includes(slug));
  }

  async resolveBrandSkills(
    organizationId: string,
    brandId: string,
    options: ResolveBrandSkillsOptions = {},
  ): Promise<ResolvedBrandSkill[]> {
    const enabledSlugs = await this.getEnabledSkillSlugs(
      organizationId,
      brandId,
    );

    if (enabledSlugs.length === 0) {
      return [];
    }

    const skills = await this.prisma.skill.findMany({
      where: {
        ...this.buildAccessibleSkillWhere(organizationId),
        slug: { in: enabledSlugs },
      } as never,
    });

    const resolvedSkills: ResolvedBrandSkill[] = [];

    for (const skill of skills) {
      const skillDoc = skill as unknown as SkillDocument;

      if (!this.matchesResolutionContext(skillDoc, options)) {
        continue;
      }

      const hasAllProviders = await this.hasRequiredProviders(
        organizationId,
        skillDoc.requiredProviders,
      );

      if (!hasAllProviders) {
        continue;
      }

      resolvedSkills.push({
        priority: enabledSlugs.indexOf(skillDoc.slug),
        skill: skillDoc,
        targetSkill: skillDoc,
        variant: null,
      });
    }

    return resolvedSkills.sort((left, right) => left.priority - right.priority);
  }

  private buildAccessibleSkillWhere(
    organizationId: string,
  ): Record<string, unknown> {
    return {
      AND: [
        { isDeleted: false },
        {
          OR: [{ organizationId }, { organizationId: null }],
        },
      ],
    };
  }

  private requireOrganizationId(organizationId: string): void {
    if (!organizationId) {
      throw new ValidationException('Organization context is required');
    }
  }

  private buildCustomizedSlug(baseSlug: string): string {
    return `${baseSlug}--custom-${Date.now().toString(36)}`;
  }

  private async hasRequiredProviders(
    organizationId: string,
    requiredProviders: ByokProvider[],
  ): Promise<boolean> {
    for (const provider of requiredProviders) {
      const hasAccess = await this.byokProviderFactoryService.hasProviderAccess(
        organizationId,
        provider,
      );

      if (!hasAccess) {
        return false;
      }
    }

    return true;
  }

  private matchesResolutionContext(
    skill: SkillDocument,
    options: ResolveBrandSkillsOptions,
  ): boolean {
    if (!skill.isEnabled || skill.status === 'disabled') {
      return false;
    }

    if (
      options.modality &&
      skill.modalities.length > 0 &&
      !skill.modalities.includes(options.modality) &&
      !skill.modalities.includes('multi')
    ) {
      return false;
    }

    if (
      options.channel &&
      skill.channels.length > 0 &&
      !skill.channels.includes(options.channel)
    ) {
      return false;
    }

    if (
      options.workflowStage &&
      skill.workflowStage &&
      skill.workflowStage !== options.workflowStage
    ) {
      return false;
    }

    if (
      options.requestedSlugs &&
      options.requestedSlugs.length > 0 &&
      !options.requestedSlugs.includes(skill.slug)
    ) {
      return false;
    }

    return true;
  }
}
