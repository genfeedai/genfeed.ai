import { createHash } from 'node:crypto';
import { isDefaultFirstPartySkillSlug } from '@api/collections/skills/catalog/default-first-party-skills';
import { isReservedBuiltInSkillSlug } from '@api/collections/skills/constants/skill-validation.constant';
import {
  type ArchiveSkillDto,
  type CreateScopedSkillDto,
  type GrantSkillDto,
  type PublishSkillDto,
  type RollbackSkillDto,
  readOptionalAudience,
} from '@api/collections/skills/dto/skill-library.dto';
import { SkillVersionListQueryDto } from '@api/collections/skills/dto/skill-version-query.dto';
import {
  CLOSED_SKILL_SOURCE_POLICY,
  grantMatchesActor,
  PUBLIC_FREE_SOURCE_POLICY,
  resolveSkillCapabilities,
  type SkillAudience,
  type SkillCapabilityActor,
  type SkillCapabilityGrant,
  type SkillCapabilitySubject,
  type SkillOwnerKind,
  type SkillSourcePolicy,
  skillGrantRecipientClauses,
} from '@api/collections/skills/policy/skill-capabilities';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import {
  type RecordedSkillExclusion,
  type RecordedSkillVersion,
  resolutionItems,
} from '@api/collections/skills/services/skill-resolution-evidence';
import {
  applyAuthorizedVersionBody,
  loadAuthorizedSkillVersions,
} from '@api/collections/skills/services/skill-version-loader';
import { withSkillWriteSession } from '@api/collections/skills/services/skill-write-session';
import { parseSkillPackageManifest } from '@api/collections/skills/utils/skill-package-manifest.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  SkillVersionListQueryV1,
  SkillVersionMetadataV1,
  SkillVersionReadPageV1,
  SkillVersionReadParentV1,
  SkillVersionReadV1,
  SkillVersionSourceEvidenceV1,
} from '@genfeedai/contracts/interfaces/ai/skill-version-read.interface';
import type { Prisma } from '@genfeedai/prisma';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export interface SkillLibraryActor {
  brandId?: string | null;
  organizationId: string;
  userId: string;
}

export interface PinnedSkillExecution {
  contentHash: string;
  skillId: string;
  skillVersionId: string;
}

export type {
  RecordedSkillExclusion,
  RecordedSkillVersion,
} from '@api/collections/skills/services/skill-resolution-evidence';

interface SkillRow {
  audience: string | null;
  brandId: string | null;
  config: Prisma.JsonValue;
  currentVersionId: string | null;
  id: string;
  isDeleted: boolean;
  isQuarantined: boolean;
  label: string | null;
  organizationId: string | null;
  ownerKind: string | null;
  ownerUserId: string | null;
  publishedVersionId: string | null;
  revision: number;
  sharedVersionId: string | null;
}

const AUTHORED_POLICY: SkillSourcePolicy = {
  allowsDerivatives: true,
  allowsExport: true,
  allowsPublicPublication: true,
  allowsRead: true,
  allowsShare: true,
};

function versionReadObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Immutable source evidence only; current governance and live scope are separate. */
export function isVerifiedOrdinaryUploadVersionReadV1(
  parent: SkillVersionReadParentV1,
  genesis: SkillVersionSourceEvidenceV1,
  candidate: SkillVersionSourceEvidenceV1,
): boolean {
  if (
    parent.ownerKind !== 'user' ||
    !parent.ownerUserId ||
    parent.organizationId !== null ||
    parent.brandId !== null ||
    genesis.versionNumber !== 1
  )
    return false;
  const evidence = (row: SkillVersionSourceEvidenceV1): string | null => {
    if (
      !isWellFormedSkillVersionReadV1(parent.id, row) ||
      row.createdById !== parent.ownerUserId ||
      row.format !== 'genfeed.skill.legacy-snapshot.v1'
    )
      return null;
    const payload = versionReadObject(row.payload);
    const config = versionReadObject(payload?.config);
    const instructions = versionReadObject(payload?.instructions);
    const provenance = versionReadObject(config?.importProvenance);
    if (
      !payload ||
      !config ||
      !instructions ||
      !provenance ||
      payload.format !== row.format ||
      config.source !== 'imported' ||
      config.isBuiltIn !== false ||
      (config.sourceListingId !== undefined && config.sourceListingId !== null)
    )
      return null;
    if (
      provenance.format !== 'genfeed.skill.ordinary-upload.v1' ||
      provenance.importedByUserId !== parent.ownerUserId ||
      typeof provenance.packageChecksum !== 'string' ||
      !/^[a-f0-9]{64}$/.test(provenance.packageChecksum) ||
      config.checksum !== provenance.packageChecksum
    )
      return null;
    // Mirror the existing capture's selection, including explicit empty and whitespace bodies.
    const sourceField =
      typeof config.systemPromptTemplate === 'string' &&
      config.systemPromptTemplate.length > 0
        ? 'systemPromptTemplate'
        : typeof config.defaultInstructions === 'string' &&
            config.defaultInstructions.length > 0
          ? 'defaultInstructions'
          : null;
    const text = sourceField === null ? '' : config[sourceField];
    if (
      instructions.text !== row.instructionText ||
      text !== row.instructionText ||
      instructions.sourceField !== row.instructionSourceField ||
      sourceField !== row.instructionSourceField ||
      payload.instructionUsable !== row.instructionUsable ||
      // PostgreSQL btrim removes only ASCII spaces; preserve every captured character.
      row.instructionUsable !== /[^ ]/.test(row.instructionText)
    )
      return null;
    return provenance.packageChecksum;
  };
  const originalChecksum = evidence(genesis);
  return originalChecksum !== null && evidence(candidate) === originalChecksum;
}

function isWellFormedSkillVersionReadV1(
  skillId: string,
  row: SkillVersionSourceEvidenceV1,
): boolean {
  return (
    row.skillId === skillId &&
    Number.isInteger(row.versionNumber) &&
    row.versionNumber > 0 &&
    row.versionNumber <= 2147483647 &&
    row.id === `sv1_${skillId}_${row.versionNumber}` &&
    typeof row.instructionText === 'string' &&
    typeof row.contentHash === 'string' &&
    /^sha256:skill-v1:[a-f0-9]{64}$/.test(row.contentHash) &&
    typeof row.instructionHash === 'string' &&
    /^sha256:skill-instruction-v1:[a-f0-9]{64}$/.test(row.instructionHash) &&
    row.createdAt instanceof Date &&
    Number.isFinite(row.createdAt.getTime())
  );
}

@Injectable()
export class SkillLibraryService {
  constructor(private readonly prisma: PrismaService) {}

  async listVersions(
    actor: SkillLibraryActor,
    skillId: string,
    query: SkillVersionListQueryV1,
  ): Promise<SkillVersionReadPageV1> {
    const parsed = SkillVersionListQueryDto.parse(query);
    const { skill, governor } = await this.requireVersionReadScopeV1(
      actor,
      skillId,
    );
    if (!governor) {
      const version = await this.requireAuthorizedReadSnapshotV1(actor, skill);
      const items =
        parsed.beforeVersionNumber !== undefined &&
        version.versionNumber >= parsed.beforeVersionNumber
          ? []
          : [this.versionMetadataV1(version)];
      return { items, limit: parsed.limit, hasMore: false, nextCursor: null };
    }
    const genesis = await this.requireOrdinaryGenesisV1(skill);
    const rows = await this.prisma.skillVersion.findMany({
      where: {
        skillId,
        ...(parsed.beforeVersionNumber !== undefined
          ? { versionNumber: { lt: parsed.beforeVersionNumber } }
          : {}),
      },
      orderBy: { versionNumber: 'desc' },
      take: parsed.limit + 1,
    });
    let previous = parsed.beforeVersionNumber ?? 2147483648;
    for (const row of rows) {
      if (
        !isVerifiedOrdinaryUploadVersionReadV1(skill, genesis, row) ||
        row.versionNumber >= previous
      )
        throw new NotFoundException('Skill version');
      previous = row.versionNumber;
    }
    const items = rows
      .slice(0, parsed.limit)
      .map((row) => this.versionMetadataV1(row));
    const nextCursor =
      rows.length > parsed.limit ? items[items.length - 1].versionNumber : null;
    return {
      items,
      limit: parsed.limit,
      hasMore: nextCursor !== null,
      nextCursor,
    };
  }

  async getVersion(
    actor: SkillLibraryActor,
    skillId: string,
    versionId: string,
  ): Promise<SkillVersionReadV1> {
    const { skill, governor } = await this.requireVersionReadScopeV1(
      actor,
      skillId,
    );
    let version: SkillVersionSourceEvidenceV1;
    if (governor) {
      const genesis = await this.requireOrdinaryGenesisV1(skill);
      const candidate = await this.prisma.skillVersion.findFirst({
        where: { id: versionId, skillId },
      });
      if (
        !candidate ||
        !isVerifiedOrdinaryUploadVersionReadV1(skill, genesis, candidate)
      )
        throw new NotFoundException('Skill version');
      version = candidate;
    } else {
      version = await this.requireAuthorizedReadSnapshotV1(actor, skill);
      if (version.id !== versionId)
        throw new NotFoundException('Skill version');
    }
    return {
      ...this.versionMetadataV1(version),
      instructionText: version.instructionText,
    };
  }

  private async requireVersionReadScopeV1(
    actor: SkillLibraryActor,
    skillId: string,
  ) {
    if (
      typeof actor.userId !== 'string' ||
      !actor.userId ||
      typeof actor.organizationId !== 'string' ||
      !actor.organizationId ||
      (actor.brandId !== undefined &&
        actor.brandId !== null &&
        (typeof actor.brandId !== 'string' || !actor.brandId))
    )
      throw new NotFoundException('Skill version');
    const [user, organization, member] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: actor.userId, isDeleted: false },
        select: { id: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: actor.organizationId, isDeleted: false },
        select: { id: true },
      }),
      this.prisma.member.findFirst({
        where: {
          userId: actor.userId,
          organizationId: actor.organizationId,
          isActive: true,
          isDeleted: false,
        },
        select: {
          roleKey: true,
          brands: {
            where: { id: actor.brandId ?? '', isDeleted: false },
            select: { id: true },
          },
        },
      }),
    ]);
    if (!user || !organization || !member)
      throw new NotFoundException('Skill version');
    if (actor.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: {
          id: actor.brandId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (
        !brand ||
        (member.roleKey !== 'owner' &&
          member.roleKey !== 'admin' &&
          !member.brands.some((bound) => bound.id === actor.brandId))
      )
        throw new NotFoundException('Skill version');
    }
    // tenant-scope-ignore: personal/system parents lack organization; live capabilities below authorize the primary-key lookup
    const row = await this.prisma.skill.findFirst({
      where: { id: skillId, isDeleted: false, isQuarantined: false },
    });
    if (!row || row.isDeleted || row.isQuarantined)
      throw new NotFoundException('Skill version');
    const skill = row as unknown as SkillRow;
    const capabilities = await this.decide(actor, skill);
    if (!capabilities.canRead) throw new NotFoundException('Skill version');
    return { skill, governor: capabilities.canEdit };
  }

  private async requireOrdinaryGenesisV1(
    skill: SkillRow,
  ): Promise<SkillVersionSourceEvidenceV1> {
    const genesis = await this.prisma.skillVersion.findFirst({
      where: { skillId: skill.id, versionNumber: 1 },
    });
    if (
      !genesis ||
      !isVerifiedOrdinaryUploadVersionReadV1(skill, genesis, genesis)
    )
      throw new NotFoundException('Skill version');
    return genesis;
  }

  private async requireAuthorizedReadSnapshotV1(
    actor: SkillLibraryActor,
    skill: SkillRow,
  ): Promise<SkillVersionSourceEvidenceV1> {
    const authorized = (
      await this.loadAuthorizedVersions(actor, [this.toDocument(skill)], {
        purpose: 'read',
      })
    ).get(skill.id);
    if (!authorized) throw new NotFoundException('Skill version');
    const row = await this.prisma.skillVersion.findFirst({
      where: { id: authorized.id, skillId: skill.id },
    });
    if (
      !row ||
      !isWellFormedSkillVersionReadV1(skill.id, row) ||
      row.contentHash !== authorized.contentHash ||
      row.instructionText !== authorized.instructionText
    )
      throw new NotFoundException('Skill version');
    return row;
  }

  private versionMetadataV1(
    version: SkillVersionSourceEvidenceV1,
  ): SkillVersionMetadataV1 {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt.toISOString(),
      contentHash: version.contentHash,
    };
  }

  async importValidatedPackage(
    actor: SkillLibraryActor,
    input: unknown,
  ): Promise<SkillDocument> {
    const parsed = parseSkillPackageManifest(input);
    if (isReservedBuiltInSkillSlug(parsed.slug)) {
      throw new ValidationException(
        'This slug is reserved for the built-in skill catalog',
        'slug',
        parsed.slug,
      );
    }
    const created = await withSkillWriteSession(
      this.prisma,
      { actorUserId: actor.userId, origin: 'authoring' },
      async (tx) => {
        const users = await tx.$queryRaw<{ id: string; isolation: string }[]>`
          SELECT "id", current_setting('transaction_isolation') AS isolation
          FROM "users" WHERE "id"=${actor.userId} AND "isDeleted"=false FOR UPDATE
        `;
        if (
          users.length !== 1 ||
          users[0]?.id !== actor.userId ||
          users[0].isolation !== 'read committed'
        ) {
          throw new ForbiddenException(
            'A live user and read committed transaction are required',
          );
        }
        const organization = await tx.organization.findFirst({
          where: { id: actor.organizationId, isDeleted: false },
          select: { id: true },
        });
        const member = await tx.member.findFirst({
          where: {
            userId: actor.userId,
            organizationId: actor.organizationId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!organization || !member)
          throw new ForbiddenException(
            'Active organization membership is required',
          );
        // tenant-scope-ignore: personal import duplicates are scoped to canonical ownerUserId with null organization and brand, including across organizations
        const duplicates = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "skills" WHERE "ownerKind"='user'
          AND "ownerUserId"=${actor.userId} AND "organizationId" IS NULL
          AND "brandId" IS NULL AND "isDeleted"=false
          AND lower(config->>'slug')=${parsed.slug}
        `;
        if (duplicates.length)
          throw new ConflictException(
            'A personal skill with this slug already exists',
          );
        return tx.skill.create({
          data: {
            audience: 'private',
            brandId: null,
            organizationId: null,
            ownerKind: 'user',
            ownerUserId: actor.userId,
            isDeleted: false,
            isQuarantined: false,
            label: parsed.metadata.name,
            config: {
              slug: parsed.slug,
              name: parsed.metadata.name,
              description: parsed.metadata.description,
              category: 'content',
              channels: ['general'],
              modalities: ['text'],
              workflowStage: 'creation',
              source: 'imported',
              status: 'draft',
              isBuiltIn: false,
              isEnabled: true,
              requiredProviders: [],
              toolOverrides: [],
              defaultInstructions: parsed.instructions,
              systemPromptTemplate: parsed.instructions,
              files: parsed.files.map(({ content, path }) => ({
                content,
                path,
              })),
              checksum: parsed.packageChecksum,
              ...(parsed.metadata.version !== undefined
                ? { version: parsed.metadata.version }
                : {}),
              importProvenance: {
                format: 'genfeed.skill.ordinary-upload.v1',
                importedByUserId: actor.userId,
                packageChecksum: parsed.packageChecksum,
                ...(parsed.archiveSha256 !== undefined
                  ? { archiveSha256: parsed.archiveSha256 }
                  : {}),
                ...(parsed.sourceUrl !== undefined
                  ? { sourceUrl: parsed.sourceUrl }
                  : {}),
              },
            } satisfies Prisma.InputJsonObject,
          },
        });
      },
    );
    return this.toDocument(created as unknown as SkillRow);
  }

  async create(
    actor: SkillLibraryActor,
    input: CreateScopedSkillDto,
  ): Promise<SkillDocument> {
    const ownerKind = input.ownerKind ?? 'user';
    if (readOptionalAudience(input.audience) === 'public') {
      throw new ValidationException(
        'Public skills are created by publishing a version',
        'audience',
        input.audience,
      );
    }
    if (isReservedBuiltInSkillSlug(input.slug)) {
      throw new ValidationException(
        'This slug is reserved for the built-in skill catalog',
        'slug',
        input.slug,
      );
    }
    const capabilityActor = await this.loadActor(actor);
    this.assertOwnerCreate(capabilityActor, ownerKind, input.brandId);
    if (ownerKind === 'brand') {
      await this.requireBrand(actor.organizationId, input.brandId);
    }

    const audience = this.defaultAudience(ownerKind, input.audience);
    if (ownerKind !== 'user' && audience === 'private') {
      throw new ValidationException(
        'Private organization and brand skills stay off until every reader filters them',
        'audience',
        audience,
      );
    }
    const created = await withSkillWriteSession(
      this.prisma,
      { actorUserId: actor.userId, origin: 'authoring' },
      (tx) =>
        tx.skill.create({
          data: {
            audience,
            brandId: ownerKind === 'brand' ? (input.brandId ?? null) : null,
            config: this.configFromInput(input) as Prisma.InputJsonValue,
            isDeleted: false,
            label: input.name,
            organizationId: ownerKind === 'user' ? null : actor.organizationId,
            ownerKind,
            ownerUserId: ownerKind === 'user' ? actor.userId : null,
          },
        }),
    );
    return this.toDocument(created as unknown as SkillRow);
  }

  async fork(
    actor: SkillLibraryActor,
    skillId: string,
  ): Promise<SkillDocument> {
    const source = await this.requireRow(skillId);
    const decision = await this.decide(actor, source);
    if (!decision.canFork) {
      throw new ForbiddenException('This skill cannot be forked');
    }
    const config = this.readConfig(source);
    const version = decision.canEdit
      ? null
      : await this.versionFor(source, false, actor);
    const slug = await this.availableSlug(
      `${String(config.slug ?? 'skill')}-fork`,
      actor,
    );
    return this.create(actor, {
      brandId: undefined,
      description: String(config.description ?? source.label ?? 'Fork'),
      instructions: version
        ? version.instructionText
        : decision.canEdit
          ? this.instructionOf(source, config)
          : '',
      name: `${String(config.name ?? source.label ?? 'Skill')} fork`,
      ownerKind: 'user',
      slug,
    });
  }

  async grant(
    actor: SkillLibraryActor,
    skillId: string,
    input: GrantSkillDto,
  ): Promise<{ id: string }> {
    const skill = await this.requireRow(skillId);
    const decision = await this.decide(actor, skill);
    if (!decision.canShare) {
      throw new ForbiddenException('This skill cannot be shared');
    }
    if (!skill.currentVersionId) {
      throw new ConflictException('Skill version has not been captured yet');
    }
    const grant = await this.prisma.skillGrant.create({
      data: {
        access: input.access ?? 'use',
        grantedById: actor.userId,
        recipientBrandId:
          input.recipientKind === 'brand' ? input.recipientBrandId : null,
        recipientKind: input.recipientKind,
        recipientOrganizationId:
          input.recipientKind === 'user' ? null : input.recipientOrganizationId,
        recipientUserId:
          input.recipientKind === 'user' ? input.recipientUserId : null,
        skillId: skill.id,
        skillVersionId: skill.currentVersionId,
      },
    });
    return { id: grant.id };
  }

  async revoke(
    actor: SkillLibraryActor,
    skillId: string,
    grantId: string,
  ): Promise<void> {
    const skill = await this.requireRow(skillId);
    const decision = await this.decide(actor, skill);
    if (!decision.canShare) {
      throw new ForbiddenException('This grant cannot be revoked');
    }
    // sql-risk-audit: ignore bulk-write-tenant-review -- requireRow and decide already require canShare on this skill. SkillGrant has no organization column. The where binds one grant id to that skill id and a live revokedAt row, and a count other than 1 is not found.
    const updated = await this.prisma.skillGrant.updateMany({
      where: { id: grantId, revokedAt: null, skillId },
      data: { revokedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Skill grant', grantId);
    }
  }

  async publish(
    actor: SkillLibraryActor,
    skillId: string,
    input: PublishSkillDto,
  ): Promise<SkillDocument> {
    const skill = await this.requireRow(skillId);
    const decision = await this.decide(actor, skill);
    if (!decision.canPublish && input.audience === 'public') {
      throw new ForbiddenException('This skill cannot be published');
    }
    if (!decision.canShare && input.audience === 'organization') {
      throw new ForbiddenException(
        'This skill cannot be shared with the organization',
      );
    }
    if (!skill.currentVersionId) {
      throw new ConflictException('Skill version has not been captured yet');
    }
    const versionId = skill.currentVersionId;
    const updated = await withSkillWriteSession(
      this.prisma,
      { actorUserId: actor.userId, origin: 'authoring' },
      async (tx) => {
        // tenant-scope-ignore: publish addresses one already-authorized skill id, including personal rows
        const row = await tx.skill.update({
          data: {
            audience: input.audience,
            publishedVersionId:
              input.audience === 'public'
                ? versionId
                : skill.publishedVersionId,
            sharedVersionId:
              input.audience === 'organization'
                ? versionId
                : skill.sharedVersionId,
          },
          where: { id: skill.id },
        });
        await tx.skillPublication.create({
          data: {
            action: 'publish',
            actorUserId: actor.userId,
            audience: input.audience,
            skillId: skill.id,
            skillVersionId: versionId,
          },
        });
        return row;
      },
    );
    return this.toDocument(updated as unknown as SkillRow);
  }

  async archive(
    actor: SkillLibraryActor,
    skillId: string,
    _input: ArchiveSkillDto,
  ): Promise<void> {
    const skill = await this.requireRow(skillId);
    const decision = await this.decide(actor, skill);
    if (!decision.canEdit) {
      throw new ForbiddenException('This skill cannot be uninstalled');
    }
    await withSkillWriteSession(
      this.prisma,
      { actorUserId: actor.userId, origin: 'authoring' },
      (tx) =>
        // tenant-scope-ignore: archive addresses one already-authorized skill id, including personal rows
        tx.skill.update({
          data: { isDeleted: true },
          where: { id: skill.id },
        }),
    );
  }

  async export(
    actor: SkillLibraryActor,
    skillId: string,
  ): Promise<{ contentHash: string; instructions: string; versionId: string }> {
    const skill = await this.requireRow(skillId);
    const decision = await this.decide(actor, skill);
    if (!decision.canExport) {
      throw new ForbiddenException('This skill cannot be exported');
    }
    const version = await this.versionFor(skill, decision.canEdit, actor);
    if (!version) throw new NotFoundException('Skill version', skill.id);
    return {
      contentHash: version.contentHash,
      instructions: version.instructionText,
      versionId: version.id,
    };
  }

  async rollback(
    actor: SkillLibraryActor,
    skillId: string,
    input: RollbackSkillDto,
  ): Promise<SkillDocument> {
    const skill = await this.requireRow(skillId);
    const decision = await this.decide(actor, skill);
    if (!decision.canEdit) {
      throw new ForbiddenException('This skill cannot be rolled back');
    }
    const version = await this.prisma.skillVersion.findFirst({
      where: { id: input.versionId, skillId },
    });
    if (!version) {
      throw new NotFoundException('Skill version', input.versionId);
    }
    const payload = version.payload as {
      config?: Record<string, unknown>;
      label?: string;
    };
    const restored = await withSkillWriteSession(
      this.prisma,
      {
        activateVersionId: version.id,
        actorUserId: actor.userId,
        origin: 'authoring',
      },
      async (tx) => {
        // tenant-scope-ignore: rollback addresses one already-authorized skill id, including personal rows
        const row = await tx.skill.update({
          data: {
            config: (payload.config ?? {}) as Prisma.InputJsonValue,
            label: payload.label ?? skill.label,
            ...(skill.publishedVersionId
              ? { publishedVersionId: version.id }
              : {}),
            ...(skill.sharedVersionId ? { sharedVersionId: version.id } : {}),
          },
          where: { id: skill.id },
        });
        await tx.skillAssignment.updateMany({
          data: { skillVersionId: version.id },
          where: {
            isDeleted: false,
            organizationId: actor.organizationId,
            skillId: skill.id,
          },
        });
        return row;
      },
    );
    return this.toDocument(restored as unknown as SkillRow);
  }

  async attachSharedDefaults(
    organizationId: string,
    userId: string,
  ): Promise<number> {
    if (!userId) return 0;
    await this.captureOutstandingVersions(1);
    return this.assignSharedDefaults(organizationId);
  }

  async backfillExistingOrganizations(): Promise<number> {
    await this.captureOutstandingVersions(20);
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      where: { isDeleted: false },
    });
    let attached = 0;
    for (const organization of organizations) {
      attached += await this.assignSharedDefaults(organization.id);
    }
    return attached;
  }

  async recordPromptSnapshot(input: {
    actor: SkillLibraryActor;
    prompt: string;
  }): Promise<void> {
    const prompt = input.prompt.trim();
    if (!prompt) return;
    let ciphertext = '';
    try {
      ciphertext = EncryptionUtil.encrypt(prompt);
    } catch {
      return;
    }
    if (!/^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$/.test(ciphertext)) {
      return;
    }
    const contentHash = createHash('sha256')
      .update(prompt, 'utf8')
      .digest('hex');
    await this.prisma.generationPromptSnapshot.create({
      data: {
        brandId: input.actor.brandId || null,
        ciphertext,
        contentHash: `sha256:${contentHash}`,
        format: 'genfeed.generation-prompt.v1',
        isDeleted: false,
        organizationId: input.actor.organizationId,
        userId: input.actor.userId,
      },
    });
  }

  async present(
    actor: SkillLibraryActor,
    documents: SkillDocument[],
  ): Promise<SkillDocument[]> {
    if (documents.length === 0) return documents;
    const capabilityActor = await this.loadActor(actor);
    const ids = documents.map((document) => String(document.id));
    const grants = await this.grantsFor(actor, ids);
    const versions = await this.loadAuthorizedVersions(actor, documents, {
      purpose: 'read',
    });
    const visible: SkillDocument[] = [];
    for (const document of documents) {
      const subject = this.subjectFromDocument(document);
      const decision = resolveSkillCapabilities(
        subject,
        capabilityActor,
        grants.get(String(document.id)) ?? [],
        this.sourcePolicy(subject, document),
      );
      const isPrivate = subject.audience === 'private';
      if (
        isPrivate &&
        !decision.canRead &&
        !decision.canUse &&
        !decision.canEdit
      ) {
        continue;
      }
      const version = versions.get(String(document.id));
      const projected = decision.canEdit
        ? document
        : version
          ? applyAuthorizedVersionBody(document, version)
          : this.withoutInstructions(document);
      visible.push(
        this.withCapabilities(projected, decision, decision.canRead),
      );
    }
    return visible;
  }

  async authorizeResolved(
    actor: SkillLibraryActor,
    documents: SkillDocument[],
    pins: PinnedSkillExecution[] = [],
  ): Promise<{
    excluded: RecordedSkillExclusion[];
    included: SkillDocument[];
    versions: RecordedSkillVersion[];
  }> {
    const presented = await this.present(actor, documents);
    const allowed = new Set(
      presented
        .filter((document) => document.canUse !== false)
        .map((document) => String(document.id)),
    );
    const versions = await this.loadAuthorizedVersions(actor, documents, {
      pins,
    });
    const included: SkillDocument[] = [];
    const recorded: RecordedSkillVersion[] = [];
    const excluded: RecordedSkillExclusion[] = [];
    const deny = (skillId: string) => {
      const version = versions.get(skillId);
      const pin = pins.find((item) => item.skillId === skillId);
      const attempted = version
        ? {
            contentHash:
              pin &&
              pin.skillVersionId === version.id &&
              pin.contentHash !== version.contentHash
                ? pin.contentHash
                : version.contentHash,
            skillVersionId: version.id,
          }
        : undefined;
      excluded.push({
        reason: 'access-revoked-or-unusable',
        skillId,
        ...(attempted ?? {}),
      });
    };
    for (const document of documents) {
      const skillId = String(document.id);
      const version = versions.get(skillId);
      const pin = pins.find((item) => item.skillId === skillId);
      if (
        !allowed.has(skillId) ||
        (pin && pin.contentHash !== version?.contentHash)
      ) {
        deny(skillId);
        continue;
      }
      if (!version) {
        const isOwner =
          document.ownerKind === 'system' ||
          document.isBuiltIn === true ||
          (document.ownerKind === 'user' &&
            document.ownerUserId === actor.userId);
        if (isOwner) included.push(document);
        else deny(skillId);
        continue;
      }
      included.push(applyAuthorizedVersionBody(document, version));
      recorded.push({
        contentHash: version.contentHash,
        skillId,
        skillVersionId: version.id,
      });
    }
    return { excluded, included, versions: recorded };
  }

  async recordResolution(
    actor: SkillLibraryActor,
    included: RecordedSkillVersion[],
    excluded: readonly RecordedSkillExclusion[],
  ): Promise<void> {
    const items = resolutionItems(included, excluded);
    if (items.length === 0) return;
    await this.prisma.skillResolution.create({
      data: {
        brandId: actor.brandId || null,
        isDeleted: false,
        items: { create: items },
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
  }

  private withoutInstructions(document: SkillDocument): SkillDocument {
    const config = { ...(document.config as Record<string, unknown>) };
    delete config.defaultInstructions;
    delete config.systemPromptTemplate;
    return {
      ...document,
      config,
      defaultInstructions: undefined,
      systemPromptTemplate: undefined,
    } as SkillDocument;
  }

  private async assignSharedDefaults(organizationId: string): Promise<number> {
    const defaults = await this.prisma.skill.findMany({
      where: {
        currentVersionId: { not: null },
        isDeleted: false,
        isQuarantined: false,
        organizationId: null,
        ownerKind: 'system',
      },
    });
    let attached = 0;
    for (const skill of defaults) {
      const slug = this.readConfig(skill as unknown as SkillRow).slug;
      if (!isDefaultFirstPartySkillSlug(slug) || !skill.currentVersionId) {
        continue;
      }
      const existing = await this.prisma.skillAssignment.findFirst({
        where: {
          isDeleted: false,
          organizationId,
          skillId: skill.id,
          targetKind: 'organization',
        },
      });
      if (existing) continue;
      await this.prisma.skillAssignment.create({
        data: {
          isDeleted: false,
          isEnabled: true,
          organizationId,
          skillId: skill.id,
          skillVersionId: skill.currentVersionId,
          targetKind: 'organization',
        },
      });
      attached += 1;
    }
    return attached;
  }

  private async captureOutstandingVersions(maxBatches: number): Promise<void> {
    for (let batch = 0; batch < maxBatches; batch += 1) {
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ skill_backfill_capture: number }>
        >`SELECT skill_backfill_capture(100)`;
        const captured = Number(rows[0]?.skill_backfill_capture ?? 0);
        if (captured < 100) return;
      } catch {
        return;
      }
    }
  }

  private async decide(actor: SkillLibraryActor, skill: SkillRow) {
    const capabilityActor = await this.loadActor(actor);
    const grants = await this.grantsFor(actor, [skill.id]);
    const subject = this.subjectFromRow(skill);
    return resolveSkillCapabilities(
      subject,
      capabilityActor,
      grants.get(skill.id) ?? [],
      this.sourcePolicy(subject, this.toDocument(skill)),
    );
  }

  private async loadActor(
    actor: SkillLibraryActor,
  ): Promise<SkillCapabilityActor> {
    const member = await this.prisma.member.findFirst({
      select: {
        brands: {
          select: { id: true },
          where: { id: actor.brandId ?? '', isDeleted: false },
        },
        roleKey: true,
      },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
    const isOrganizationAdmin =
      member?.roleKey === 'owner' || member?.roleKey === 'admin';
    return {
      brandId: actor.brandId ?? undefined,
      isBrandAdmin: isOrganizationAdmin || (member?.brands.length ?? 0) > 0,
      isOrganizationAdmin,
      organizationId: actor.organizationId,
      userId: actor.userId,
    };
  }

  private assertOwnerCreate(
    actor: SkillCapabilityActor,
    ownerKind: SkillOwnerKind,
    brandId?: string,
  ): void {
    if (ownerKind === 'organization' && !actor.isOrganizationAdmin) {
      throw new ForbiddenException('Organization skills require an admin');
    }
    if (ownerKind === 'brand' && !brandId) {
      throw new ValidationException(
        'Brand skills require a brand',
        'brandId',
        brandId,
      );
    }
    if (
      ownerKind === 'brand' &&
      !actor.isOrganizationAdmin &&
      !(actor.isBrandAdmin && actor.brandId === brandId)
    ) {
      throw new ForbiddenException('Brand skills require a brand admin');
    }
  }

  private defaultAudience(
    ownerKind: SkillOwnerKind,
    requested?: SkillAudience,
  ): SkillAudience {
    if (requested) return requested;
    return ownerKind === 'user' ? 'private' : 'organization';
  }

  private configFromInput(
    input: CreateScopedSkillDto,
  ): Record<string, unknown> {
    return {
      category: input.category ?? 'content',
      channels: input.channels ?? ['general'],
      defaultInstructions: input.instructions,
      description: input.description,
      isBuiltIn: false,
      isEnabled: true,
      modalities: input.modalities ?? ['text'],
      name: input.name,
      slug: input.slug,
      source: 'custom',
      status: 'draft',
      systemPromptTemplate: input.instructions,
      workflowStage: input.workflowStage ?? 'creation',
    };
  }

  private async requireRow(skillId: string): Promise<SkillRow> {
    // tenant-scope-ignore: lookup is by primary key because personal and system skills have no organization
    const row = await this.prisma.skill.findFirst({
      where: { id: skillId, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Skill', skillId);
    return row as unknown as SkillRow;
  }

  private async requireBrand(
    organizationId: string,
    brandId?: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId ?? '', isDeleted: false, organizationId },
    });
    if (!brand) throw new NotFoundException('Brand', brandId ?? '');
  }

  private async availableSlug(
    base: string,
    actor: SkillLibraryActor,
  ): Promise<string> {
    // tenant-scope-ignore: slug uniqueness for a personal skill is scoped to ownerUserId
    const existing = await this.prisma.skill.findFirst({
      where: {
        config: { equals: base, path: ['slug'] },
        isDeleted: false,
        ownerUserId: actor.userId,
      },
    });
    return existing ? `${base}-${actor.userId.slice(0, 6)}` : base;
  }

  private async versionFor(
    skill: SkillRow,
    canEdit: boolean,
    actor: SkillLibraryActor,
  ): Promise<{
    contentHash: string;
    id: string;
    instructionText: string;
  } | null> {
    if (canEdit && skill.currentVersionId) {
      const current = await this.prisma.skillVersion.findFirst({
        where: { id: skill.currentVersionId, skillId: skill.id },
      });
      return current
        ? {
            contentHash: current.contentHash,
            id: current.id,
            instructionText: current.instructionText,
          }
        : null;
    }
    const versions = await this.loadAuthorizedVersions(
      actor,
      [this.toDocument(skill)],
      { purpose: 'read' },
    );
    return versions.get(skill.id) ?? null;
  }

  private loadAuthorizedVersions(
    actor: SkillLibraryActor,
    documents: SkillDocument[],
    options: {
      canEditIds?: ReadonlySet<string>;
      pins?: PinnedSkillExecution[];
      purpose?: 'execute' | 'read';
    } = {},
  ) {
    const editable =
      options.canEditIds ??
      new Set(
        documents
          .filter((document) => document.canEdit === true)
          .map((document) => String(document.id)),
      );
    return loadAuthorizedSkillVersions(
      this.prisma,
      actor,
      documents.map((document) => {
        const subject = this.subjectFromDocument(document);
        return {
          allowsCatalogRead:
            subject.ownerKind === 'system' &&
            this.sourcePolicy(subject, document).allowsRead,
          audience: document.audience,
          currentVersionId: document.currentVersionId,
          id: String(document.id),
          ownerKind: document.ownerKind,
          ownerUserId: (document as { ownerUserId?: string | null })
            .ownerUserId,
          publishedVersionId: document.publishedVersionId,
          sharedVersionId:
            (document as { sharedVersionId?: string | null }).sharedVersionId ??
            null,
        };
      }),
      editable,
      options.pins ?? [],
      options.purpose ?? 'execute',
    );
  }

  private async grantsFor(
    actor: SkillLibraryActor,
    skillIds: string[],
  ): Promise<Map<string, SkillCapabilityGrant[]>> {
    const rows = await this.prisma.skillGrant.findMany({
      where: {
        OR: skillGrantRecipientClauses(actor),
        revokedAt: null,
        skillId: { in: skillIds },
      },
    });
    const grouped = new Map<string, SkillCapabilityGrant[]>();
    for (const row of rows) {
      const grant: SkillCapabilityGrant = {
        access: row.access === 'use_and_read' ? 'use_and_read' : 'use',
        isRevoked: row.revokedAt != null,
        recipientBrandId: row.recipientBrandId,
        recipientKind:
          row.recipientKind === 'organization' || row.recipientKind === 'brand'
            ? row.recipientKind
            : 'user',
        recipientOrganizationId: row.recipientOrganizationId,
        recipientUserId: row.recipientUserId,
      };
      if (!grantMatchesActor(grant, actor)) continue;
      grouped.set(row.skillId, [...(grouped.get(row.skillId) ?? []), grant]);
    }
    return grouped;
  }

  private subjectFromRow(skill: SkillRow): SkillCapabilitySubject {
    return {
      audience: this.audienceOf(skill.audience),
      brandId: skill.brandId,
      hasPublishedVersion: Boolean(skill.publishedVersionId),
      isQuarantined: skill.isQuarantined,
      organizationId: skill.organizationId,
      ownerKind: this.ownerOf(skill.ownerKind),
      ownerUserId: skill.ownerUserId,
    };
  }

  private subjectFromDocument(document: SkillDocument): SkillCapabilitySubject {
    const record = document as SkillDocument & {
      audience?: string;
      brandId?: string | null;
      currentVersionId?: string | null;
      isQuarantined?: boolean;
      organizationId?: string | null;
      ownerKind?: string | null;
      ownerUserId?: string | null;
      publishedVersionId?: string | null;
    };
    return {
      audience: this.audienceOf(record.audience),
      brandId: record.brandId ?? null,
      hasPublishedVersion: Boolean(record.publishedVersionId),
      isQuarantined: record.isQuarantined === true,
      organizationId:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : null,
      ownerKind: this.ownerOf(record.ownerKind),
      ownerUserId: record.ownerUserId ?? null,
    };
  }

  private sourcePolicy(
    subject: SkillCapabilitySubject,
    document: SkillDocument,
  ): SkillSourcePolicy {
    if (subject.ownerKind === 'system' || document.isBuiltIn === true) {
      return {
        ...PUBLIC_FREE_SOURCE_POLICY,
        allowsDerivatives: true,
        allowsExport: subject.ownerKind === 'system',
        allowsPublicPublication: false,
        allowsShare: false,
      };
    }
    if (document.source === 'imported') {
      if (
        !document.config ||
        typeof document.config !== 'object' ||
        Array.isArray(document.config)
      )
        return CLOSED_SKILL_SOURCE_POLICY;
      const config = document.config as Record<string, unknown>;
      const provenance = config.importProvenance;
      if (
        subject.ownerKind === 'user' &&
        subject.ownerUserId &&
        !subject.organizationId &&
        !subject.brandId &&
        !config.sourceListingId &&
        provenance &&
        typeof provenance === 'object' &&
        !Array.isArray(provenance)
      ) {
        const recorded = provenance as Record<string, unknown>;
        if (
          recorded.format === 'genfeed.skill.ordinary-upload.v1' &&
          recorded.importedByUserId === subject.ownerUserId &&
          typeof recorded.packageChecksum === 'string' &&
          /^[a-f0-9]{64}$/.test(recorded.packageChecksum) &&
          config.checksum === recorded.packageChecksum
        ) {
          return { ...AUTHORED_POLICY, allowsPublicPublication: false };
        }
      }
      return CLOSED_SKILL_SOURCE_POLICY;
    }
    return AUTHORED_POLICY;
  }

  private withCapabilities(
    document: SkillDocument,
    decision: ReturnType<typeof resolveSkillCapabilities>,
    canRead: boolean,
  ): SkillDocument {
    const config = { ...(document.config as Record<string, unknown>) };
    if (!canRead) {
      delete config.defaultInstructions;
      delete config.systemPromptTemplate;
    }
    return {
      ...document,
      ...decision,
      config,
      defaultInstructions: canRead ? document.defaultInstructions : undefined,
      systemPromptTemplate: canRead ? document.systemPromptTemplate : undefined,
    } as SkillDocument;
  }

  private toDocument(skill: SkillRow): SkillDocument {
    const config = this.readConfig(skill);
    return {
      ...config,
      config,
      id: skill.id,
      audience: skill.audience,
      currentVersionId: skill.currentVersionId,
      isQuarantined: skill.isQuarantined,
      label: skill.label,
      organizationId: skill.organizationId,
      ownerKind: skill.ownerKind,
      ownerUserId: skill.ownerUserId,
      publishedVersionId: skill.publishedVersionId,
      sharedVersionId: skill.sharedVersionId,
      revision: skill.revision,
    } as unknown as SkillDocument;
  }

  private readConfig(
    skill: { config: Prisma.JsonValue } | SkillRow,
  ): Record<string, unknown> {
    return skill.config &&
      typeof skill.config === 'object' &&
      !Array.isArray(skill.config)
      ? (skill.config as Record<string, unknown>)
      : {};
  }

  private instructionOf(
    skill: SkillRow,
    config: Record<string, unknown>,
  ): string {
    const system = config.systemPromptTemplate;
    const fallback = config.defaultInstructions;
    if (typeof system === 'string' && system.length > 0) return system;
    if (typeof fallback === 'string') return fallback;
    return skill.label ?? '';
  }

  private audienceOf(value: string | null | undefined): SkillAudience {
    if (value === 'public' || value === 'organization' || value === 'private')
      return value;
    return 'private';
  }

  private ownerOf(value: string | null | undefined): SkillOwnerKind | null {
    if (
      value === 'system' ||
      value === 'user' ||
      value === 'organization' ||
      value === 'brand'
    ) {
      return value;
    }
    return null;
  }
}
