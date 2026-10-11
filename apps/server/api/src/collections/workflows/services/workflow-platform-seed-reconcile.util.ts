import {
  findPlatformSeedTemplate,
  getPlatformSeedContentHash,
  isPlatformScheduledTemplate,
  type SeedableWorkflowTemplate,
} from '@api/collections/workflows/utils/workflow-platform-seed.util';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

export type PlatformSeedReconcileOutcome =
  /** The seeder's own row now carries (or already carried) the marker. */
  | 'marked'
  | 'already-marked'
  /** The template is manual-run: it never gets platform authority. */
  | 'not-scheduled'
  /** No row for this template matches it, the seeding user and the canonical graph. */
  | 'no-canonical-row';

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Marks the seeder's existing row for one catalog template as a platform workflow.
 *
 * Seeded-template metadata is tenant-writable, so it proves nothing. A row is marked only when
 * all of these hold, each read server-side from the row and the code-owned template:
 * - it belongs to the organization and to the seeding user the caller named;
 * - it is organization-wide (no brand) and was written as a seeded template, not by a tenant
 *   install (see {@link isSeederWrittenRow});
 * - its current immutable version has exactly the template's content hash.
 * The oldest such row wins, so a later tenant duplicate never becomes the platform row. The
 * write is a compare-and-set on the validated version and `updatedAt`, so a concurrent edit,
 * schedule save or pause turns it into a no-op, and the partial unique index settles two
 * concurrent reconciles (the loser sees a unique violation). A row left paused is never
 * re-enabled here: the scheduler does not record why a schedule was paused, so a user's pause
 * cannot be told apart from a hold. `onlyWorkflowId` narrows the call to one row (the scheduler
 * marking the row it is about to fire); every other row stays untouched.
 */
export async function reconcilePlatformSeedMarker(
  deps: { logger: LoggerService; prisma: PrismaService },
  input: {
    onlyWorkflowId?: string;
    organizationId: string;
    template: SeedableWorkflowTemplate;
    userId: string;
  },
): Promise<PlatformSeedReconcileOutcome> {
  const { onlyWorkflowId, organizationId, template, userId } = input;
  if (!isPlatformScheduledTemplate(template)) {
    return 'not-scheduled';
  }

  const candidates = await deps.prisma.workflow.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      brandId: true,
      currentVersion: { select: { contentHash: true } },
      currentVersionId: true,
      id: true,
      isScheduleEnabled: true,
      metadata: true,
      platformSeedKey: true,
      templateInstantiationKey: true,
      updatedAt: true,
      userId: true,
    },
    where: scopedWhere(organizationId, {
      metadata: { equals: template.id, path: ['sourceTemplateId'] },
    }),
  });

  if (
    candidates.some((candidate) => candidate.platformSeedKey === template.id)
  ) {
    return 'already-marked';
  }

  const canonicalHash = getPlatformSeedContentHash(template);
  const seeded = candidates.find(
    (candidate) =>
      canonicalHash !== undefined &&
      candidate.userId === userId &&
      !candidate.brandId &&
      !candidate.platformSeedKey &&
      candidate.currentVersion.contentHash === canonicalHash &&
      isSeederWrittenRow(candidate),
  );

  if (!seeded) {
    // A scoped call runs on every fire of a row the scheduler already pre-checked; stay quiet.
    if (onlyWorkflowId === undefined && candidates.length > 0) {
      deps.logger.warn(
        'Seeded workflow does not match its canonical template and stays a tenant workflow (held in Cloud until a person re-enables it)',
        {
          organizationId,
          templateId: template.id,
          workflowIds: candidates.map((candidate) => candidate.id),
        },
      );
    }
    return 'no-canonical-row';
  }

  if (onlyWorkflowId !== undefined && seeded.id !== onlyWorkflowId) {
    // The oldest eligible row is another one; it is marked when it is reconciled itself.
    return 'no-canonical-row';
  }

  try {
    const { count } = await deps.prisma.workflow.updateMany({
      data: {
        platformSeedKey: template.id,
        // A platform workflow never carries a person; drop any actor a schedule save bound.
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: scopedWhere(organizationId, {
        currentVersionId: seeded.currentVersionId,
        id: seeded.id,
        platformSeedKey: null,
        templateInstantiationKey: null,
        updatedAt: seeded.updatedAt,
        userId,
      }),
    });
    if (count === 0) {
      return 'no-canonical-row';
    }
  } catch (error: unknown) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    // A concurrent reconcile marked a row first; it is the only live one allowed.
    return 'already-marked';
  }

  if (seeded.isScheduleEnabled === false) {
    deps.logger.log(
      'Marked a paused seeded workflow as a platform workflow; left paused',
      { organizationId, templateId: template.id, workflowId: seeded.id },
    );
  }
  return 'marked';
}

export type ScheduledSeedReconcileRow = {
  brandId: string | null;
  currentVersion?: { contentHash?: string | null } | null;
  id: string;
  metadata: unknown;
  organizationId: string;
  platformSeedKey: string | null;
  scheduleInitiatingActor: Prisma.JsonValue | null;
  templateInstantiationKey: string | null;
  userId: string;
};

export type ScheduledSeedReconcileResult =
  | { platformSeedKey: string; status: 'marked' }
  | { status: 'not-candidate' }
  | { status: 'unmarked' };

/**
 * Marks, right before the Cloud scheduler would run it, an unmarked row that is provably the
 * seeding flow's own canonical workflow, so no operator step is needed. `marked` means this call
 * marked that row and the caller runs it as a platform workflow. `unmarked` means the row was a
 * candidate but this call did not mark it (a concurrent writer won, another row is the oldest,
 * the owner check failed, or the database failed), so the caller must re-read the row before it
 * decides anything from a possibly stale copy. `not-candidate` means nothing was read or
 * written and the in-memory row is authoritative.
 *
 * The seeding user is the organization owner (`Organization.userId`): the seeders were always
 * called with it (`migrate:workflows` seeded each organization under its owner), so a row owned
 * by any other member is never marked. The owner must also still be an active member, which is
 * the rule the schedule-actor grandfather migration applied, so a row whose owner left stays
 * unbound and is held like any other.
 *
 * It runs only for a row about to fire, so a paused row is never touched and never re-enabled.
 * A row bound to someone else's actor (another member or an API key) is a tenant's explicit
 * choice and is left alone; an actor that is the owner themself (what the grandfather migration
 * wrote) is replaced by the platform marker. Every cheap in-memory check runs first, so a
 * tenant workflow costs no query. Reconcile is best effort: a failure here leaves the row
 * unmarked and the scheduler continues with its existing actor rules.
 */
export async function reconcileSeededWorkflowBeforeScheduledRun(
  deps: { logger: LoggerService; prisma: PrismaService },
  workflow: ScheduledSeedReconcileRow,
): Promise<ScheduledSeedReconcileResult> {
  const template = findCanonicalSeedTemplateForUnmarkedRow(workflow);
  if (!template) {
    return { status: 'not-candidate' };
  }

  try {
    if (!(await isActiveOrganizationOwner(deps.prisma, workflow))) {
      return { status: 'unmarked' };
    }

    const outcome = await reconcilePlatformSeedMarker(deps, {
      onlyWorkflowId: workflow.id,
      organizationId: workflow.organizationId,
      template,
      userId: workflow.userId,
    });
    if (outcome === 'marked') {
      deps.logger.log(
        'Marked a canonical seeded workflow as a platform workflow before its scheduled run',
        {
          organizationId: workflow.organizationId,
          templateId: template.id,
          workflowId: workflow.id,
        },
      );
    }
    return outcome === 'marked'
      ? { platformSeedKey: template.id, status: 'marked' }
      : { status: 'unmarked' };
  } catch (error: unknown) {
    deps.logger.warn(
      'Could not reconcile a seeded workflow before its scheduled run; it keeps its existing authority rules',
      {
        error: error instanceof Error ? error.message : String(error),
        organizationId: workflow.organizationId,
        workflowId: workflow.id,
      },
    );
    return { status: 'unmarked' };
  }
}

/**
 * Whether the row's user is the organization's owner (`Organization.userId`) and still an active
 * member of it. Both are read from the database, never from the row.
 */
async function isActiveOrganizationOwner(
  prisma: PrismaService,
  workflow: Pick<ScheduledSeedReconcileRow, 'organizationId' | 'userId'>,
): Promise<boolean> {
  const organization = await prisma.organization.findFirst({
    select: { id: true },
    where: {
      id: workflow.organizationId,
      isDeleted: false,
      userId: workflow.userId,
    },
  });
  if (!organization) {
    return false;
  }
  const member = await prisma.member.findFirst({
    select: { id: true },
    where: scopedWhere(workflow.organizationId, {
      isActive: true,
      userId: workflow.userId,
    }),
  });
  return member !== null;
}

function findCanonicalSeedTemplateForUnmarkedRow(
  workflow: ScheduledSeedReconcileRow,
): SeedableWorkflowTemplate | undefined {
  if (workflow.platformSeedKey || workflow.brandId) {
    return undefined;
  }
  const templateId = readMetadataField(workflow.metadata, 'sourceTemplateId');
  if (typeof templateId !== 'string' || !isSeederWrittenRow(workflow)) {
    return undefined;
  }
  const template = findPlatformSeedTemplate(templateId);
  if (!template) {
    return undefined;
  }
  const canonicalHash = getPlatformSeedContentHash(template);
  if (
    canonicalHash === undefined ||
    workflow.currentVersion?.contentHash !== canonicalHash ||
    !isUnboundOrOwnerBoundActor(workflow)
  ) {
    return undefined;
  }
  return template;
}

/** No actor, or the owner's own session actor (what the grandfather migration bound). */
function isUnboundOrOwnerBoundActor(
  workflow: Pick<
    ScheduledSeedReconcileRow,
    'scheduleInitiatingActor' | 'userId'
  >,
): boolean {
  const actor = workflow.scheduleInitiatingActor;
  if (actor === null || actor === undefined) {
    return true;
  }
  return (
    typeof actor === 'object' &&
    !Array.isArray(actor) &&
    actor.userId === workflow.userId &&
    actor.isApiKey === false
  );
}

function readMetadataField(metadata: unknown, field: string): unknown {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)[field]
    : undefined;
}

/**
 * Whether a row looks like the seeder wrote it rather than a tenant installing the template.
 * The seeder writes `sourceType: 'seeded-template'` and never a template-instantiation key or a
 * `createdFrom` origin; the app's "use template" and the agent install both write one. A tenant
 * can omit either, so this only keeps honest installs out. The owner, the exact hash and the
 * unique index are what make a mark safe.
 */
function isSeederWrittenRow(row: {
  metadata: unknown;
  templateInstantiationKey: string | null;
}): boolean {
  return (
    readMetadataField(row.metadata, 'sourceType') === 'seeded-template' &&
    readMetadataField(row.metadata, 'createdFrom') === undefined &&
    row.templateInstantiationKey === null
  );
}
