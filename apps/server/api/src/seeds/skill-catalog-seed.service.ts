/**
 * Idempotent provisioner for first-party product SKILL.md catalog rows.
 *
 * Existing handler identities (cskillbuiltincontentgeo and friends) stay
 * put. New first-party slugs get cskillbuiltin + compact-slug ids. Org-owned
 * customized forks are never overwritten.
 */

import type { FirstPartySkillDefinition } from '@api/collections/skills/catalog/first-party-skill.types';
import { loadFirstPartySkillDefinitions } from '@api/collections/skills/catalog/first-party-skill-loader';
import { isBuiltInSkillIdentity } from '@api/collections/skills/constants/skill-validation.constant';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

export type SkillCatalogSeedResult = {
  inserted: number;
  skipped: number;
  updated: number;
};

@Injectable()
export class SkillCatalogSeedService implements OnApplicationBootstrap {
  private readonly context = 'SkillCatalogSeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcileCatalog();
    } catch (error) {
      this.logger.error(
        'First-party skill catalog seed failed — agent skills may be incomplete',
        error instanceof Error ? error : new Error(String(error)),
        this.context,
      );
    }
  }

  async reconcileCatalog(
    catalog: readonly FirstPartySkillDefinition[] = loadFirstPartySkillDefinitions(),
  ): Promise<SkillCatalogSeedResult> {
    const result: SkillCatalogSeedResult = {
      inserted: 0,
      skipped: 0,
      updated: 0,
    };

    for (const definition of catalog) {
      const outcome = await this.upsertDefinition(definition);
      result[outcome] += 1;
    }

    this.logger.log(
      `First-party skill catalog reconciled (inserted=${result.inserted}, updated=${result.updated}, skipped=${result.skipped})`,
      this.context,
    );

    return result;
  }

  private buildCatalogConfig(
    definition: FirstPartySkillDefinition,
  ): Record<string, unknown> {
    return {
      category: definition.category,
      channels: definition.channels,
      defaultInstructions: definition.instructions,
      description: definition.description,
      isBuiltIn: true,
      isEnabled: true,
      modalities: definition.modalities,
      name: definition.name,
      requiredProviders: [],
      slug: definition.slug,
      source: 'built_in',
      status: 'published',
      systemPromptTemplate: definition.instructions,
      toolOverrides: [],
      version: definition.version,
      workflowStage: definition.workflowStage,
    };
  }

  private readConfig(row: { config: unknown }): Record<string, unknown> {
    if (
      row.config &&
      typeof row.config === 'object' &&
      !Array.isArray(row.config)
    ) {
      return row.config as Record<string, unknown>;
    }
    return {};
  }

  private async upsertDefinition(
    definition: FirstPartySkillDefinition,
  ): Promise<keyof SkillCatalogSeedResult> {
    // tenant-scope-ignore: catalog provisioner reads migration-owned global ids
    const existing = await this.prisma.skill.findUnique({
      where: { id: definition.id },
    });

    if (!existing) {
      // tenant-scope-ignore: first-party catalog rows are organizationId-null
      await this.prisma.skill.create({
        data: {
          config: this.buildCatalogConfig(definition) as Prisma.InputJsonValue,
          id: definition.id,
          isDeleted: false,
          label: definition.name,
          organizationId: null,
        },
      });
      return 'inserted';
    }

    if (existing.organizationId !== null) {
      this.logger.warn(
        `Skipping first-party skill ${definition.slug}: id ${definition.id} is organization-owned`,
        this.context,
      );
      return 'skipped';
    }

    const existingConfig = this.readConfig(existing);
    if (
      !isBuiltInSkillIdentity(existing.id, existingConfig.slug) ||
      existingConfig.source !== 'built_in' ||
      existingConfig.isBuiltIn !== true
    ) {
      this.logger.warn(
        `Skipping first-party skill ${definition.slug}: existing global row is not a trusted catalog identity`,
        this.context,
      );
      return 'skipped';
    }

    const nextConfig = {
      ...existingConfig,
      ...this.buildCatalogConfig(definition),
    };

    if (
      existing.isDeleted === false &&
      existingConfig.defaultInstructions === nextConfig.defaultInstructions &&
      existingConfig.systemPromptTemplate === nextConfig.systemPromptTemplate &&
      existingConfig.version === nextConfig.version &&
      existingConfig.description === nextConfig.description &&
      existingConfig.name === nextConfig.name
    ) {
      return 'skipped';
    }

    // tenant-scope-ignore: updates the same migration-owned global catalog id
    await this.prisma.skill.update({
      data: {
        config: nextConfig as Prisma.InputJsonValue,
        isDeleted: false,
        label: definition.name,
        organizationId: null,
      },
      where: { id: definition.id },
    });

    return 'updated';
  }
}
