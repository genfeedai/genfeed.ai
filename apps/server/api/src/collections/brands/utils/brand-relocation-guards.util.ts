import { scopedWhere } from '@api/index';
import { LiveSessionStatus, VisualCodeStatus } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

/** Saved generation history, including tombstones, retains its original tenant. */
export async function assertNoBrandedGenerationReceiptHistory(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: organization and brand are pinned; deleted receipts preserve immutable ownership history.
  const receipt = await client.brandedGenerationReceipt.findFirst({
    where: { organizationId, brandId },
    select: { id: true },
  });
  // tenant-scope-ignore: organization and brand are pinned; deleted receipt events preserve immutable ownership history.
  const event = await client.brandedGenerationReceiptEvent.findFirst({
    where: { organizationId, brandId },
    select: { id: true },
  });
  if (receipt || event) {
    throw new ConflictException(
      'Cannot move a brand with saved generation history. Receipts and receipt events, including deleted records, must remain in their original organization.',
    );
  }
}

/**
 * Knowledge sources and spaces, including deleted ones, keep immutable
 * ownership history and must stay in their original organization.
 */
export async function assertNoKnowledgeHistory(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: organization and brand are pinned; deleted Knowledge sources still preserve immutable ownership history.
  const source = await client.knowledgeSource.findFirst({
    where: { organizationId, brandId },
    select: { id: true },
  });
  // tenant-scope-ignore: organization and brand are pinned; deleted Knowledge spaces still preserve immutable ownership history.
  const space = await client.knowledgeSpace.findFirst({
    where: { organizationId, brandId },
    select: { id: true },
  });
  if (source || space) {
    throw new ConflictException(
      'Cannot move a brand with Knowledge history. Knowledge sources and spaces, including deleted records, must remain in their original organization.',
    );
  }
}

/**
 * An open live session holds its ceiling credits on the source organization.
 * Moving the session row would make its settlement look up that hold in the
 * destination organization and fail, so the session must end first.
 */
export async function assertNoOpenLiveSessions(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  const session = await client.liveSession.findFirst({
    where: scopedWhere(organizationId, {
      brandId,
      status: LiveSessionStatus.OPEN,
    }),
    select: { id: true },
  });
  if (session) {
    throw new ConflictException(
      'Cannot move a brand with an open live session. End the session first; its credit hold belongs to the current organization.',
    );
  }
}

/** Security history retains its original tenant, including deleted and indirect audits. */
export async function assertNoSecurityAuditHistory(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: retain deleted workflow ownership history for this exact tenant and brand.
  const workflows = await client.workflow.findMany({
    where: { organizationId, brandId },
    select: { id: true },
  });
  // tenant-scope-ignore: deleted execution history still attributes audits to this brand.
  const executions = await client.workflowExecution.findMany({
    where: {
      organizationId,
      workflowId: { in: workflows.map(({ id }) => id) },
    },
    select: { id: true },
  });
  // tenant-scope-ignore: deleted post groups still attribute audits to this brand.
  const postGroups = await client.postGroup.findMany({
    where: { organizationId, brandId },
    select: { id: true },
  });
  const workflowExecutionId = { in: executions.map(({ id }) => id) };
  // tenant-scope-ignore: historical audits must include deleted rows.
  const publish = await client.agentPublishAudit.findFirst({
    where: {
      organizationId,
      OR: [
        { brandId },
        { workflowExecutionId },
        { postGroupId: { in: postGroups.map(({ id }) => id) } },
      ],
    },
    select: { id: true },
  });
  // tenant-scope-ignore: historical audits must include deleted rows.
  const untrusted = await client.agentUntrustedContentAudit.findFirst({
    where: {
      organizationId,
      OR: [{ brandId }, { workflowExecutionId }],
    },
    select: { id: true },
  });
  if (publish || untrusted) {
    throw new ConflictException(
      'Cannot move a brand with security audit history. Direct and indirect audits, including deleted records, must remain in their original organization.',
    );
  }
}

export async function assertNoOpenVisualProjects(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  const revision = await client.visualRevision.findFirst({
    where: {
      organizationId,
      brandId,
      isDeleted: false,
      OR: [
        {
          status: {
            notIn: [
              VisualCodeStatus.COMPLETED,
              VisualCodeStatus.FAILED,
              VisualCodeStatus.CANCELLED,
            ],
          },
        },
        {
          AND: [
            {
              receipts: {
                not: {
                  array_contains: [{ kind: 'settlement', state: 'confirmed' }],
                },
              },
            },
            {
              OR: [
                { reservationId: { not: null } },
                {
                  receipts: {
                    not: {
                      array_contains: [
                        { kind: 'quote', quote: { maximumCredits: 0 } },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    select: { id: true },
  });
  if (revision)
    throw new ConflictException(
      'Cannot move a brand with unfinished visual work. Finish or cancel and settle it first; its credit hold belongs to the current organization.',
    );
}

const LEARNING_HISTORY_MESSAGE =
  'Cannot move a brand with saved learning or publication history. This history must remain in its original organization.';
function refuseLearningHistory(found: unknown): void {
  if (found) throw new ConflictException(LEARNING_HISTORY_MESSAGE);
}
async function assertNoDirectLearningHistory(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningConsent.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningDecision.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningCheckpoint.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningBaseline.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningReward.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningPolicyVersion.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningScopeState.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningExperiment.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningEnrollment.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningOpportunity.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: exact org/brand historical attribution includes tombstones.
  refuseLearningHistory(
    await client.contentLearningExperimentEvent.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: publication history has no soft-delete field; original tenant and brand are exact.
  refuseLearningHistory(
    await client.publishApproval.findFirst({
      where: { organizationId, brandId },
      select: { id: true },
    }),
  );
}
async function assertNoBoundLearningConfiguration(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: tombstoned configuration with historical bindings cannot move.
  refuseLearningHistory(
    await client.contentLearningAccount.findFirst({
      where: {
        organizationId,
        brandId,
        OR: [
          { epoch: { not: 0 } },
          { revision: { not: 0 } },
          { evidenceRevision: { not: 0 } },
          { resetAt: { not: null } },
          { sharingConsentVersion: { not: null } },
          { activePolicyId: { not: null } },
          { pinnedReleaseId: { not: null } },
          { pilotStartedAt: { not: null } },
          { prePilotReleaseId: { not: null } },
          { mode: { not: 'shadow' } },
          { activeConfigVersion: { not: 'rl-reward-v1-experimental' } },
        ],
      },
      select: { id: true },
    }),
  );
  // tenant-scope-ignore: deleted preference retains its historical binding/revision.
  refuseLearningHistory(
    await client.contentLearningBrandPreference.findFirst({
      where: {
        organizationId,
        brandId,
        OR: [{ pinnedReleaseId: { not: null } }, { revision: { not: 0 } }],
      },
      select: { id: true },
    }),
  );
}
async function assertNoIndirectLearningHistory(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: correlated exact tenant/brand attribution intentionally retains deleted posts, credentials, pins, operations and edges.
  const rows = await client.$queryRaw<{ retained: boolean }[]>(Prisma.sql`
    SELECT (
      EXISTS (SELECT 1 FROM "content_learning_operations" o WHERE o."organizationId" = ${organizationId} AND
        (o."brandId" = ${brandId} OR (o."brandId" IS NULL AND EXISTS
          (SELECT 1 FROM "credentials" c WHERE c."id" = o."credentialId" AND c."organizationId" = ${organizationId} AND c."brandId" = ${brandId}))))
      OR EXISTS (SELECT 1 FROM "content_version_pins" p WHERE p."organizationId" = ${organizationId} AND
        (p."brandId" = ${brandId} OR (p."recordKind" = 'post' AND EXISTS
          (SELECT 1 FROM "posts" s WHERE s."id" = p."recordId" AND s."organizationId" = ${organizationId} AND s."brandId" = ${brandId}))))
      OR EXISTS (SELECT 1 FROM "post_publish_finalizations" f WHERE f."organizationId" = ${organizationId} AND EXISTS
        (SELECT 1 FROM "posts" p WHERE p."id" = f."postId" AND p."organizationId" = ${organizationId} AND p."brandId" = ${brandId}))
      OR EXISTS (SELECT 1 FROM "content_learning_dependencys" d WHERE d."sourceOrganizationId" = ${organizationId} AND (
        (d."sourceKind" = 'brand' AND d."sourceId" = ${brandId})
        OR (d."sourceKind" = 'account' AND EXISTS (SELECT 1 FROM "content_learning_accounts" a WHERE a."id" = d."sourceId" AND a."organizationId" = ${organizationId} AND a."brandId" = ${brandId}))
        OR (d."sourceKind" = 'credential' AND EXISTS (SELECT 1 FROM "credentials" c WHERE c."id" = d."sourceId" AND c."organizationId" = ${organizationId} AND c."brandId" = ${brandId}))
        OR (d."sourceKind" = 'post' AND EXISTS (SELECT 1 FROM "posts" p WHERE p."id" = d."sourceId" AND p."organizationId" = ${organizationId} AND p."brandId" = ${brandId}))
      ))
    ) AS retained`);
  if (rows.length !== 1 || typeof rows[0].retained !== 'boolean')
    throw new ConflictException(
      'Learning history attribution could not be confirmed.',
    );
  refuseLearningHistory(rows[0].retained);
}
export async function assertNoLearningHistory(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  await assertNoDirectLearningHistory(client, brandId, organizationId);
  await assertNoBoundLearningConfiguration(client, brandId, organizationId);
  await assertNoIndirectLearningHistory(client, brandId, organizationId);
}
