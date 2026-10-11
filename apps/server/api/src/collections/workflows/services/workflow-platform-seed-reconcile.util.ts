import {
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
 * - it belongs to the organization and to the seeding user the operator named;
 * - it is organization-wide (no brand) and was written as a seeded template;
 * - its current immutable version has exactly the template's content hash.
 * The oldest such row wins, so a later tenant duplicate never becomes the platform row. A row
 * left paused is never re-enabled here: the scheduler does not record why a schedule was
 * paused, so a user's pause cannot be told apart from a hold.
 */
export async function reconcilePlatformSeedMarker(
  deps: { logger: LoggerService; prisma: PrismaService },
  input: {
    organizationId: string;
    template: SeedableWorkflowTemplate;
    userId: string;
  },
): Promise<PlatformSeedReconcileOutcome> {
  const { organizationId, template, userId } = input;
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
      readSourceType(candidate.metadata) === 'seeded-template',
  );

  if (!seeded) {
    if (candidates.length > 0) {
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

function readSourceType(metadata: unknown): unknown {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).sourceType
    : undefined;
}
