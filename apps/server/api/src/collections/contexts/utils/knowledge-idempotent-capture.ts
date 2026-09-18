import type { CreateKnowledgeSourceDto } from '@api/collections/contexts/dto/create-knowledge-source.dto';
import type { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { buildKnowledgeMediaReferenceKey } from '@api/collections/contexts/utils/knowledge-media-identity.util';
import {
  KnowledgeRetentionPolicy,
  KnowledgeSourceKind,
} from '@genfeedai/contracts';
import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
  Prisma,
} from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

export interface IdempotentKnowledgeCaptureHelpers {
  createSource: (
    tx: Prisma.TransactionClient,
    actor: KnowledgeActor,
    dto: CreateKnowledgeSourceDto,
    id?: string,
  ) => Promise<KnowledgeSource>;
  ownership: (
    actor: KnowledgeActor,
  ) => Prisma.KnowledgeSourceWhereInput & Prisma.KnowledgeSpaceWhereInput;
  prepareScope: (
    tx: Prisma.TransactionClient,
    actor: KnowledgeActor,
    scope: CreateKnowledgeSourceDto['scope'],
  ) => Promise<unknown>;
}

export interface IdempotentKnowledgeCaptureInput {
  actor: KnowledgeActor;
  dto: CreateKnowledgeSourceDto;
  hashedKey: string;
  helpers: IdempotentKnowledgeCaptureHelpers;
  lockKey: string;
  requestHash: string;
  sourceId: string;
  versionDto: CreateKnowledgeVersionDto;
}

/**
 * Resolve one capture key to a source+version inside an already-locked
 * transaction. Concurrent retries reuse the ledger; a changed hash or a
 * removed source conflicts instead of minting a second row.
 */
export async function captureIdempotentKnowledgeSource(
  tx: Prisma.TransactionClient,
  input: IdempotentKnowledgeCaptureInput,
): Promise<{ source: KnowledgeSource; version: KnowledgeSourceVersion }> {
  const {
    actor,
    dto,
    hashedKey,
    helpers,
    lockKey,
    requestHash,
    sourceId,
    versionDto,
  } = input;
  await helpers.prepareScope(tx, actor, dto.scope);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
  const existing = await tx.knowledgeSource.findFirst({
    where: {
      ...helpers.ownership(actor),
      organizationId: actor.organizationId,
      userId: actor.userId,
      isDeleted: false,
      id: sourceId,
    },
  });
  const ledger = await tx.knowledgeCaptureRequest.findFirst({
    where: {
      id: sourceId,
      isDeleted: false,
      organizationId: actor.organizationId,
    },
  });
  if (ledger) {
    return reuseLedgerCapture(tx, {
      actor,
      helpers,
      ledger,
      requestHash,
    });
  }
  if (existing) {
    return completeExistingCapture(tx, {
      actor,
      dto,
      existing,
      hashedKey,
      helpers,
      requestHash,
      sourceId,
    });
  }
  return createFreshCapture(tx, {
    actor,
    dto,
    hashedKey,
    helpers,
    requestHash,
    sourceId,
    versionDto,
  });
}

async function reuseLedgerCapture(
  tx: Prisma.TransactionClient,
  input: {
    actor: KnowledgeActor;
    helpers: IdempotentKnowledgeCaptureHelpers;
    ledger: { requestHash: string | null; sourceId: string | null };
    requestHash: string;
  },
): Promise<{ source: KnowledgeSource; version: KnowledgeSourceVersion }> {
  if (
    input.ledger.requestHash &&
    input.ledger.requestHash !== input.requestHash
  ) {
    throw new ConflictException(
      'This capture key was already used for different or purged content. Start a new capture.',
    );
  }
  if (!input.ledger.sourceId) {
    throw new ConflictException(
      'This capture key belongs to a removed source. Start a new capture.',
    );
  }
  const existingSource = await tx.knowledgeSource.findFirst({
    where: {
      ...input.helpers.ownership(input.actor),
      id: input.ledger.sourceId,
      isDeleted: false,
      organizationId: input.actor.organizationId,
    },
  });
  const version = await tx.knowledgeSourceVersion.findFirst({
    where: {
      isCurrent: true,
      isDeleted: false,
      organizationId: input.actor.organizationId,
      sourceId: input.ledger.sourceId,
    },
  });
  if (!existingSource || !version) {
    throw new ConflictException(
      'This capture key belongs to a removed source. Start a new capture.',
    );
  }
  return { source: existingSource, version };
}

async function completeExistingCapture(
  tx: Prisma.TransactionClient,
  input: {
    actor: KnowledgeActor;
    dto: CreateKnowledgeSourceDto;
    existing: KnowledgeSource;
    hashedKey: string;
    helpers: IdempotentKnowledgeCaptureHelpers;
    requestHash: string;
    sourceId: string;
  },
): Promise<{ source: KnowledgeSource; version: KnowledgeSourceVersion }> {
  const version = await tx.knowledgeSourceVersion.findFirst({
    where: {
      organizationId: input.actor.organizationId,
      isDeleted: false,
      sourceId: input.sourceId,
      version: 1,
      source: { is: input.helpers.ownership(input.actor) },
    },
  });
  const provenance = version?.provenance;
  if (
    !version ||
    !provenance ||
    typeof provenance !== 'object' ||
    Array.isArray(provenance) ||
    provenance.captureRequestHash !== input.requestHash
  ) {
    throw new ConflictException(
      'This capture key was already used for different or purged content. Start a new capture.',
    );
  }
  await tx.knowledgeCaptureRequest.create({
    data: {
      id: input.sourceId,
      idempotencyKey: input.hashedKey,
      kind: input.dto.kind,
      organizationId: input.actor.organizationId,
      requestHash: input.requestHash,
      sourceId: input.sourceId,
      status: 'completed',
    },
  });
  return { source: input.existing, version };
}

async function createFreshCapture(
  tx: Prisma.TransactionClient,
  input: {
    actor: KnowledgeActor;
    dto: CreateKnowledgeSourceDto;
    hashedKey: string;
    helpers: IdempotentKnowledgeCaptureHelpers;
    requestHash: string;
    sourceId: string;
    versionDto: CreateKnowledgeVersionDto;
  },
): Promise<{ source: KnowledgeSource; version: KnowledgeSourceVersion }> {
  const mediaKey =
    input.dto.referenceUrl &&
    (input.dto.kind === KnowledgeSourceKind.AUDIO ||
      input.dto.kind === KnowledgeSourceKind.VIDEO)
      ? buildKnowledgeMediaReferenceKey({
          brandId: input.actor.brandId,
          kind: input.dto.kind,
          referenceUrl: input.dto.referenceUrl,
          scope: input.dto.scope,
          userId: input.actor.userId,
        })
      : undefined;
  if (mediaKey) {
    const mediaMatch = await matchMediaCapture(tx, {
      actor: input.actor,
      dto: input.dto,
      hashedKey: input.hashedKey,
      helpers: input.helpers,
      mediaKey,
      requestHash: input.requestHash,
      sourceId: input.sourceId,
    });
    if (mediaMatch) {
      return mediaMatch;
    }
  }
  const source = await input.helpers.createSource(
    tx,
    input.actor,
    input.dto,
    input.sourceId,
  );
  const version = await tx.knowledgeSourceVersion.create({
    data: {
      sourceId: input.sourceId,
      organizationId: input.actor.organizationId,
      version: 1,
      contentHash: input.versionDto.contentHash,
      provenance: {
        ...input.versionDto.provenance,
        captureRequestHash: input.requestHash,
      },
      payload: input.versionDto.payload,
      observedAt: new Date(input.versionDto.observedAt),
      retentionPolicy: KnowledgeRetentionPolicy.KEEP,
    },
  });
  await tx.knowledgeCaptureRequest.create({
    data: {
      id: input.sourceId,
      idempotencyKey: input.hashedKey,
      kind: input.dto.kind,
      mediaReferenceKey: mediaKey,
      organizationId: input.actor.organizationId,
      requestHash: input.requestHash,
      sourceId: input.sourceId,
      status: 'queued',
    },
  });
  return { source, version };
}

async function matchMediaCapture(
  tx: Prisma.TransactionClient,
  input: {
    actor: KnowledgeActor;
    dto: CreateKnowledgeSourceDto;
    hashedKey: string;
    helpers: IdempotentKnowledgeCaptureHelpers;
    mediaKey: string;
    requestHash: string;
    sourceId: string;
  },
): Promise<{
  source: KnowledgeSource;
  version: KnowledgeSourceVersion;
} | null> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`knowledge-media:${input.actor.organizationId}:${input.mediaKey}`}, 0))::text`;
  const mediaMatch = await tx.knowledgeSource.findFirst({
    where: {
      ...input.helpers.ownership(input.actor),
      isDeleted: false,
      mediaReferenceKey: input.mediaKey,
      organizationId: input.actor.organizationId,
    },
  });
  if (!mediaMatch) {
    return null;
  }
  const version = await tx.knowledgeSourceVersion.findFirst({
    where: {
      isCurrent: true,
      isDeleted: false,
      organizationId: input.actor.organizationId,
      sourceId: mediaMatch.id,
    },
  });
  if (!version) {
    throw new ConflictException(
      'This capture key belongs to a removed source. Start a new capture.',
    );
  }
  await tx.knowledgeCaptureRequest.create({
    data: {
      id: input.sourceId,
      idempotencyKey: input.hashedKey,
      kind: input.dto.kind,
      mediaReferenceKey: input.mediaKey,
      organizationId: input.actor.organizationId,
      requestHash: input.requestHash,
      sourceId: mediaMatch.id,
      status: 'completed',
    },
  });
  return { source: mediaMatch, version };
}
