/**
 * Seed Script: Content Production Workflows
 *
 * Idempotently provisions default-on content production workflows for existing
 * organizations and mirrors existing content schedules into workflow rows.
 * New organizations are seeded automatically on creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/content-production-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/content-production-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/content-production-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/content-production-workflows.seed.ts --env=production --live
 */

import { CONTENT_PRODUCTION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-production-workflows.template';
import {
  findMissingTemplateIds,
  runWorkflowSeed,
  type WorkflowSeedDryRunContext,
} from './shared/run-workflow-seed';

/**
 * Content production additionally mirrors content schedules into workflow rows,
 * so its dry-run also reports how many schedules are missing a backing
 * workflow alongside the standard template summary.
 */
async function reportContentProductionDryRun(
  context: WorkflowSeedDryRunContext,
): Promise<void> {
  const missingTemplates = await findMissingTemplateIds(
    context.prisma,
    context.organizationId,
    context.templates,
  );

  const schedules = await context.prisma.contentSchedule.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    where: { isDeleted: false, organizationId: context.organizationId },
  });

  let missingScheduleWorkflows = 0;
  for (const schedule of schedules) {
    const existingWorkflow = await context.prisma.workflow.findFirst({
      select: { id: true },
      where: {
        isDeleted: false,
        metadata: {
          equals: schedule.id,
          path: ['contentScheduleId'],
        },
        organizationId: context.organizationId,
      },
    });
    if (!existingWorkflow) {
      missingScheduleWorkflows += 1;
    }
  }

  context.logger.log(
    `[DRY RUN] org ${context.organizationId} missing ${missingTemplates.length}/${context.templates.length} content production workflow(s): ${missingTemplates.join(', ') || 'none'}; content schedules missing workflows=${missingScheduleWorkflows}/${schedules.length}`,
  );
}

void runWorkflowSeed({
  dryRunLabel: 'content production',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureContentProductionWorkflows(userId, organizationId),
  loggerName: 'ContentProductionWorkflowSeed',
  name: 'Content production workflow seed',
  reportDryRun: reportContentProductionDryRun,
  templates: CONTENT_PRODUCTION_WORKFLOW_TEMPLATES,
});
