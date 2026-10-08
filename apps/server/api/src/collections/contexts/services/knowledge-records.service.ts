import { createHash, randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { CreateKnowledgeSourceDto } from '@api/collections/contexts/dto/create-knowledge-source.dto';
import type { CreateKnowledgeSpaceDto } from '@api/collections/contexts/dto/create-knowledge-space.dto';
import type { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import type { UpdateKnowledgeSourceDto } from '@api/collections/contexts/dto/update-knowledge-source.dto';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { softDeleteKnowledgeChunks } from '@api/collections/contexts/utils/knowledge-chunk.util';
import { captureIdempotentKnowledgeSource } from '@api/collections/contexts/utils/knowledge-idempotent-capture';
import { buildKnowledgeMediaReferenceKey } from '@api/collections/contexts/utils/knowledge-media-identity.util';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  type KnowledgeSourcePurpose,
  MemberRole,
} from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class KnowledgeRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccessService: BrandAccessService,
  ) {}

  private isGovernanceRole(role: string | undefined): boolean {
    return role === MemberRole.OWNER || role === MemberRole.ADMIN;
  }

  async assertCanBackfill(actor: KnowledgeActor): Promise<void> {
    await this.brandAccessService.resolve(actor);
    await this.assertCanGovern(actor);
  }

  private async assertCanGovern(actor: KnowledgeActor): Promise<void> {
    const member = await this.prisma.member.findFirst({
      select: { role: { select: { key: true } } },
      where: {
        organization: { isDeleted: false },
        isActive: true,
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
    const canonicalRole = Object.values(MemberRole).find(
      (role) => role === member?.role?.key,
    );
    const role = canonicalRole
      ? resolveApiKeyEffectiveMemberRole(actor, canonicalRole)
      : undefined;
    if (this.isGovernanceRole(role)) {
      return;
    }

    throw new ForbiddenException(
      'Knowledge governance requires an organization admin',
    );
  }

  private async ownership(
    actor: KnowledgeActor,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<
    Prisma.KnowledgeSourceWhereInput & Prisma.KnowledgeSpaceWhereInput
  > {
    if (!actor.organizationId || !actor.userId) {
      throw new BadRequestException(
        'An authenticated organization and user are required',
      );
    }
    await this.brandAccessService.resolve(actor, tx);
    if (actor.brandId)
      await this.brandAccessService.assert(actor, actor.brandId, tx);
    return {
      organizationId: actor.organizationId,
      organization: { isDeleted: false },
      isDeleted: false,
      OR: [
        { scope: KnowledgeMemoryScope.ORG, brandId: null },
        ...(actor.isWorkflowScoped
          ? []
          : [
              {
                scope: KnowledgeMemoryScope.PERSONAL,
                brandId: null,
                userId: actor.userId,
              },
            ]),
        ...(actor.brandId
          ? [
              {
                scope: KnowledgeMemoryScope.BRAND,
                brandId: actor.brandId,
                brand: { isDeleted: false },
              },
            ]
          : []),
      ],
    };
  }

  private async creationScope(
    tx: Prisma.TransactionClient,
    actor: KnowledgeActor,
    scope: KnowledgeMemoryScope,
  ) {
    await this.ownership(actor, tx);
    const organization = await tx.organization.findFirst({
      where: { id: actor.organizationId, isDeleted: false },
      select: { id: true },
    });
    if (!organization)
      ErrorResponse.notFound('Organization', actor.organizationId);
    if (scope === KnowledgeMemoryScope.BRAND) {
      if (!actor.brandId)
        throw new BadRequestException('Brand scope requires an active brand');
      const brand = await tx.brand.findFirst({
        where: {
          id: actor.brandId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!brand) ErrorResponse.notFound('Brand', actor.brandId);
    }
    return {
      organizationId: actor.organizationId,
      userId: actor.userId,
      brandId: scope === KnowledgeMemoryScope.BRAND ? actor.brandId : null,
      scope,
    };
  }

  private async inbox(
    tx: Prisma.TransactionClient,
    actor: KnowledgeActor,
    scope: KnowledgeMemoryScope,
  ) {
    const data = await this.creationScope(tx, actor, scope);
    const key = JSON.stringify([
      data.organizationId,
      scope,
      data.brandId ?? null,
      scope === KnowledgeMemoryScope.PERSONAL ? data.userId : null,
    ]);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 32);
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
    return tx.knowledgeSpace.upsert({
      where: {
        ...(await this.ownership(actor, tx)),
        organizationId: actor.organizationId,
        isDeleted: false,
        id,
      },
      create: { ...data, id, title: 'Inbox', isInbox: true },
      update: {},
    });
  }

  ensureInbox(actor: KnowledgeActor, scope: KnowledgeMemoryScope) {
    return this.prisma.$transaction((tx) => this.inbox(tx, actor, scope));
  }

  createSource(actor: KnowledgeActor, dto: CreateKnowledgeSourceDto) {
    return this.prisma.$transaction((tx) =>
      this.createSourceInTransaction(tx, actor, dto),
    );
  }

  private async createSourceInTransaction(
    tx: Prisma.TransactionClient,
    actor: KnowledgeActor,
    dto: CreateKnowledgeSourceDto,
    id?: string,
  ) {
    const ownership = await this.creationScope(tx, actor, dto.scope);
    const source = await tx.knowledgeSource.create({
      data: {
        ...ownership,
        ...(id ? { id } : {}),
        kind: dto.kind,
        purpose: dto.purpose,
        referenceUrl: dto.referenceUrl,
        title: dto.title,
        ...(dto.referenceUrl &&
        (dto.kind === KnowledgeSourceKind.AUDIO ||
          dto.kind === KnowledgeSourceKind.VIDEO)
          ? {
              mediaReferenceKey: buildKnowledgeMediaReferenceKey({
                brandId: actor.brandId,
                kind: dto.kind,
                referenceUrl: dto.referenceUrl,
                scope: dto.scope,
                userId: actor.userId,
              }),
            }
          : {}),
      },
    });
    const inbox = await this.inbox(tx, actor, dto.scope);
    await tx.knowledgeSpaceMembership.create({
      data: {
        organizationId: actor.organizationId,
        sourceId: source.id,
        spaceId: inbox.id,
      },
    });
    return source;
  }

  /** Persist the source and first version atomically before dispatching ingestion. */
  createIdempotentCapture(
    actor: KnowledgeActor,
    dto: CreateKnowledgeSourceDto,
    versionDto: CreateKnowledgeVersionDto,
    key: string,
    requestHash: string,
  ) {
    const lockKey = JSON.stringify([
      'knowledge-capture',
      actor.organizationId,
      actor.userId,
      actor.brandId ?? null,
      key,
    ]);
    const hash = createHash('sha256')
      .update(lockKey)
      .digest('hex')
      .slice(0, 32);
    const sourceId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
    const hashedKey = createHash('sha256').update(lockKey).digest('hex');
    return this.prisma
      .$transaction((tx) =>
        captureIdempotentKnowledgeSource(tx, {
          actor,
          dto,
          hashedKey,
          helpers: {
            createSource: (innerTx, innerActor, innerDto, id) =>
              this.createSourceInTransaction(innerTx, innerActor, innerDto, id),
            ownership: (innerActor) => this.ownership(innerActor, tx),
            prepareScope: (innerTx, innerActor, scope) =>
              this.creationScope(innerTx, innerActor, scope),
          },
          lockKey,
          requestHash,
          sourceId,
          versionDto,
        }),
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'This capture key belongs to a removed source. Start a new capture.',
          );
        }
        throw error;
      });
  }

  createSpace(actor: KnowledgeActor, dto: CreateKnowledgeSpaceDto) {
    return this.prisma.$transaction(async (tx) =>
      tx.knowledgeSpace.create({
        data: {
          ...(await this.creationScope(tx, actor, dto.scope)),
          title: dto.title,
        },
      }),
    );
  }

  async listSources(
    actor: KnowledgeActor,
    page = 1,
    limit = 25,
    filters: {
      processingState?: KnowledgeProcessingState;
      purpose?: KnowledgeSourcePurpose;
    } = {},
  ) {
    const where = scopedWhere(actor.organizationId, {
      ...(await this.ownership(actor)),
      ...(filters.purpose ? { purpose: filters.purpose } : {}),
      ...(filters.processingState
        ? {
            versions: {
              some: scopedWhere(actor.organizationId, {
                isCurrent: true,
                processingState: filters.processingState,
              }),
            },
          }
        : {}),
    });
    const [docs, totalDocs] = await this.prisma.$transaction([
      this.prisma.knowledgeSource.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.knowledgeSource.count({ where }),
    ]);
    return {
      docs,
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
    };
  }

  async listSpaces(actor: KnowledgeActor, page = 1, limit = 25) {
    const where = {
      ...(await this.ownership(actor)),
      organizationId: actor.organizationId,
      isDeleted: false,
    };
    const [docs, totalDocs] = await this.prisma.$transaction([
      this.prisma.knowledgeSpace.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.knowledgeSpace.count({ where }),
    ]);
    return {
      docs,
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
    };
  }

  async assertSourcesInScope(actor: KnowledgeActor, sourceIds: string[]) {
    if (sourceIds.length === 0) {
      return;
    }
    const uniqueIds = [...new Set(sourceIds)];
    const found = await this.prisma.knowledgeSource.findMany({
      select: { id: true },
      where: {
        ...(await this.ownership(actor)),
        organizationId: actor.organizationId,
        isDeleted: false,
        id: { in: uniqueIds },
      },
    });
    if (found.length !== uniqueIds.length) {
      ErrorResponse.notFound('Knowledge source', uniqueIds.join(','));
    }
  }

  async getSource(actor: KnowledgeActor, id: string) {
    const source = await this.prisma.knowledgeSource.findFirst({
      where: {
        ...(await this.ownership(actor)),
        organizationId: actor.organizationId,
        isDeleted: false,
        id,
      },
    });
    if (!source) ErrorResponse.notFound('Knowledge source', id);
    return source;
  }

  async getSpace(actor: KnowledgeActor, id: string) {
    const space = await this.prisma.knowledgeSpace.findFirst({
      where: {
        ...(await this.ownership(actor)),
        organizationId: actor.organizationId,
        isDeleted: false,
        id,
      },
    });
    if (!space) ErrorResponse.notFound('Knowledge space', id);
    return space;
  }

  private async lockSource(
    tx: Prisma.TransactionClient,
    actor: KnowledgeActor,
    id: string,
  ) {
    const changed = await tx.knowledgeSource.updateMany({
      where: {
        ...(await this.ownership(actor, tx)),
        id,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
      data: { updatedAt: new Date() },
    });
    if (!changed.count) ErrorResponse.notFound('Knowledge source', id);
  }

  private async lockSpace(
    tx: Prisma.TransactionClient,
    actor: KnowledgeActor,
    id: string,
  ) {
    const changed = await tx.knowledgeSpace.updateMany({
      where: {
        ...(await this.ownership(actor, tx)),
        id,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
      data: { updatedAt: new Date() },
    });
    if (!changed.count) ErrorResponse.notFound('Knowledge space', id);
  }

  updateSource(
    actor: KnowledgeActor,
    id: string,
    dto: UpdateKnowledgeSourceDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, actor, id);
      return tx.knowledgeSource.update({
        where: {
          ...(await this.ownership(actor)),
          organizationId: actor.organizationId,
          isDeleted: false,
          id,
        },
        data: {
          title: dto.title,
          purpose: dto.purpose,
          isVisible: dto.isVisible,
        },
      });
    });
  }

  deleteSource(actor: KnowledgeActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, actor, id);
      await tx.knowledgeSpaceMembership.updateMany({
        where: {
          organizationId: actor.organizationId,
          sourceId: id,
          isDeleted: false,
          source: { is: await this.ownership(actor) },
        },
        data: { isDeleted: true },
      });
      await softDeleteKnowledgeChunks(tx, actor.organizationId, {
        sourceId: id,
      });
      return tx.knowledgeSource.update({
        where: {
          ...(await this.ownership(actor)),
          organizationId: actor.organizationId,
          isDeleted: false,
          id,
        },
        data: { isDeleted: true, isVisible: false },
      });
    });
  }

  updateSpace(actor: KnowledgeActor, id: string, title: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSpace(tx, actor, id);
      return tx.knowledgeSpace.update({
        where: {
          ...(await this.ownership(actor)),
          organizationId: actor.organizationId,
          isDeleted: false,
          id,
        },
        data: { title },
      });
    });
  }

  deleteSpace(actor: KnowledgeActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSpace(tx, actor, id);
      const space = await tx.knowledgeSpace.findFirst({
        where: {
          ...(await this.ownership(actor)),
          organizationId: actor.organizationId,
          isDeleted: false,
          id,
        },
      });
      if (space?.isInbox)
        throw new BadRequestException('The Inbox cannot be deleted');
      await tx.knowledgeSpaceMembership.updateMany({
        where: {
          organizationId: actor.organizationId,
          spaceId: id,
          isDeleted: false,
          space: { is: await this.ownership(actor) },
        },
        data: { isDeleted: true },
      });
      return tx.knowledgeSpace.update({
        where: {
          ...(await this.ownership(actor)),
          organizationId: actor.organizationId,
          isDeleted: false,
          id,
        },
        data: { isDeleted: true },
      });
    });
  }

  setMembership(
    actor: KnowledgeActor,
    sourceId: string,
    spaceId: string,
    isDeleted: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, actor, sourceId);
      await this.lockSpace(tx, actor, spaceId);
      const source = await tx.knowledgeSource.findFirstOrThrow({
        where: {
          ...(await this.ownership(actor)),
          organizationId: actor.organizationId,
          isDeleted: false,
          id: sourceId,
        },
      });
      const space = await tx.knowledgeSpace.findFirstOrThrow({
        where: {
          ...(await this.ownership(actor)),
          organizationId: actor.organizationId,
          isDeleted: false,
          id: spaceId,
        },
      });
      if (
        source.scope !== space.scope ||
        source.brandId !== space.brandId ||
        (source.scope === KnowledgeMemoryScope.PERSONAL &&
          source.userId !== space.userId)
      ) {
        throw new BadRequestException(
          'Source and space must have the same ownership scope',
        );
      }
      // tenant-scope-ignore: Restoring membership includes its tombstone; both live parents are scoped to the actor in this same mutation.
      return tx.knowledgeSpaceMembership.upsert({
        where: {
          spaceId_sourceId: { spaceId, sourceId },
          organizationId: actor.organizationId,
          source: { is: await this.ownership(actor) },
          space: { is: await this.ownership(actor) },
        },
        create: {
          organizationId: actor.organizationId,
          sourceId,
          spaceId,
          isDeleted,
        },
        update: { isDeleted },
      });
    });
  }

  /** Spaces one source belongs to, inside the actor's visible scope. */
  async listSourceSpaces(actor: KnowledgeActor, sourceId: string) {
    await this.getSource(actor, sourceId);
    const memberships = await this.prisma.knowledgeSpaceMembership.findMany({
      include: { space: true },
      where: {
        organizationId: actor.organizationId,
        sourceId,
        isDeleted: false,
        space: { is: await this.ownership(actor) },
      },
    });
    return memberships.map((membership) => membership.space);
  }

  async listMemberships(actor: KnowledgeActor, spaceId: string) {
    await this.getSpace(actor, spaceId);
    return this.prisma.knowledgeSpaceMembership.findMany({
      where: {
        organizationId: actor.organizationId,
        spaceId,
        isDeleted: false,
        source: { is: await this.ownership(actor) },
        space: { is: await this.ownership(actor) },
      },
      orderBy: { id: 'asc' },
    });
  }

  async createVersion(
    actor: KnowledgeActor,
    sourceId: string,
    dto: CreateKnowledgeVersionDto,
  ) {
    if (
      dto.retentionPolicy === KnowledgeRetentionPolicy.UNTIL_EXPIRY &&
      !dto.expiresAt
    ) {
      throw new BadRequestException(
        'Expiry retention requires an expiry timestamp',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, actor, sourceId);
      const prior = await tx.knowledgeSourceVersion.findFirst({
        where: {
          sourceId,
          organizationId: actor.organizationId,
          isDeleted: false,
          source: { is: await this.ownership(actor) },
        },
        orderBy: { version: 'desc' },
      });
      const id = randomUUID();
      await tx.knowledgeSourceVersion.updateMany({
        where: {
          sourceId,
          organizationId: actor.organizationId,
          isDeleted: false,
          isCurrent: true,
          source: { is: await this.ownership(actor) },
        },
        data: {
          isCurrent: false,
          retrievalState: KnowledgeRetrievalState.SUPERSEDED,
          supersededByVersionId: id,
        },
      });
      return tx.knowledgeSourceVersion.create({
        data: {
          id,
          sourceId,
          organizationId: actor.organizationId,
          version: (prior?.version ?? 0) + 1,
          contentHash: dto.contentHash,
          provenance: {
            ...dto.provenance,
            initiatingActor: {
              userId: actor.userId,
              organizationId: actor.organizationId,
              isApiKey: actor.isApiKey === true,
              scopes: actor.scopes ?? [],
            },
          },
          payload: dto.payload,
          observedAt: new Date(dto.observedAt),
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          retentionPolicy: dto.retentionPolicy ?? KnowledgeRetentionPolicy.KEEP,
        },
      });
    });
  }

  async createCandidateVersion(
    actor: KnowledgeActor,
    sourceId: string,
    dto: CreateKnowledgeVersionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, actor, sourceId);
      const prior = await tx.knowledgeSourceVersion.findFirst({
        where: {
          isDeleted: false,
          organizationId: actor.organizationId,
          sourceId,
          source: { is: await this.ownership(actor) },
        },
        orderBy: { version: 'desc' },
      });
      return tx.knowledgeSourceVersion.create({
        data: {
          contentHash: dto.contentHash,
          isCurrent: false,
          observedAt: new Date(dto.observedAt),
          organizationId: actor.organizationId,
          payload: dto.payload,
          processingState: KnowledgeProcessingState.QUEUED,
          provenance: {
            ...dto.provenance,
            initiatingActor: {
              userId: actor.userId,
              organizationId: actor.organizationId,
              isApiKey: actor.isApiKey === true,
              scopes: actor.scopes ?? [],
            },
          },
          retrievalState: KnowledgeRetrievalState.ACTIVE,
          sourceId,
          version: (prior?.version ?? 0) + 1,
        },
      });
    });
  }

  async listVersions(
    actor: KnowledgeActor,
    sourceId: string,
    page = 1,
    limit = 25,
  ) {
    await this.getSource(actor, sourceId);
    const where = {
      sourceId,
      organizationId: actor.organizationId,
      isDeleted: false,
      source: { is: await this.ownership(actor) },
    };
    const [docs, totalDocs] = await this.prisma.$transaction([
      this.prisma.knowledgeSourceVersion.findMany({
        where,
        orderBy: { version: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.knowledgeSourceVersion.count({ where }),
    ]);
    return {
      docs,
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
    };
  }

  async getVersion(actor: KnowledgeActor, sourceId: string, id: string) {
    const version = await this.prisma.knowledgeSourceVersion.findFirst({
      where: {
        id,
        sourceId,
        organizationId: actor.organizationId,
        isDeleted: false,
        source: { is: await this.ownership(actor) },
      },
    });
    if (!version) ErrorResponse.notFound('Knowledge source version', id);
    return version;
  }

  private mutateVersion(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    mutation: (
      version: Awaited<ReturnType<KnowledgeRecordsService['getVersion']>>,
    ) => Prisma.KnowledgeSourceVersionUpdateInput,
    afterUpdate?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, actor, sourceId);
      const where = {
        id,
        sourceId,
        organizationId: actor.organizationId,
        isDeleted: false,
        source: { is: await this.ownership(actor) },
      };
      const version = await tx.knowledgeSourceVersion.findFirst({ where });
      if (!version) ErrorResponse.notFound('Knowledge source version', id);
      const updated = await tx.knowledgeSourceVersion.update({
        where,
        data: mutation(version),
      });
      await afterUpdate?.(tx);
      return updated;
    });
  }

  async getCurrentVersion(actor: KnowledgeActor, sourceId: string) {
    await this.getSource(actor, sourceId);
    const version = await this.prisma.knowledgeSourceVersion.findFirst({
      where: {
        sourceId,
        organizationId: actor.organizationId,
        isDeleted: false,
        isCurrent: true,
        source: { is: await this.ownership(actor) },
      },
    });
    if (!version)
      throw new BadRequestException('Source has no captured version yet');
    return version;
  }

  setProcessing(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    state: KnowledgeProcessingState,
    processingError?: string,
  ) {
    return this.mutateVersion(actor, sourceId, id, (version) => {
      if (
        !version.isCurrent ||
        version.retentionState !== KnowledgeRetentionState.RETAINED
      )
        throw new BadRequestException(
          'Only a retained current version can be processed',
        );
      const allowed: Record<
        KnowledgeProcessingState,
        readonly KnowledgeProcessingState[]
      > = {
        QUEUED: [KnowledgeProcessingState.PROCESSING],
        PROCESSING: [
          KnowledgeProcessingState.READY,
          KnowledgeProcessingState.FAILED,
        ],
        FAILED: [KnowledgeProcessingState.QUEUED],
        READY: [],
      };
      if (
        version.processingState !== state &&
        !allowed[version.processingState].includes(state)
      )
        throw new BadRequestException('Invalid processing transition');
      // The database rejects a reason outside FAILED; clear it on every other
      // transition so a requeued version starts clean.
      return {
        processingState: state,
        processingError:
          state === KnowledgeProcessingState.FAILED
            ? (processingError ?? version.processingError ?? null)
            : null,
      };
    });
  }

  setEligibility(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    state: KnowledgeRetrievalState,
  ) {
    return this.mutateVersion(actor, sourceId, id, (version) => {
      if (!version.isCurrent || state === KnowledgeRetrievalState.SUPERSEDED)
        throw new BadRequestException(
          'Supersession requires a new source version',
        );
      if (
        state === KnowledgeRetrievalState.ACTIVE &&
        (version.retentionState !== KnowledgeRetentionState.RETAINED ||
          (version.expiresAt && version.expiresAt <= new Date()))
      )
        throw new BadRequestException(
          'Purged or expired evidence cannot be activated',
        );
      return { retrievalState: state };
    });
  }

  verifyVersion(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    verifiedAt: string,
    expiresAt?: string,
  ) {
    return this.mutateVersion(actor, sourceId, id, (version) => {
      if (
        !version.isCurrent ||
        version.retentionState !== KnowledgeRetentionState.RETAINED
      )
        throw new BadRequestException(
          'Only a retained current version can be verified',
        );
      const timestamp = new Date(verifiedAt);
      if (timestamp < version.observedAt || timestamp > new Date())
        throw new BadRequestException(
          'Verification must be between capture and now',
        );
      if (expiresAt && new Date(expiresAt) <= timestamp)
        throw new BadRequestException('Expiry must follow verification');
      return {
        verifiedAt: timestamp,
        ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      };
    });
  }

  async schedulePurge(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    purgeScheduledAt: string,
  ) {
    await this.assertCanGovern(actor);
    return this.mutateVersion(actor, sourceId, id, (version) => {
      if (version.isLegalHold)
        throw new BadRequestException(
          'A legal hold prevents scheduling purge for this version',
        );
      if (
        version.retentionState !== KnowledgeRetentionState.RETAINED &&
        version.retentionState !== KnowledgeRetentionState.SCHEDULED_FOR_PURGE
      )
        throw new BadRequestException('Payload has already been purged');
      return {
        retentionState: KnowledgeRetentionState.SCHEDULED_FOR_PURGE,
        purgeScheduledAt: new Date(purgeScheduledAt),
      };
    });
  }

  /** Purge clears payload, provenance and every derived chunk; receipt identity stays. */
  async purgeVersion(actor: KnowledgeActor, sourceId: string, id: string) {
    await this.assertCanGovern(actor);
    return this.mutateVersion(
      actor,
      sourceId,
      id,
      (version) => {
        if (version.isLegalHold)
          throw new BadRequestException(
            'A legal hold prevents purging this version',
          );
        if (version.retentionState === KnowledgeRetentionState.POLICY_ERASED)
          ErrorResponse.notFound('Knowledge source version', id);
        return {
          payload: Prisma.DbNull,
          provenance: Prisma.DbNull,
          retentionState: KnowledgeRetentionState.PAYLOAD_PURGED,
          purgedAt: version.purgedAt ?? new Date(),
        };
      },
      (tx) =>
        softDeleteKnowledgeChunks(tx, actor.organizationId, {
          versionId: id,
        }).then(() => undefined),
    );
  }

  async setLegalHold(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    isLegalHold: boolean,
  ) {
    await this.assertCanGovern(actor);
    return this.mutateVersion(actor, sourceId, id, () => ({
      isLegalHold,
    }));
  }

  /** Policy erasure removes payload and chunks and marks the receipt unavailable. */
  async eraseVersion(actor: KnowledgeActor, sourceId: string, id: string) {
    await this.assertCanGovern(actor);
    return this.mutateVersion(
      actor,
      sourceId,
      id,
      (version) => {
        if (version.isLegalHold)
          throw new BadRequestException(
            'A legal hold prevents erasing this version',
          );
        return {
          payload: Prisma.DbNull,
          provenance: Prisma.DbNull,
          retentionState: KnowledgeRetentionState.POLICY_ERASED,
          purgedAt: version.purgedAt ?? new Date(),
        };
      },
      (tx) =>
        softDeleteKnowledgeChunks(tx, actor.organizationId, {
          versionId: id,
        }).then(() => undefined),
    );
  }

  async listEligibleVersions(actor: KnowledgeActor, page = 1, limit = 25) {
    const where: Prisma.KnowledgeSourceVersionWhereInput = {
      organizationId: actor.organizationId,
      isDeleted: false,
      isCurrent: true,
      processingState: KnowledgeProcessingState.READY,
      retrievalState: KnowledgeRetrievalState.ACTIVE,
      retentionState: KnowledgeRetentionState.RETAINED,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      source: { is: { ...(await this.ownership(actor)), isVisible: true } },
    };
    const [docs, totalDocs] = await this.prisma.$transaction([
      this.prisma.knowledgeSourceVersion.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.knowledgeSourceVersion.count({ where }),
    ]);
    return {
      docs,
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
    };
  }
}
