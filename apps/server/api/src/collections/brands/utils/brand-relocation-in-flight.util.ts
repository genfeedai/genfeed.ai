import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  CreditReservationStatus,
  TurboRunStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { Prisma, WorkflowNodeContinuationStatus } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

/**
 * Work that is mid-flight when a brand changes organization. Each guard runs in
 * the relocation transaction and refuses with a 409 before anything moves, in
 * the same style as the live-session and visual-project guards: the work holds
 * state (a lease, a credit hold, a provider receipt, a reserved output) keyed
 * to the organization it started in, and finishing it after the move would
 * look that state up in the wrong tenant.
 */

const UNRESOLVED_PUBLISH_RECEIPT_STATUSES = ['attempting', 'uncertain'];
const UNFINISHED_CONTINUATION_STATUSES = [
  WorkflowNodeContinuationStatus.COMPLETED,
  WorkflowNodeContinuationStatus.FAILED,
];
/** A planned response owns its output slots; a detected one holds nothing yet. */
const IN_FLIGHT_BREAKOUT_RESPONSE_STATES = ['planned'];
const IN_FLIGHT_BREAKOUT_OUTPUT_STATES = ['generation_in_flight', 'reserved'];

/** Running or pending workflow executions, and continuations still owed a result. */
export async function assertNoInFlightWorkflowWork(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  const execution = await client.workflowExecution.findFirst({
    where: scopedWhere(organizationId, {
      status: {
        in: [WorkflowExecutionStatus.PENDING, WorkflowExecutionStatus.RUNNING],
      },
      workflow: { brandId },
    }),
    select: { id: true },
  });
  // tenant-scope-ignore: the model has no soft-delete flag; the organization and the brand's workflows are pinned.
  const continuation = await client.workflowNodeContinuation.findFirst({
    where: {
      execution: { workflow: { brandId } },
      organizationId,
      status: { notIn: UNFINISHED_CONTINUATION_STATUSES },
    },
    select: { id: true },
  });
  if (execution || continuation) {
    throw new ConflictException(
      'Cannot move a brand with running or pending workflow executions. Wait for them to finish or cancel them first; their state belongs to the current organization.',
    );
  }
}

/**
 * An open credit hold is settled against the organization that took it. The
 * hold may be attributed to the brand directly or to one of its executions.
 */
export async function assertNoOpenExecutionCreditHolds(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: raw existence probe, pinned to the organization and brand, with bound parameters only.
  const rows = await client.$queryRaw<{ hasOpenHold: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM "credit_reservations" r
      WHERE r."organizationId" = ${organizationId}
        AND r."isDeleted" = false
        AND r."status" = ${CreditReservationStatus.RESERVED}::"CreditReservationStatus"
        AND (
          r."brandId" = ${brandId}
          OR r."workflowExecutionId" IN (
            SELECT e."id" FROM "workflow_executions" e
            JOIN "workflows" w ON w."id" = e."workflowId"
            WHERE e."organizationId" = ${organizationId} AND w."brandId" = ${brandId}
          )
        )
    ) AS "hasOpenHold"`);
  if (rows.length !== 1 || typeof rows[0].hasOpenHold !== 'boolean') {
    throw new ConflictException('Open credit holds could not be confirmed.');
  }
  if (rows[0].hasOpenHold) {
    throw new ConflictException(
      'Cannot move a brand with open credit holds. Let the running work settle or release its hold first; the hold belongs to the current organization.',
    );
  }
}

/**
 * An `attempting` or `uncertain` provider receipt means a publish may have
 * reached the provider. A retry must find that receipt under the post's
 * organization, so the post cannot move until the receipt is resolved.
 */
export async function assertNoUnresolvedPublishReceipts(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  const receipt = await client.postProviderPublishReceipt.findFirst({
    where: scopedWhere(organizationId, {
      post: { brandId },
      status: { in: UNRESOLVED_PUBLISH_RECEIPT_STATUSES },
    }),
    select: { id: true },
  });
  if (receipt) {
    throw new ConflictException(
      'Cannot move a brand with a provider publish that is still being resolved. Wait for it to be confirmed or released first.',
    );
  }
}

export async function assertNoInFlightTurboRuns(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  const run = await client.turboRun.findFirst({
    where: scopedWhere(organizationId, {
      brandId,
      status: { in: [TurboRunStatus.PENDING, TurboRunStatus.PROCESSING] },
    }),
    select: { id: true },
  });
  if (run) {
    throw new ConflictException(
      'Cannot move a brand with a Turbo run in progress. Wait for it to finish or cancel it first.',
    );
  }
}

/**
 * A planned breakout response is being executed by `breakout.response.execute`
 * and its outputs hold reserved slots and generation keys. A merely detected
 * response holds nothing: its queued job finds no response in the old
 * organization after the move and does nothing.
 */
export async function assertNoInFlightBreakoutWork(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  const response = await client.breakoutResponse.findFirst({
    where: scopedWhere(organizationId, {
      brandId,
      state: { in: IN_FLIGHT_BREAKOUT_RESPONSE_STATES },
    }),
    select: { id: true },
  });
  const output = await client.breakoutResponseOutput.findFirst({
    where: scopedWhere(organizationId, {
      brandId,
      state: { in: IN_FLIGHT_BREAKOUT_OUTPUT_STATES },
    }),
    select: { id: true },
  });
  if (response || output) {
    throw new ConflictException(
      'Cannot move a brand with breakout responses in progress. Let the response finish or hold before moving the brand.',
    );
  }
}

/**
 * Execution read scopes, their brand dependencies and lineage are append-only
 * authorization records bound to the organization by composite foreign keys.
 * Moving their execution, thread, strategy, workflow version or brand would
 * cascade an update into rows a trigger forbids changing, so a brand that has
 * any (including deleted) stays where it is.
 */
export async function assertNoWorkflowExecutionReadHistory(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  // tenant-scope-ignore: read scopes are append-only authorization history; deleted scopes still bind the original tenant.
  const scope = await client.workflowExecutionReadScope.findFirst({
    where: {
      OR: [
        { execution: { workflow: { brandId } } },
        { proactiveThread: { brandId } },
        { proactiveStrategy: { brandId } },
        { batchChildVersion: { workflow: { brandId } } },
      ],
      organizationId,
    },
    select: { executionId: true },
  });
  // tenant-scope-ignore: append-only dependency history, exact organization and brand.
  const dependency =
    await client.workflowExecutionReadBrandDependency.findFirst({
      where: { brandId, organizationId },
      select: { executionId: true },
    });
  if (scope || dependency) {
    throw new ConflictException(
      'Cannot move a brand with workflow execution authorization history. Execution read scopes and brand dependencies are append-only and must remain in their original organization.',
    );
  }
}

/** Every in-flight and immutable-history guard, in the order they are cheapest to fail. */
export async function assertNoInFlightBrandWork(
  client: Prisma.TransactionClient,
  brandId: string,
  organizationId: string,
): Promise<void> {
  await assertNoWorkflowExecutionReadHistory(client, brandId, organizationId);
  await assertNoInFlightWorkflowWork(client, brandId, organizationId);
  await assertNoOpenExecutionCreditHolds(client, brandId, organizationId);
  await assertNoUnresolvedPublishReceipts(client, brandId, organizationId);
  await assertNoInFlightTurboRuns(client, brandId, organizationId);
  await assertNoInFlightBreakoutWork(client, brandId, organizationId);
}
