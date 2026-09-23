import { scopedWhere } from '@api/index';
import { LiveSessionStatus } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

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
