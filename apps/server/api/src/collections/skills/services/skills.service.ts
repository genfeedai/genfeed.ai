import {
  DEFAULT_FIRST_PARTY_SKILL_SLUGS,
  isDefaultFirstPartySkillSlug,
  resolveDefaultFirstPartySkillSlugs,
} from '@api/collections/skills/catalog/default-first-party-skills';
import {
  BUILT_IN_SKILL_CATALOG,
  isBuiltInSkillIdentity,
  isReservedBuiltInSkillSlug,
  MAX_CONFIGURED_SKILL_SLUGS,
  MAX_SKILL_SLUG_LENGTH,
} from '@api/collections/skills/constants/skill-validation.constant';
import type {
  CreateSkillDto,
  CustomizeSkillDto,
  ImportSkillDto,
  UpdateSkillDto,
} from '@api/collections/skills/dto/skill.dto';
import {
  SKILL_STATUSES,
  type SkillDocument,
} from '@api/collections/skills/schemas/skill.schema';
import {
  buildAccessibleSkillWhere,
  buildBuiltInCatalogWhere,
} from '@api/collections/skills/services/skill-access-where';
import {
  callerCanSeeSkill,
  grantedSkillIds,
  updateOwnedPersonalSkill,
} from '@api/collections/skills/services/skill-caller-scope';
import {
  normalizeRequestedSkillSlugs,
  unavailableRequestedSkill,
} from '@api/collections/skills/utils/requested-skill-slugs.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { scopedWhere } from '@api/index';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { ByokProvider, type SkillSurface } from '@genfeedai/contracts';
import type { IBrandEffectiveSkillSelection } from '@genfeedai/contracts/interfaces';
import { isSkillOnSurface } from '@genfeedai/helpers';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface ListSkillsOptions {
  /** Narrow the catalog to skills offered on one composer surface. */
  surface?: SkillSurface;
}

export interface ResolveBrandSkillsOptions {
  actorUserId?: string;
  agentType?: string;
  channel?: string;
  fallbackToDefaultCatalog?: boolean;
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

export interface InstallManagedSkillPackageInput {
  category: CreateSkillDto['category'];
  channels: CreateSkillDto['channels'];
  checksum: string;
  description: string;
  files: Array<{ content: string; path: string }>;
  instructions: string;
  modalities: CreateSkillDto['modalities'];
  name: string;
  slug: string;
  version: string;
  workflowStage: CreateSkillDto['workflowStage'];
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly byokProviderFactoryService: ByokProviderFactoryService,
    _loggerService: LoggerService,
  ) {}

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is string =>
            typeof entry === 'string' && entry.trim().length > 0,
        )
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
   * The Prisma Skill model stores domain fields in `config` alongside its
   * canonical identifiers and timestamps.
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
      integrity: payload['integrity'],
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
      surfaces: payload['surfaces'],
      systemPromptTemplate: payload['systemPromptTemplate'],
      title: payload['title'],
      toolOverrides: payload['toolOverrides'],
      version: payload['version'],
      workflowStage: payload['workflowStage'],
    };
  }

  async createSkill(
    organizationId: string,
    payload: CreateSkillDto,
  ): Promise<SkillDocument> {
    this.requireOrganizationId(organizationId);
    this.assertSkillStatus(payload.status);

    if (payload.isBuiltIn === true) {
      throw new ValidationException(
        'Built-in skills can only be created by internal catalog provisioning',
        'isBuiltIn',
        true,
      );
    }

    if (payload.source === 'built_in' || payload.source === 'customized') {
      throw new ValidationException(
        payload.source === 'built_in'
          ? 'Built-in skills can only be created by internal catalog provisioning'
          : 'Customized skills can only be created by forking an existing skill',
        'source',
        payload.source,
      );
    }

    if (isReservedBuiltInSkillSlug(payload.slug)) {
      throw new ValidationException(
        'This slug is reserved for the built-in skill catalog',
        'slug',
        payload.slug,
      );
    }

    const config = this.buildSkillConfig({
      ...(payload as unknown as Record<string, unknown>),
      isBuiltIn: false,
      isEnabled: payload.status !== 'disabled',
      source: payload.source ?? 'custom',
      status: payload.status ?? 'published',
    });

    const result = await this.prisma.skill.create({
      data: {
        config: config as Prisma.InputJsonValue,
        isDeleted: false,
        label: payload.name,
        organizationId,
      },
    });

    return this.normalizeSkill(result);
  }

  importSkill(
    organizationId: string,
    payload: ImportSkillDto,
  ): Promise<SkillDocument> {
    this.requireOrganizationId(organizationId);

    return this.createSkill(organizationId, {
      ...payload,
      isBuiltIn: false,
      source: 'imported',
      status: payload.status ?? 'draft',
    });
  }

  async installManagedSkillPackage(
    organizationId: string,
    payload: InstallManagedSkillPackageInput,
  ): Promise<SkillDocument> {
    this.requireOrganizationId(organizationId);

    if (isReservedBuiltInSkillSlug(payload.slug)) {
      throw new ValidationException(
        'This slug is reserved for the built-in skill catalog',
        'slug',
        payload.slug,
      );
    }

    const sourceListingId = `skills-pro:${payload.slug}`;
    const config = this.buildSkillConfig({
      ...payload,
      defaultInstructions: payload.instructions,
      integrity: { algorithm: 'sha256', checksum: payload.checksum },
      isBuiltIn: false,
      isEnabled: true,
      source: 'imported',
      sourceListingId,
      status: 'published',
      systemPromptTemplate: payload.instructions,
    });
    const existing = await this.prisma.skill.findFirst({
      where: {
        config: { equals: sourceListingId, path: ['sourceListingId'] },
        isDeleted: false,
        isQuarantined: false,
        organizationId,
      },
    });

    const stored = existing
      ? await this.prisma.skill.update({
          data: {
            config: config as Prisma.InputJsonValue,
            label: payload.name,
          },
          where: scopedWhere(organizationId, { id: existing.id }),
        })
      : await this.prisma.skill.create({
          data: {
            config: config as Prisma.InputJsonValue,
            isDeleted: false,
            label: payload.name,
            organizationId,
          },
        });

    return this.normalizeSkill(stored);
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

    if (isReservedBuiltInSkillSlug(customizedSlug)) {
      throw new ValidationException(
        'This slug is reserved for the built-in skill catalog',
        'slug',
        customizedSlug,
      );
    }

    const customName =
      payload.name?.trim() ||
      `${this.readString(baseConfig.name) ?? 'Skill'} Custom`;

    const config = this.buildSkillConfig({
      category: baseConfig['category'],
      channels: baseConfig['channels'],
      configSchema: baseConfig['configSchema'],
      defaultInstructions: baseConfig['defaultInstructions'],
      description: payload.description?.trim() || baseConfig['description'],
      files: baseConfig['files'],
      inputSchema: baseConfig['inputSchema'],
      isBuiltIn: false,
      isEnabled: true,
      modalities: baseConfig['modalities'],
      name: customName,
      outputSchema: baseConfig['outputSchema'],
      requiredProviders: baseConfig['requiredProviders'],
      reviewDefaults: baseConfig['reviewDefaults'],
      slug: customizedSlug,
      source: 'customized',
      sourceListingId: baseConfig['sourceListingId'],
      status: 'draft',
      surfaces: baseConfig['surfaces'],
      systemPromptTemplate: baseConfig['systemPromptTemplate'],
      toolOverrides: baseConfig['toolOverrides'],
      version: baseConfig['version'],
      workflowStage: baseConfig['workflowStage'],
    });

    const result = await this.prisma.skill.create({
      data: {
        config: {
          ...config,
          baseSkillId: String(baseSkill.id),
        } as Prisma.InputJsonValue,
        isDeleted: false,
        label: customName,
        organizationId,
      },
    });

    return this.normalizeSkill(result);
  }

  async updateSkill(
    organizationId: string,
    idOrSlug: string,
    payload: UpdateSkillDto,
    userId?: string,
  ): Promise<SkillDocument> {
    this.requireOrganizationId(organizationId);
    this.assertSkillStatus(payload.status);
    const skill = await this.getSkillById(organizationId, idOrSlug, userId);
    const isPersonalOwner =
      userId !== undefined &&
      skill?.ownerKind === 'user' &&
      skill.ownerUserId === userId &&
      skill.organizationId == null;

    // Catalog-global rows stay readable and are forked through customizeSkill.
    // Another user's personal skill is not visible through this caller's where.
    if (
      !skill ||
      (skill.organizationId !== organizationId && !isPersonalOwner)
    ) {
      throw new NotFoundException('Skill', idOrSlug);
    }

    if (
      payload.slug !== undefined &&
      isReservedBuiltInSkillSlug(payload.slug)
    ) {
      throw new ValidationException(
        'This slug is reserved for the built-in skill catalog',
        'slug',
        payload.slug,
      );
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

    if (payload.status !== undefined) {
      mergedConfig.isEnabled = payload.status !== 'disabled';
    }

    const label =
      payload.name ?? (existingConfig['name'] as string | undefined);
    if (isPersonalOwner && userId) {
      const updated = await updateOwnedPersonalSkill(
        this.prisma,
        String(skill.id),
        userId,
        mergedConfig,
        label,
      );
      return this.normalizeSkill(updated);
    }

    const updated = await this.prisma.skill.update({
      data: {
        config: mergedConfig as Prisma.InputJsonValue,
        label,
        organizationId,
      },
      where: scopedWhere(organizationId, { id: String(skill.id) }),
    });

    return this.normalizeSkill(updated);
  }

  async listAllForOrg(
    organizationId: string,
    options: ListSkillsOptions = {},
    userId?: string,
  ): Promise<SkillDocument[]> {
    this.requireOrganizationId(organizationId);

    const results =
      // tenant-scope-ignore: visible skills are the organization, the caller's personal rows, granted rows, or the trusted catalog
      await this.prisma.skill.findMany({
        orderBy: [{ createdAt: 'desc' }],
        where: await this.visibleSkillWhere(organizationId, userId),
      });
    const docs = results.map((r) => this.normalizeSkill(r));
    const { surface } = options;

    // `surfaces` lives in the `config` JSON and is derived for rows that
    // predate it, so the surface filter cannot push down into Prisma.
    return surface
      ? docs.filter((doc) => isSkillOnSurface(doc, surface))
      : docs;
  }

  async getAvailableForOrg(organizationId: string): Promise<SkillDocument[]> {
    this.requireOrganizationId(organizationId);

    const allSkills =
      // tenant-scope-ignore: the helper requires this organization or the trusted catalog, and isDeleted false
      await this.prisma.skill.findMany({
        where: buildAccessibleSkillWhere(
          organizationId,
        ) as Prisma.SkillWhereInput,
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
    userId?: string,
  ): Promise<SkillDocument | null> {
    this.requireOrganizationId(organizationId);
    const where = await this.visibleSkillWhere(organizationId, userId);

    const builtInIdentity = BUILT_IN_SKILL_CATALOG.find(
      ({ id, slug }) => id === idOrSlug || slug === idOrSlug,
    );

    if (builtInIdentity) {
      // tenant-scope-ignore: trusted catalog lookup ORs this tenant with fixed migration-owned global ids; both arms require isDeleted false
      const builtIn = await this.prisma.skill.findFirst({
        where: {
          ...where,
          id: builtInIdentity.id,
        } as Prisma.SkillWhereInput,
      });

      return builtIn ? this.normalizeSkill(builtIn) : null;
    }

    // tenant-scope-ignore: caller visibility is organization, personal owner, grant, or trusted catalog, each with isDeleted false
    const result = await this.prisma.skill.findFirst({
      where: {
        ...where,
        OR: [{ id: idOrSlug }],
      } as Prisma.SkillWhereInput,
    });

    if (!result) {
      // Try by slug (stored in config.slug) — fall back to in-memory scan for slug match
      // tenant-scope-ignore: caller visibility is organization, personal owner, grant, or trusted catalog, each with isDeleted false
      const all = await this.prisma.skill.findMany({
        where,
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
    this.requireOrganizationId(organizationId);

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

  async assertAccessibleSkillSlugs(
    organizationId: string,
    skillSlugs: string[],
  ): Promise<void> {
    this.requireOrganizationId(organizationId);
    this.assertConfiguredSkillSlugs(skillSlugs);

    if (skillSlugs.length === 0) {
      return;
    }

    const accessibleSkillSlugs =
      await this.getAccessibleSkillSlugSet(organizationId);
    const inaccessibleSkillSlugs = [...new Set(skillSlugs)].filter(
      (slug) => !accessibleSkillSlugs.has(slug),
    );

    if (inaccessibleSkillSlugs.length > 0) {
      throw new ValidationException(
        `Unknown or inaccessible skill slugs: ${inaccessibleSkillSlugs.join(', ')}`,
        'enabledSkills',
        inaccessibleSkillSlugs,
      );
    }
  }

  /**
   * The brand's effective skill selection. Defaults apply when
   * `useDefaultSkills` is true, or while it is unset and the explicit list is
   * empty (the legacy rule). An explicit `false` with an empty list means
   * no skills at all.
   */
  async getBrandSkillSelection(
    organizationId: string,
    brandId: string,
    userId?: string,
  ): Promise<IBrandEffectiveSkillSelection> {
    this.requireOrganizationId(organizationId);

    const brand = await findOrThrow(
      this.prisma.brand,
      { where: scopedWhere(organizationId, { id: brandId }) },
      'Brand',
      brandId,
    );

    const agentConfig = brand.agentConfig as Record<string, unknown> | null;
    const storedEnabledSkills = [
      ...new Set(this.readStringArray(agentConfig?.enabledSkills)),
    ];
    const useDefaultSkills = agentConfig?.useDefaultSkills;
    const isUsingDefaults =
      useDefaultSkills === true ||
      (useDefaultSkills === undefined && storedEnabledSkills.length === 0);
    const candidateSlugs = isUsingDefaults
      ? [...DEFAULT_FIRST_PARTY_SKILL_SLUGS]
      : storedEnabledSkills;

    if (candidateSlugs.length === 0) {
      return { enabledSlugs: [], isUsingDefaults };
    }

    const accessibleSkillSlugs = await this.getAccessibleSkillSlugSet(
      organizationId,
      true,
      userId,
      brandId,
    );

    return {
      enabledSlugs: candidateSlugs.filter((slug) =>
        accessibleSkillSlugs.has(slug),
      ),
      isUsingDefaults,
    };
  }

  async getEnabledSkillSlugs(
    organizationId: string,
    brandId: string,
    requestedSlugs?: string[],
  ): Promise<string[]> {
    const { enabledSlugs } = await this.getBrandSkillSelection(
      organizationId,
      brandId,
    );

    if (!requestedSlugs || requestedSlugs.length === 0) {
      return enabledSlugs;
    }

    return requestedSlugs.filter((slug) => enabledSlugs.includes(slug));
  }

  async resolveBrandSkills(
    organizationId: string,
    brandId: string,
    options: ResolveBrandSkillsOptions = {},
  ): Promise<ResolvedBrandSkill[]> {
    this.requireOrganizationId(organizationId);

    const selection = await this.getBrandSkillSelection(
      organizationId,
      brandId,
      options.actorUserId,
    );
    const requested =
      normalizeRequestedSkillSlugs(options.requestedSlugs) ?? [];
    let enabledSlugs = selection.enabledSlugs;

    if (selection.isUsingDefaults) {
      // A turn packs the context-relevant subset of the defaults, never the
      // whole default set.
      enabledSlugs = options.fallbackToDefaultCatalog
        ? resolveDefaultFirstPartySkillSlugs({
            agentType: options.agentType,
            channel: options.channel,
            modality: options.modality,
          }).filter((slug) => selection.enabledSlugs.includes(slug))
        : [];
    }

    enabledSlugs = [...new Set([...enabledSlugs, ...requested])];
    if (enabledSlugs.length === 0) return [];

    const actorUserId = options.actorUserId;
    const grantIds = new Set(
      await grantedSkillIds(this.prisma, organizationId, actorUserId, brandId),
    );
    // tenant-scope-ignore: caller visibility is organization, personal owner, grant, or trusted catalog, each with isDeleted false
    const all =
      // tenant-scope-ignore: resolution includes this organization, the caller's personal rows, explicit grants, and the trusted catalog
      await this.prisma.skill.findMany({
        where: await this.visibleSkillWhere(
          organizationId,
          actorUserId,
          brandId,
        ),
      });

    // Filter by enabled slugs (config.slug). Personal and granted rows stay
    // caller-scoped; a null organization id is not enough to include a skill.
    const skills = all
      .filter(
        (row) =>
          !row.isDeleted &&
          callerCanSeeSkill(
            row,
            organizationId,
            actorUserId,
            grantIds,
            this.isTrustedBuiltInSkill(row),
          ),
      )
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

      const existing = resolvedSkills.find(
        (entry) => entry.skill.slug === skillSlug,
      );
      if (existing) {
        if (String(existing.skill.id) !== String(skillDoc.id)) {
          throw new BadRequestException(
            'Duplicate skill configuration is available for this generation. Resolve duplicate skill slugs before generating.',
          );
        }
        continue;
      }
      resolvedSkills.push({
        priority: enabledSlugs.indexOf(skillSlug),
        skill: skillDoc,
        targetSkill: skillDoc,
        variant: null,
      });
    }

    if (
      requested.some(
        (slug) => !resolvedSkills.some((entry) => entry.skill.slug === slug),
      )
    ) {
      throw unavailableRequestedSkill();
    }
    return resolvedSkills.sort((left, right) => left.priority - right.priority);
  }

  /**
   * Normalize a raw Prisma Skill row into a SkillDocument-compatible shape.
   * Spreads config fields to the top level for the API document contract.
   */
  private normalizeSkill(row: Record<string, unknown>): SkillDocument {
    const config = this.getConfig(row);
    return {
      ...config,
      config,
      id: row.id,
      createdAt: row.createdAt,
      // Built-in slugs the runtime injects while the brand has no explicit
      // `enabledSkills`. The settings catalog shows these as enabled by default.
      isDefault:
        row.organizationId === null &&
        isDefaultFirstPartySkillSlug(config.slug),
      audience: row.audience,
      currentVersionId: row.currentVersionId,
      isDeleted: row.isDeleted,
      isQuarantined: row.isQuarantined,
      label: row.label,
      organizationId: row.organizationId,
      ownerKind: row.ownerKind,
      ownerUserId: row.ownerUserId,
      publishedVersionId: row.publishedVersionId,
      sharedVersionId: row.sharedVersionId,
      revision: row.revision,
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

  private async visibleSkillRows(
    organizationId: string,
    userId?: string,
    brandId?: string | null,
  ) {
    if (userId) {
      // tenant-scope-ignore: caller visibility is this organization, the caller's personal rows, live grants, or the trusted catalog
      return this.prisma.skill.findMany({
        where: await this.visibleSkillWhere(organizationId, userId, brandId),
      });
    }
    // tenant-scope-ignore: slug availability is this organization or the trusted built-in catalog, both with isDeleted false
    return this.prisma.skill.findMany({
      where: {
        AND: [
          { isDeleted: false },
          { isQuarantined: false },
          { OR: [{ organizationId }, buildBuiltInCatalogWhere()] },
        ],
      },
    });
  }

  private async visibleSkillWhere(
    organizationId: string,
    userId?: string,
    brandId?: string | null,
  ): Promise<Prisma.SkillWhereInput> {
    this.requireOrganizationId(organizationId);
    return buildAccessibleSkillWhere(
      organizationId,
      userId,
      await grantedSkillIds(this.prisma, organizationId, userId, brandId),
    ) as Prisma.SkillWhereInput;
  }

  private assertConfiguredSkillSlugs(
    skillSlugs: unknown,
  ): asserts skillSlugs is string[] {
    const isValid =
      Array.isArray(skillSlugs) &&
      skillSlugs.length <= MAX_CONFIGURED_SKILL_SLUGS &&
      new Set(skillSlugs).size === skillSlugs.length &&
      skillSlugs.every(
        (slug) =>
          typeof slug === 'string' &&
          slug.trim().length > 0 &&
          slug.length <= MAX_SKILL_SLUG_LENGTH,
      );

    if (!isValid) {
      throw new ValidationException(
        'Enabled skills must be a unique list of valid skill slugs',
        'enabledSkills',
        skillSlugs,
      );
    }
  }

  private requireOrganizationId(
    organizationId: string | null | undefined,
  ): void {
    if (typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new ValidationException('Organization context is required');
    }
  }

  private assertSkillStatus(status: unknown): void {
    if (
      status !== undefined &&
      !SKILL_STATUSES.some((allowedStatus) => allowedStatus === status)
    ) {
      throw new ValidationException('Invalid skill status', 'status', status);
    }
  }

  private async getAccessibleSkillSlugSet(
    organizationId: string,
    onlyEnabled = false,
    userId?: string,
    brandId?: string | null,
  ): Promise<Set<string>> {
    this.requireOrganizationId(organizationId);
    const grantIds = new Set(
      await grantedSkillIds(this.prisma, organizationId, userId, brandId),
    );
    const rows = await this.visibleSkillRows(organizationId, userId, brandId);

    return new Set(
      rows
        .filter(
          (row) =>
            callerCanSeeSkill(
              row,
              organizationId,
              userId,
              grantIds,
              this.isTrustedBuiltInSkill(row),
            ) &&
            (!onlyEnabled || this.isEnabledSkill(row)),
        )
        .map((row) => this.readString(this.getConfig(row).slug))
        .filter((slug): slug is string => slug !== undefined),
    );
  }

  private isTrustedBuiltInSkill(row: Record<string, unknown>): boolean {
    const config = this.getConfig(row);

    return (
      row.organizationId === null &&
      config.isBuiltIn === true &&
      config.source === 'built_in' &&
      isBuiltInSkillIdentity(row.id, config.slug)
    );
  }

  private isEnabledSkill(row: Record<string, unknown>): boolean {
    const config = this.getConfig(row);

    return config.isEnabled === true && config.status !== 'disabled';
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

    return true;
  }
}
