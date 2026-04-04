import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import type {
  CreateSkillDto,
  CustomizeSkillDto,
  ImportSkillDto,
  UpdateSkillDto,
} from '@api/collections/skills/dto/skill.dto';
import {
  Skill,
  type SkillDocument,
} from '@api/collections/skills/schemas/skill.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type FilterQuery, Model, Types } from 'mongoose';

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
    @InjectModel(Skill.name, DB_CONNECTIONS.CLOUD)
    private readonly skillModel: Model<SkillDocument>,
    @InjectModel(Brand.name, DB_CONNECTIONS.CLOUD)
    private readonly brandModel: Model<BrandDocument>,
    private readonly byokProviderFactoryService: ByokProviderFactoryService,
    private readonly loggerService: LoggerService,
  ) {}

  createSkill(
    organizationId: string,
    payload: CreateSkillDto,
  ): Promise<SkillDocument> {
    const isBuiltIn = payload.isBuiltIn ?? payload.source === 'built_in';
    const organizationObjectId =
      this.requireOrganizationObjectId(organizationId);

    return this.skillModel.create({
      ...payload,
      isBuiltIn,
      isDeleted: false,
      organization: isBuiltIn ? null : organizationObjectId,
      source: payload.source ?? (isBuiltIn ? 'built_in' : 'custom'),
      status: payload.status ?? 'published',
    });
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
    const organizationObjectId =
      this.requireOrganizationObjectId(organizationId);
    const baseSkill = await this.getSkillById(organizationId, idOrSlug);

    if (!baseSkill) {
      throw new NotFoundException('Skill', idOrSlug);
    }

    const customizedSlug =
      payload.slug?.trim() || this.buildCustomizedSlug(baseSkill.slug);

    return this.skillModel.create({
      baseSkill: baseSkill._id,
      category: baseSkill.category,
      channels: baseSkill.channels,
      configSchema: baseSkill.configSchema,
      defaultInstructions: baseSkill.defaultInstructions,
      description: payload.description?.trim() || baseSkill.description,
      inputSchema: baseSkill.inputSchema,
      isBuiltIn: false,
      isDeleted: false,
      isEnabled: true,
      modalities: baseSkill.modalities,
      name: payload.name?.trim() || `${baseSkill.name} Custom`,
      organization: organizationObjectId,
      outputSchema: baseSkill.outputSchema,
      requiredProviders: baseSkill.requiredProviders,
      reviewDefaults: baseSkill.reviewDefaults,
      slug: customizedSlug,
      source: 'custom',
      status: 'draft',
      workflowStage: baseSkill.workflowStage,
    });
  }

  async updateSkill(
    organizationId: string,
    idOrSlug: string,
    payload: UpdateSkillDto,
  ): Promise<SkillDocument> {
    const organizationObjectId =
      this.requireOrganizationObjectId(organizationId);
    const filter = this.buildAccessibleSkillFilter(organizationId, idOrSlug);
    filter.organization = organizationObjectId;

    const updated = await this.skillModel.findOneAndUpdate(
      filter,
      { $set: payload },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Skill', idOrSlug);
    }

    return updated;
  }

  listAllForOrg(organizationId: string): Promise<SkillDocument[]> {
    return this.skillModel
      .find(this.buildAccessibleSkillFilter(organizationId))
      .sort({ createdAt: -1, name: 1, source: 1 })
      .exec();
  }

  async getAvailableForOrg(organizationId: string): Promise<SkillDocument[]> {
    const allSkills = await this.skillModel
      .find({
        ...this.buildAccessibleSkillFilter(organizationId),
        isEnabled: true,
        status: { $ne: 'disabled' },
      })
      .lean();

    const availableSkills: SkillDocument[] = [];

    for (const skill of allSkills) {
      const hasAllProviders = await this.hasRequiredProviders(
        organizationId,
        skill.requiredProviders,
      );

      if (hasAllProviders) {
        availableSkills.push(skill as unknown as SkillDocument);
      }
    }

    return availableSkills;
  }

  getSkillById(
    organizationId: string,
    idOrSlug: string,
  ): Promise<SkillDocument | null> {
    return this.skillModel.findOne(
      this.buildAccessibleSkillFilter(organizationId, idOrSlug),
    );
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
    const brand = await this.brandModel
      .findOne({
        _id: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      } as never)
      .lean();

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const enabledSkills: string[] = brand.agentConfig?.enabledSkills || [];

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

    const skills = await this.skillModel
      .find({
        ...this.buildAccessibleSkillFilter(organizationId),
        slug: { $in: enabledSlugs },
      })
      .exec();

    const resolvedSkills: ResolvedBrandSkill[] = [];

    for (const skill of skills) {
      if (!this.matchesResolutionContext(skill, options)) {
        continue;
      }

      const hasAllProviders = await this.hasRequiredProviders(
        organizationId,
        skill.requiredProviders,
      );

      if (!hasAllProviders) {
        continue;
      }

      resolvedSkills.push({
        priority: enabledSlugs.indexOf(skill.slug),
        skill,
        targetSkill: skill,
        variant: null,
      });
    }

    return resolvedSkills.sort((left, right) => left.priority - right.priority);
  }

  private buildAccessibleSkillFilter(
    organizationId: string,
    idOrSlug?: string,
  ): FilterQuery<SkillDocument> {
    const organizationScope = this.toOrganizationScope(organizationId);
    const filter: FilterQuery<SkillDocument> = {
      ...(organizationScope
        ? { $or: [organizationScope, { organization: null }] }
        : { organization: null }),
      isDeleted: false,
    };

    if (!idOrSlug) {
      return filter;
    }

    if (Types.ObjectId.isValid(idOrSlug)) {
      filter.$and = [
        {
          $or: [{ _id: new Types.ObjectId(idOrSlug) }, { slug: idOrSlug }],
        },
      ];
      return filter;
    }

    filter.slug = idOrSlug;
    return filter;
  }

  private requireOrganizationObjectId(organizationId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(organizationId)) {
      throw new ValidationException('Organization context is required');
    }

    return new Types.ObjectId(organizationId);
  }

  private toOrganizationScope(
    organizationId: string,
  ): FilterQuery<SkillDocument> | null {
    if (!Types.ObjectId.isValid(organizationId)) {
      return null;
    }

    return { organization: new Types.ObjectId(organizationId) };
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
