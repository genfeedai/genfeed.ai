import {
  extensionPublicationAnalyticsAvailability,
  extensionPublicationAnalyticsError,
  extensionPublicationCaptureResult,
  type NormalizedExtensionPublication,
  normalizeExtensionPublication,
  parseExtensionPublicationCaptureInput,
  resolveExtensionPublicationObservedVisibility,
} from '@api/collections/posts/services/post-publication-capture.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  PostVisibility,
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { projectLegacyPostStatus } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  ExtensionPublicationCaptureInput,
  ExtensionPublicationCaptureResult,
  ExtensionPublicationCaptureScope,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import { PostCategory, Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

export async function recordExternalPublicationWrite(
  prisma: PrismaService,
  input: ExtensionPublicationCaptureInput,
  scope: ExtensionPublicationCaptureScope,
): Promise<ExtensionPublicationCaptureResult> {
  const capture = parseExtensionPublicationCaptureInput(input);
  if (
    !scope.organizationId?.trim() ||
    !scope.userId?.trim() ||
    !scope.brandId?.trim() ||
    scope.brandId !== capture.brandId
  ) {
    throw new ForbiddenException(
      'Reported publication requires its authenticated organization, user and matching brand',
    );
  }
  const normalized = normalizeExtensionPublication(capture);
  if (!toPrismaCredentialPlatform(capture.platform))
    throw new BadRequestException('Unsupported publication platform');
  return prisma.$transaction((tx) =>
    recordExternalPublicationInTransaction(tx, capture, scope, normalized),
  );
}

async function recordExternalPublicationInTransaction(
  tx: Prisma.TransactionClient,
  capture: ExtensionPublicationCaptureInput,
  scope: ExtensionPublicationCaptureScope,
  normalized: NormalizedExtensionPublication,
): Promise<ExtensionPublicationCaptureResult> {
  const brand = await tx.brand.findFirst({
    where: {
      id: scope.brandId,
      organizationId: scope.organizationId,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (!brand)
    throw new ForbiddenException(
      'Publication brand is unavailable in this organization',
    );
  const key = JSON.stringify([
    'extension-publication',
    scope.organizationId,
    scope.brandId,
    capture.platform,
  ]);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
  const identities: Prisma.PostWhereInput[] = [];
  if (normalized.externalId)
    identities.push({ externalId: normalized.externalId });
  if (normalized.url) identities.push({ url: normalized.url });
  const existing = await tx.post.findMany({
    where: {
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      platform: capture.platform,
      isDeleted: false,
      OR: identities,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 2,
  });
  if (existing.length > 1)
    throw new ConflictException(
      'Multiple active publications match the reported identity',
    );
  if (existing.length === 1) {
    if (existing[0].targetExecutionState !== TargetExecutionState.PUBLISHED) {
      throw new ConflictException(
        'The reported identity belongs to a post in another lifecycle state',
      );
    }
    return extensionPublicationCaptureResult(existing[0], false);
  }
  const credentialId = await findCaptureCredentialId(tx, capture, scope);
  const data = buildCapturedPostData(capture, scope, normalized, credentialId);
  return extensionPublicationCaptureResult(
    await tx.post.create({ data }),
    true,
  );
}

async function findCaptureCredentialId(
  tx: Prisma.TransactionClient,
  capture: ExtensionPublicationCaptureInput,
  scope: ExtensionPublicationCaptureScope,
): Promise<string | null> {
  let credentialId: string | null = null;
  const credentialPlatform = toPrismaCredentialPlatform(capture.platform);
  if (!credentialPlatform)
    throw new BadRequestException('Unsupported publication platform');
  const author = capture.author;
  const normalizeHandle = (handle: string | null | undefined) =>
    handle?.trim().replace(/^@/, '').toLowerCase() ?? '';
  if (author?.externalId || normalizeHandle(author?.handle)) {
    const credentials = await tx.credential.findMany({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        platform: credentialPlatform,
        isDeleted: false,
        isConnected: true,
        ...(author?.externalId ? { externalId: author.externalId } : {}),
      }),
      select: {
        id: true,
        externalId: true,
        externalHandle: true,
        username: true,
        isConnected: true,
      },
    });
    const matches = credentials.filter((credential) =>
      author?.externalId
        ? credential.externalId === author.externalId
        : normalizeHandle(credential.externalHandle) ===
            normalizeHandle(author?.handle) ||
          normalizeHandle(credential.username) ===
            normalizeHandle(author?.handle),
    );
    if (matches.length === 1) credentialId = matches[0].id;
  }
  return credentialId;
}

function buildCapturedPostData(
  capture: ExtensionPublicationCaptureInput,
  scope: ExtensionPublicationCaptureScope,
  normalized: NormalizedExtensionPublication,
  credentialId: string | null,
): Prisma.PostUncheckedCreateInput {
  const availability = extensionPublicationAnalyticsAvailability(
    normalized.externalId,
    credentialId,
    capture.platform,
    capture.publicationKind,
    normalized.urlIdentity,
  );
  const observedVisibility = resolveExtensionPublicationObservedVisibility(
    capture.observedVisibility,
  );
  const visibility =
    observedVisibility === 'public'
      ? PostVisibility.PUBLIC
      : observedVisibility === 'private'
        ? PostVisibility.PRIVATE
        : observedVisibility === 'unlisted'
          ? PostVisibility.UNLISTED
          : null;
  return {
    userId: scope.userId,
    organizationId: scope.organizationId,
    brandId: scope.brandId,
    platform: capture.platform,
    credentialId,
    description: capture.description,
    label: capture.description.slice(0, 80) || 'Captured publication',
    category: PostCategory.TEXT,
    source: 'extension',
    externalId: normalized.externalId,
    url: normalized.url,
    publicationDate: new Date(capture.publicationDate),
    publishedAt: new Date(capture.publicationDate),
    targetExecutionState: TargetExecutionState.PUBLISHED,
    visibility,
    status: projectLegacyPostStatus(
      TargetExecutionState.PUBLISHED,
      visibility ?? PostVisibility.PUBLIC,
    ),
    isDeleted: false,
    targetSettings: {
      extensionCapture: {
        version: 1,
        observedByUserId: scope.userId,
        observedAt: new Date().toISOString(),
        publicationDate: capture.publicationDate,
        publicationKind: capture.publicationKind,
        urlKind: normalized.urlKind,
        contextUrl: normalized.contextUrl,
        urlIdentity: normalized.urlIdentity
          ? { ...normalized.urlIdentity }
          : null,
        author: capture.author ? { ...capture.author } : null,
        evidence: 'client-reported-publication',
        observedVisibility,
      },
    },
    isAnalyticsEnabled: availability === 'eligible',
    analyticsCollectionState: 'unavailable',
    analyticsNextCollectAt: new Date(),
    analyticsCollectionError:
      extensionPublicationAnalyticsError(availability) ?? Prisma.DbNull,
  };
}
