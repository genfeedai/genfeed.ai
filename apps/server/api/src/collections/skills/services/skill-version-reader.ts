import { SkillVersionListQueryDto } from '@api/collections/skills/dto/skill-version-query.dto';
import type { resolveSkillCapabilities } from '@api/collections/skills/policy/skill-capabilities';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { runOnAuthorizedSkillRow } from '@api/collections/skills/services/skill-authorized-row';
import type {
  SkillLibraryActor,
  SkillRow,
} from '@api/collections/skills/services/skill-library.types';
import type { loadAuthorizedSkillVersions } from '@api/collections/skills/services/skill-version-loader';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  SkillVersionListQueryV1,
  SkillVersionMetadataV1,
  SkillVersionReadPageV1,
  SkillVersionReadParentV1,
  SkillVersionReadV1,
  SkillVersionSourceEvidenceV1,
} from '@genfeedai/contracts/interfaces/ai/skill-version-read.interface';

interface SkillVersionReaderContext {
  decide(
    actor: SkillLibraryActor,
    skill: SkillRow,
  ): Promise<ReturnType<typeof resolveSkillCapabilities>>;
  toDocument(skill: SkillRow): SkillDocument;
  loadAuthorizedVersions(
    actor: SkillLibraryActor,
    documents: SkillDocument[],
    options: { purpose: 'read' },
  ): ReturnType<typeof loadAuthorizedSkillVersions>;
}

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

export class SkillVersionReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: SkillVersionReaderContext,
  ) {}

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
    const row = await runOnAuthorizedSkillRow(
      async () =>
        // tenant-scope-ignore: personal/system parents lack organization; live capabilities below authorize the primary-key lookup
        await this.prisma.skill.findFirst({
          where: { id: skillId, isDeleted: false, isQuarantined: false },
        }),
    );
    if (!row || row.isDeleted || row.isQuarantined)
      throw new NotFoundException('Skill version');
    const skill = row as unknown as SkillRow;
    const capabilities = await this.context.decide(actor, skill);
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
      await this.context.loadAuthorizedVersions(
        actor,
        [this.context.toDocument(skill)],
        {
          purpose: 'read',
        },
      )
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
}
