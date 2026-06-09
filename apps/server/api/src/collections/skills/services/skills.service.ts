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
import type { Prisma } from '@genfeedai/prisma';
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

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  private readProviders(value: unknown): ByokProvider[] {
    return this.readStringArray(value).filter(
      (provider): provider is ByokProvider =>
        Object.values(ByokProvider).includes(provider as ByokProvider),
    );
  }

  /**
   * Extract domain-specific fields from a payload into the `config` JSON column.
   * The Prisma Skill model only has: id, mongoId, organizationId, label, config, isDeleted, createdAt, updatedAt.
   * All other fields are stored here.
   */
  private buildSkillConfig(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      category: payload['category'],
      channels: payload['channels'],
      configSchema: payload['configSchema'],
      defaultInstructions: payload['defaultInstructions'],
      description: payload['description'],
      files: payload['files'],
      inputSchema: payload['inputSchema'],
      isBuiltIn: payload['isBuiltIn'],
      isEnabled: payload['isEnabled'],
      modalities: payload['modalities'],
      name: payload['name'],
      outputSchema: payload['outputSchema'],
      requiredProviders: payload['requiredProviders'],
      reviewDefaults: payload['reviewDefaults'],
      slug: payload['slug'],
      source: payload['source'],
      sourceListingId: payload['sourceListingId'],
      status: payload['status'],
      title: payload['title'],
      workflowStage: payload['workflowStage'],
    };
  }

  async createSkill(
    organizationId: string,
    payload: CreateSkillDto,
  ): Promise<SkillDocument> {
    const isBuiltIn = payload.isBuiltIn ?? payload.source === 'built_in';

    if (organizationId && !isBuiltIn) {
      this.requireOrganizationId(organizationId);
    }

    const config = this.buildSkillConfig({
      ...(payload as unknown as Record<string, unknown>),
      isBuiltIn,
      source: payload.source ?? (isBuiltIn ? 'built_in' : 'custom'),
      status: payload.status ?? 'published',
    });

    const result = await this.prisma.skill.create({
      data: {
        config: config as Prisma.InputJsonValue,
        isDeleted: false,
        label: payload.name,
        organizationId: isBuiltIn ? null : organizationId,
      },
    });

    return this.normalizeSkill(result);
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

    const baseConfig = this.getConfig(baseSkill);

    const customizedSlug =
      payload.slug?.trim() ||
      this.buildCustomizedSlug(
        this.readString(baseConfig.slug) ?? String(baseSkill.id),
      );

    const customName =
      payload.name?.trim() ||
      `${this.readString(baseConfig.name) ?? 'Skill'} Custom`;

    const config = this.buildSkillConfig({
      category: baseConfig['category'],
      channels: baseConfig['channels'],
      configSchema: baseConfig['configSchema'],
      defaultInstructions: baseConfig['defaultInstructions'],
      description: payload.description?.trim() || baseConfig['description'],
      inputSchema: baseConfig['inputSchema'],
      isBuiltIn: false,
      isEnabled: true,
      modalities: baseConfig['modalities'],
      name: customName,
      outputSchema: baseConfig['outputSchema'],
      requiredProviders: baseConfig['requiredProviders'],
      reviewDefaults: baseConfig['reviewDefaults'],
      slug: customizedSlug,
      source: 'custom',
      status: 'draft',
      workflowStage: baseConfig['workflowStage'],
    });

    const result = await this.prisma.skill.create({
      data: {
        config: {
          ...config,
          baseSkillId: String(baseSkill.id),
        },
        isDeleted: false,
        label: customName,
        organizationId,
      } as never,
    });

    return this.normalizeSkill(result);
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

    const existingConfig = this.getConfig(skill);
    const patchConfig = this.buildSkillConfig(
      payload as unknown as Record<string, unknown>,
    );

    // Merge only the keys present in payload (filter out undefined)
    const mergedConfig: Record<string, unknown> = { ...existingConfig };
    for (const [key, value] of Object.entries(patchConfig)) {
      if (value !== undefined) {
        mergedConfig[key] = value;
      }
    }

    const updated = await this.prisma.skill.update({
      data: {
        config: mergedConfig,
        label: payload.name ?? (existingConfig['name'] as string | undefined),
        organizationId,
      } as never,
      where: { id: String(skill.id) },
    });

    return this.normalizeSkill(updated);
  }

  async listAllForOrg(organizationId: string): Promise<SkillDocument[]> {
    const results = await this.prisma.skill.findMany({
      orderBy: [{ createdAt: 'desc' }],
      where: this.buildAccessibleSkillWhere(organizationId) as never,
    });
    return results.map((r) => this.normalizeSkill(r));
  }

  async getAvailableForOrg(organizationId: string): Promise<SkillDocument[]> {
    const allSkills = await this.prisma.skill.findMany({
      where: this.buildAccessibleSkillWhere(organizationId) as never,
    });

    const availableSkills: SkillDocument[] = [];

    for (const skill of allSkills) {
      const doc = this.normalizeSkill(skill);

      if (!doc.isEnabled || doc.status === 'disabled') {
        continue;
      }

      const hasAllProviders = await this.hasRequiredProviders(
        organizationId,
        this.readProviders(doc.requiredProviders),
      );

      if (hasAllProviders) {
        availableSkills.push(doc);
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
        OR: [{ id: idOrSlug }],
      } as never,
    });

    if (!result) {
      // Try by slug (stored in config.slug) — fall back to in-memory scan for slug match
      const all = await this.prisma.skill.findMany({
        where: this.buildAccessibleSkillWhere(organizationId) as never,
      });
      const bySlug = all.find((r) => {
        const cfg = this.getConfig(r);
        return cfg.slug === idOrSlug;
      });
      return bySlug ? this.normalizeSkill(bySlug) : null;
    }

    return this.normalizeSkill(result);
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

    const all = await this.prisma.skill.findMany({
      where: this.buildAccessibleSkillWhere(organizationId) as never,
    });

    // Filter by enabled slugs (config.slug)
    const skills = all
      .map((r) => this.normalizeSkill(r))
      .filter((doc) => {
        const slug = this.readString(doc.slug);
        return slug !== undefined && enabledSlugs.includes(slug);
      });

    const resolvedSkills: ResolvedBrandSkill[] = [];

    for (const skillDoc of skills) {
      if (!this.matchesResolutionContext(skillDoc, options)) {
        continue;
      }

      const hasAllProviders = await this.hasRequiredProviders(
        organizationId,
        this.readProviders(skillDoc.requiredProviders),
      );

      if (!hasAllProviders) {
        continue;
      }

      const skillSlug = this.readString(skillDoc.slug);
      if (!skillSlug) {
        continue;
      }

      resolvedSkills.push({
        priority: enabledSlugs.indexOf(skillSlug),
        skill: skillDoc,
        targetSkill: skillDoc,
        variant: null,
      });
    }

    return resolvedSkills.sort((left, right) => left.priority - right.priority);
  }

  /**
   * Normalize a raw Prisma Skill row into a SkillDocument-compatible shape.
   * Spreads config fields to the top level so existing callers continue to work,
   * and exposes `id` as both `.id` and `._id` for backward compatibility.
   */
  private normalizeSkill(row: Record<string, unknown>): SkillDocument {
    const config = this.getConfig(row);
    return {
      ...config,
      _id: row.id,
      id: row.id,
      createdAt: row.createdAt,
      isDeleted: row.isDeleted,
      label: row.label,
      mongoId: row.mongoId,
      organizationId: row.organizationId,
      updatedAt: row.updatedAt,
    } as unknown as SkillDocument;
  }

  /**
   * Read the `config` JSON column from a Prisma row (or a normalized SkillDocument).
   */
  private getConfig(row: unknown): Record<string, unknown> {
    const r = row as Record<string, unknown>;
    if (r.config && typeof r.config === 'object' && !Array.isArray(r.config)) {
      return r.config as Record<string, unknown>;
    }
    return {};
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
    const modalities = this.readStringArray(skill.modalities);
    const channels = this.readStringArray(skill.channels);
    const skillSlug = this.readString(skill.slug);

    if (!skill.isEnabled || skill.status === 'disabled') {
      return false;
    }

    if (
      options.modality &&
      modalities.length > 0 &&
      !modalities.includes(options.modality) &&
      !modalities.includes('multi')
    ) {
      return false;
    }

    if (
      options.channel &&
      channels.length > 0 &&
      !channels.includes(options.channel)
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
      (!skillSlug || !options.requestedSlugs.includes(skillSlug))
    ) {
      return false;
    }

    return true;
  }
}
