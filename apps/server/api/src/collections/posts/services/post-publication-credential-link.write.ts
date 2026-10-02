import {
  extensionPublicationAnalyticsError,
  extensionPublicationAuthorMatchesCredential,
  extensionPublicationCaptureAnalyticsAvailability,
  extensionPublicationObservedAuthor,
} from '@api/collections/posts/services/post-publication-capture.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  LinkExternalPublicationCredentialInput,
  LinkExternalPublicationCredentialResult,
  PublicationInsightsScope,
} from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

export async function linkExternalPublicationCredentialWrite(
  prisma: PrismaService,
  input: LinkExternalPublicationCredentialInput,
  scope: PublicationInsightsScope,
): Promise<LinkExternalPublicationCredentialResult> {
  if (
    !scope.organizationId?.trim() ||
    !scope.userId?.trim() ||
    !scope.brandId?.trim() ||
    input.brandId !== scope.brandId
  )
    throw new ForbiddenException(
      'Publication linking requires its authenticated organization, user and matching brand',
    );
  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.findFirst({
      where: scopedWhere(scope.organizationId, {
        id: scope.brandId,
        isDeleted: false,
      }),
      select: { id: true },
    });
    if (!brand)
      throw new ForbiddenException(
        'Publication brand is unavailable in this organization',
      );
    const where = scopedWhere(scope.organizationId, {
      id: input.postId,
      brandId: scope.brandId,
      isDeleted: false,
      source: 'extension',
      targetExecutionState: TargetExecutionState.PUBLISHED,
      targetSettings: { path: ['extensionCapture', 'version'], equals: 1 },
    });
    const post = await tx.post.findFirst({ where });
    if (!post) throw new NotFoundException('Post', input.postId);
    const key = JSON.stringify([
      'extension-publication',
      scope.organizationId,
      scope.brandId,
      post.platform,
    ]);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
    // Read again under the same capture lock before checking or changing linkage.
    const current = await tx.post.findFirst({ where });
    if (!current) throw new NotFoundException('Post', input.postId);
    const author = extensionPublicationObservedAuthor(current.targetSettings);
    if (!author)
      throw new BadRequestException(
        'This recording has no verified observed author to link',
      );
    const platform = toPrismaCredentialPlatform(current.platform);
    if (!platform)
      throw new BadRequestException('Unsupported publication platform');
    const credential = await tx.credential.findFirst({
      where: scopedWhere(scope.organizationId, {
        id: input.credentialId,
        brandId: scope.brandId,
        platform,
        isDeleted: false,
        isConnected: true,
      }),
      select: {
        id: true,
        externalId: true,
        externalHandle: true,
        username: true,
      },
    });
    if (
      !credential ||
      !extensionPublicationAuthorMatchesCredential(author, credential)
    )
      throw new ForbiddenException(
        'The selected account does not match this publication author',
      );
    if (current.credentialId && current.credentialId !== credential.id)
      throw new ConflictException(
        'This publication is already linked to another account; reconnect that account',
      );
    const analyticsAvailability =
      extensionPublicationCaptureAnalyticsAvailability({
        ...current,
        credentialId: credential.id,
      });
    await tx.post.update({
      where: scopedWhere(scope.organizationId, {
        id: current.id,
        brandId: scope.brandId,
        isDeleted: false,
      }),
      data: {
        credentialId: credential.id,
        isAnalyticsEnabled: analyticsAvailability === 'eligible',
        ...(analyticsAvailability === 'eligible'
          ? { analyticsNextCollectAt: new Date() }
          : {}),
        analyticsCollectionError:
          extensionPublicationAnalyticsError(analyticsAvailability) ??
          Prisma.DbNull,
      },
    });
    return {
      postId: current.id,
      credentialId: credential.id,
      analyticsAvailability,
    };
  });
}
