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
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { withSkillWriteSession } from '@api/collections/skills/services/skill-write-session';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { classifyRepoChange } from '@api/shared/repo-sync/classify-repo-change';
import type {
  RepoSyncChange,
  RepoSyncDecision,
} from '@genfeedai/contracts/interfaces/admin/repo-sync.interface';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { sha256Hex, stableStringify } from '@libs/utils/canonical-hash.util';
import { Injectable, Optional } from '@nestjs/common';

export type SkillCatalogSeedResult = {
  inserted: number;
  skipped: number;
  updated: number;
};

export type SkillCatalogItemDetail = {
  /** The stored text as a diff base. Absent for a skill that is not stored yet. */
  after: string;
  before?: string;
  change: RepoSyncChange;
  decision?: RepoSyncDecision;
};

export type SkillCatalogReconcileOptions = {
  /** What to do with skills edited here and changed in the repo, by slug. */
  decisions?: Readonly<Record<string, RepoSyncDecision>>;
  /** Report what a live run would write, and write nothing. */
  dryRun?: boolean;
  /** Called once per skill with what happened (or would happen) to it. */
  onOutcome?: (
    slug: string,
    outcome: keyof SkillCatalogSeedResult,
    detail: SkillCatalogItemDetail,
  ) => void;
};

/**
 * The fields a person can see and edit. A refresh compares these to tell a
 * skill edited here from one that only drifted; every other managed field is
 * reconciled silently.
 */
const CONTENT_KEYS = [
  'defaultInstructions',
  'description',
  'name',
  'systemPromptTemplate',
] as const;

function contentFingerprint(config: Record<string, unknown>): string {
  return sha256Hex(
    stableStringify(
      Object.fromEntries(CONTENT_KEYS.map((key) => [key, config[key] ?? null])),
    ),
  );
}

function skillDocument(config: Record<string, unknown>): string {
  return `name: ${String(config.name ?? '')}\ndescription: ${String(config.description ?? '')}\n\n${String(config.defaultInstructions ?? '')}`;
}

@Traced()
@Injectable()
export class SkillCatalogSeedService {
  private readonly context = 'SkillCatalogSeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Optional() private readonly skillLibrary?: SkillLibraryService,
  ) {}

  async backfillOrganizations(): Promise<number> {
    return this.skillLibrary?.backfillExistingOrganizations() ?? 0;
  }

  async reconcileCatalog(
    catalog: readonly FirstPartySkillDefinition[] = loadFirstPartySkillDefinitions(),
    options: SkillCatalogReconcileOptions = {},
  ): Promise<SkillCatalogSeedResult> {
    const result: SkillCatalogSeedResult = {
      inserted: 0,
      skipped: 0,
      updated: 0,
    };
    const failedSlugs: string[] = [];

    for (const definition of catalog) {
      try {
        const { detail, outcome } = await this.upsertDefinition(
          definition,
          options.dryRun === true,
          options.decisions?.[definition.slug],
        );
        result[outcome] += 1;
        options.onOutcome?.(definition.slug, outcome, detail);
      } catch (error) {
        failedSlugs.push(definition.slug);
        this.logger.error(
          `First-party skill catalog entry failed to reconcile: ${definition.slug}`,
          error instanceof Error ? error : new Error(String(error)),
          this.context,
        );
      }
    }

    if (failedSlugs.length > 0) {
      throw new Error(
        `First-party skill catalog reconcile failed for: ${failedSlugs.join(', ')}`,
      );
    }

    this.logger.log(
      `First-party skill catalog ${options.dryRun ? 'dry run' : 'reconciled'} (inserted=${result.inserted}, updated=${result.updated}, skipped=${result.skipped})`,
      this.context,
    );

    return result;
  }

  private buildCatalogConfig(
    definition: FirstPartySkillDefinition,
  ): Record<string, unknown> {
    const config: Record<string, unknown> = {
      ...(definition.catalogOrigin
        ? {
            catalogOrigin: definition.catalogOrigin,
            sourceRepository: definition.sourceRepository,
            ...(definition.sourceCommit
              ? { sourceCommit: definition.sourceCommit }
              : {}),
            sourcePath: definition.sourcePath,
            sourcePackageHash: definition.sourcePackageHash,
            instructionsHash: definition.instructionsHash,
            catalogCompilerVersion: definition.catalogCompilerVersion,
          }
        : {}),
      category: definition.category,
      channels: definition.channels,
      defaultInstructions: definition.instructions,
      description: definition.description,
      isBuiltIn: true,
      isEnabled: true,
      modalities: definition.modalities,
      name: definition.name,
      requiredProviders: [],
      runsOn: definition.runsOn,
      slug: definition.slug,
      source: 'built_in',
      status: 'published',
      surfaces: definition.surfaces,
      systemPromptTemplate: definition.instructions,
      toolOverrides: [],
      version: definition.version,
      workflowStage: definition.workflowStage,
    };
    // What a later refresh treats as the repo version this row was loaded from.
    config.sourceContentHash = contentFingerprint(config);
    return config;
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
    isDryRun: boolean,
    decision?: RepoSyncDecision,
  ): Promise<{
    detail: SkillCatalogItemDetail;
    outcome: keyof SkillCatalogSeedResult;
  }> {
    const managedConfig = this.buildCatalogConfig(definition);
    const after = skillDocument(managedConfig);
    // tenant-scope-ignore: catalog provisioner reads migration-owned global ids
    const existing = await this.prisma.skill.findUnique({
      where: { id: definition.id },
    });

    if (!existing) {
      if (isDryRun)
        return { detail: { after, change: 'new' }, outcome: 'inserted' };
      await withSkillWriteSession(
        this.prisma,
        { origin: 'provisioning' },
        (tx) =>
          // tenant-scope-ignore: first-party catalog rows are organizationId-null
          tx.skill.create({
            data: {
              config: managedConfig as Prisma.InputJsonValue,
              id: definition.id,
              isDeleted: false,
              label: definition.name,
              organizationId: null,
            },
          }),
      );
      return { detail: { after, change: 'new' }, outcome: 'inserted' };
    }

    if (existing.organizationId !== null) {
      this.logger.warn(
        `Skipping first-party skill ${definition.slug}: id ${definition.id} is organization-owned`,
        this.context,
      );
      return { detail: { after, change: 'unchanged' }, outcome: 'skipped' };
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
      return { detail: { after, change: 'unchanged' }, outcome: 'skipped' };
    }

    // A row loaded before the content hash was recorded is treated as
    // untouched: only the catalog provisioner wrote it.
    const localHash = contentFingerprint(existingConfig);
    const repoHash = String(managedConfig.sourceContentHash);
    const change = classifyRepoChange({
      base:
        typeof existingConfig.sourceContentHash === 'string'
          ? existingConfig.sourceContentHash
          : localHash,
      local: localHash,
      repo: repoHash,
    });
    const detail: SkillCatalogItemDetail = {
      after,
      before: skillDocument(existingConfig),
      change,
      ...(change === 'conflict' && decision ? { decision } : {}),
    };

    // Edited here and the repo has not changed, or edited on both sides with
    // no decision yet: leave the row alone.
    if (change === 'edited' || (change === 'conflict' && !decision)) {
      return { detail, outcome: 'skipped' };
    }

    // Keep mine: take the repo's provenance and the other managed fields, keep
    // the edited text. The row then reads as edited until the repo changes again.
    const keepsMine = change === 'conflict' && decision === 'mine';
    const nextConfig: Record<string, unknown> = {
      ...existingConfig,
      ...managedConfig,
    };
    if (keepsMine) {
      for (const key of CONTENT_KEYS) nextConfig[key] = existingConfig[key];
    }
    if (definition.catalogOrigin && !definition.sourceCommit) {
      delete nextConfig.sourceCommit;
    }

    if (
      !keepsMine &&
      existing.isDeleted === false &&
      existing.label === definition.name &&
      existingConfig.sourceCommit === nextConfig.sourceCommit &&
      Object.entries(managedConfig).every(
        ([key, value]) =>
          JSON.stringify(existingConfig[key]) === JSON.stringify(value),
      )
    ) {
      return { detail, outcome: 'skipped' };
    }

    if (isDryRun) return { detail, outcome: 'updated' };

    await withSkillWriteSession(this.prisma, { origin: 'provisioning' }, (tx) =>
      // tenant-scope-ignore: updates the same migration-owned global catalog id
      tx.skill.update({
        data: {
          config: nextConfig as Prisma.InputJsonValue,
          isDeleted: false,
          label: keepsMine ? existing.label : definition.name,
          organizationId: null,
        },
        where: { id: definition.id },
      }),
    );

    return { detail, outcome: 'updated' };
  }
}
