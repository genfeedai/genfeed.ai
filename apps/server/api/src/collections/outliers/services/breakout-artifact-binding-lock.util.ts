import type { BreakoutPostArtifactBindingInput } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';

/**
 * The opening of every breakout artifact binder: lock the draft post and the
 * response row (`FOR UPDATE`, inside the caller's transaction), then read the
 * response fields the binder verifies the output against. Both locks are
 * tenant-, brand-, credential- and platform-scoped, so a draft or response
 * from another scope is never locked or read.
 */
export async function lockBreakoutArtifactBinding(
  tx: Prisma.TransactionClient,
  {
    organizationId,
    brandId,
    credentialId,
    platform,
    responseId,
    postId,
  }: Readonly<BreakoutPostArtifactBindingInput>,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "posts" WHERE "id" = ${postId} AND "organizationId" = ${organizationId}
      AND "brandId" = ${brandId} AND "credentialId" = ${credentialId}
      AND "platform" = ${platform} AND "isDeleted" = false FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "breakout_responses" WHERE "id" = ${responseId} AND "organizationId" = ${organizationId}
      AND "brandId" = ${brandId} AND "credentialId" = ${credentialId}
      AND "platform" = ${platform} AND "isDeleted" = false FOR UPDATE
  `);
  return tx.breakoutResponse.findFirst({
    where: {
      id: responseId,
      organizationId,
      brandId,
      credentialId,
      platform,
      isDeleted: false,
    },
    select: {
      contentDigest: true,
      externalId: true,
      logicalPostId: true,
      nativeSourcePostId: true,
      outputPlanFingerprint: true,
      publicationFingerprint: true,
      sourcePostId: true,
      state: true,
    },
  });
}
