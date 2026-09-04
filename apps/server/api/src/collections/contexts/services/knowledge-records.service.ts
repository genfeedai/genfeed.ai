import { createHash, randomUUID } from 'node:crypto';
import type { CreateKnowledgeSourceDto } from '@api/collections/contexts/dto/create-knowledge-source.dto';
import type { CreateKnowledgeSpaceDto } from '@api/collections/contexts/dto/create-knowledge-space.dto';
import type { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import type { UpdateKnowledgeSourceDto } from '@api/collections/contexts/dto/update-knowledge-source.dto';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
} from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class KnowledgeRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  private ownership(
    actor: KnowledgeActor,
  ): Prisma.KnowledgeSourceWhereInput & Prisma.KnowledgeSpaceWhereInput {
    if (!actor.organizationId || !actor.userId) {
      throw new BadRequestException(
        'An authenticated organization and user are required',
      );
    }
    return {
      organizationId: actor.organizationId,
      organization: { isDeleted: false },
      isDeleted: false,
      OR: [
        { scope: KnowledgeMemoryScope.ORG, brandId: null },
        {
          scope: KnowledgeMemoryScope.PERSONAL,
          brandId: null,
          userId: actor.userId,
        },
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
    this.ownership(actor);
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
        ...this.ownership(actor),
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
    return this.prisma.$transaction(async (tx) => {
      const ownership = await this.creationScope(tx, actor, dto.scope);
      const source = await tx.knowledgeSource.create({
        data: {
          ...ownership,
          title: dto.title,
          kind: dto.kind,
          purpose: dto.purpose,
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

  async listSources(actor: KnowledgeActor, page = 1, limit = 25) {
    const where = {
      ...this.ownership(actor),
      organizationId: actor.organizationId,
      isDeleted: false,
    };
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
      ...this.ownership(actor),
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

  async getSource(actor: KnowledgeActor, id: string) {
    const source = await this.prisma.knowledgeSource.findFirst({
      where: {
        ...this.ownership(actor),
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
        ...this.ownership(actor),
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
        ...this.ownership(actor),
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
        ...this.ownership(actor),
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
          ...this.ownership(actor),
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
          source: { is: this.ownership(actor) },
        },
        data: { isDeleted: true },
      });
      return tx.knowledgeSource.update({
        where: {
          ...this.ownership(actor),
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
          ...this.ownership(actor),
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
          ...this.ownership(actor),
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
          space: { is: this.ownership(actor) },
        },
        data: { isDeleted: true },
      });
      return tx.knowledgeSpace.update({
        where: {
          ...this.ownership(actor),
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
          ...this.ownership(actor),
          organizationId: actor.organizationId,
          isDeleted: false,
          id: sourceId,
        },
      });
      const space = await tx.knowledgeSpace.findFirstOrThrow({
        where: {
          ...this.ownership(actor),
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
          source: { is: this.ownership(actor) },
          space: { is: this.ownership(actor) },
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

  async listMemberships(actor: KnowledgeActor, spaceId: string) {
    await this.getSpace(actor, spaceId);
    return this.prisma.knowledgeSpaceMembership.findMany({
      where: {
        organizationId: actor.organizationId,
        spaceId,
        isDeleted: false,
        source: { is: this.ownership(actor) },
        space: { is: this.ownership(actor) },
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
          source: { is: this.ownership(actor) },
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
          source: { is: this.ownership(actor) },
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
          provenance: dto.provenance,
          payload: dto.payload,
          observedAt: new Date(dto.observedAt),
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          retentionPolicy: dto.retentionPolicy ?? KnowledgeRetentionPolicy.KEEP,
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
      source: { is: this.ownership(actor) },
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
        source: { is: this.ownership(actor) },
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
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, actor, sourceId);
      const where = {
        id,
        sourceId,
        organizationId: actor.organizationId,
        isDeleted: false,
        source: { is: this.ownership(actor) },
      };
      const version = await tx.knowledgeSourceVersion.findFirst({ where });
      if (!version) ErrorResponse.notFound('Knowledge source version', id);
      return tx.knowledgeSourceVersion.update({
        where,
        data: mutation(version),
      });
    });
  }

  setProcessing(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    state: KnowledgeProcessingState,
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
      return { processingState: state };
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

  schedulePurge(
    actor: KnowledgeActor,
    sourceId: string,
    id: string,
    purgeScheduledAt: string,
  ) {
    return this.mutateVersion(actor, sourceId, id, (version) => {
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

  purgeVersion(actor: KnowledgeActor, sourceId: string, id: string) {
    return this.mutateVersion(actor, sourceId, id, (version) => {
      if (version.retentionState === KnowledgeRetentionState.POLICY_ERASED)
        ErrorResponse.notFound('Knowledge source version', id);
      return {
        payload: Prisma.DbNull,
        provenance: Prisma.DbNull,
        retentionState: KnowledgeRetentionState.PAYLOAD_PURGED,
        purgedAt: version.purgedAt ?? new Date(),
      };
    });
  }

  listEligibleVersions(actor: KnowledgeActor) {
    return this.prisma.knowledgeSourceVersion.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        isCurrent: true,
        processingState: KnowledgeProcessingState.READY,
        retrievalState: KnowledgeRetrievalState.ACTIVE,
        retentionState: KnowledgeRetentionState.RETAINED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        source: { is: { ...this.ownership(actor), isVisible: true } },
      },
      orderBy: { id: 'asc' },
      take: 100,
    });
  }
}
