import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import {
  buildSystemWorkflowDuplicateMetadata,
  buildSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import {
  getSystemWorkflowCatalogEntry,
  listSystemWorkflowCatalog,
  type SystemWorkflowCatalogEntry,
} from '@api/collections/workflows/system-workflow-catalog';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

export type SystemWorkflowCatalogListItem = SystemWorkflowCatalogEntry & {
  installed: boolean;
  installedWorkflowId: string | null;
};

/**
 * Catalog-first system workflows (#2176).
 *
 * - List: code-owned templates (no org row required).
 * - Install: creates a tenant-owned editable workflow from the catalog.
 * - Org creation no longer clones the full system set.
 */
@Injectable()
export class SystemWorkflowCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
  ) {}

  listCatalog(): readonly SystemWorkflowCatalogEntry[] {
    return listSystemWorkflowCatalog();
  }

  async listCatalogForOrganization(
    organizationId: string,
  ): Promise<SystemWorkflowCatalogListItem[]> {
    const catalog = listSystemWorkflowCatalog();
    const installedByCanonicalId =
      await this.findInstalledByCanonicalId(organizationId);

    return catalog.map((entry) => {
      const installedWorkflowId =
        installedByCanonicalId.get(entry.canonicalId) ?? null;

      return {
        ...entry,
        installed: installedWorkflowId !== null,
        installedWorkflowId,
      };
    });
  }

  async install(input: {
    brandId?: string;
    canonicalId: string;
    organizationId: string;
    userId: string;
  }): Promise<WorkflowDocument> {
    const entry = getSystemWorkflowCatalogEntry(input.canonicalId);

    if (!entry) {
      throw new NotFoundException('System workflow catalog entry');
    }

    if (!entry.installable) {
      throw new BadRequestException(
        `Catalog entry "${entry.canonicalId}" is not user-installable. Product system actions are created on demand.`,
      );
    }

    // Soft-deleted installs are excluded by scopedWhere (`isDeleted: false`),
    // so a deleted row does not short-circuit install or report as installed.
    const existing = await this.findExistingInstall(
      input.organizationId,
      entry.canonicalId,
    );

    if (existing) {
      this.logger?.debug('System workflow catalog install is idempotent', {
        canonicalId: entry.canonicalId,
        organizationId: input.organizationId,
        workflowId: existing.id,
      });
      // Re-sync on the existing path so a prior post-commit scheduler failure
      // cannot permanently strand an installed workflow as unscheduled (#2259).
      await this.syncInstallScheduler(existing);
      const hydrated = await this.workflowsService.findOne({ id: existing.id });
      if (!hydrated) {
        throw new NotFoundException('Installed workflow');
      }
      return hydrated;
    }

    const createData = this.buildInstallCreateData(input, entry);

    try {
      const created = await this.workflowsService.create(
        createData as unknown as CreateWorkflowDto,
      );

      await this.syncInstallScheduler(created);

      return created;
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'P2034') {
        const raced = await this.findExistingInstall(
          input.organizationId,
          entry.canonicalId,
        );
        if (raced) {
          await this.syncInstallScheduler(raced);
          const hydrated = await this.workflowsService.findOne({
            id: raced.id,
          });
          if (!hydrated) {
            throw new NotFoundException('Installed workflow');
          }
          return hydrated;
        }
      }
      throw error;
    }
  }

  /**
   * Best-effort BullMQ scheduler sync after install. Failures are logged and
   * never fail the install — the workflow row is already committed. A later
   * idempotent install re-enters this path to recover.
   */
  private async syncInstallScheduler(workflow: {
    id: string;
    isDeleted?: boolean;
    isScheduleEnabled?: boolean | null;
    metadata?: unknown;
    schedule?: string | null;
    status?: string | null;
    timezone?: string | null;
  }): Promise<void> {
    if (!this.workflowExecutionQueueService) {
      return;
    }

    try {
      await this.workflowExecutionQueueService.syncWorkflowScheduler({
        id: workflow.id,
        isDeleted: workflow.isDeleted ?? false,
        isScheduleEnabled: workflow.isScheduleEnabled,
        metadata: workflow.metadata,
        schedule: workflow.schedule,
        status: workflow.status,
        timezone: workflow.timezone,
      });
    } catch (error) {
      // Defense in depth: the queue service already swallows errors, but a
      // future regression must not turn a scheduler hiccup into a failed install.
      this.logger?.error(
        'Failed to sync scheduler after system catalog install',
        {
          error,
          workflowId: workflow.id,
        },
      );
    }
  }

  private async findInstalledByCanonicalId(
    organizationId: string,
  ): Promise<Map<string, string>> {
    // scopedWhere injects isDeleted: false — soft-deleted installs stay out of
    // the "installed" map so the catalog UI can re-install.
    const workflows = await this.prisma.workflow.findMany({
      select: { id: true, metadata: true },
      where: scopedWhere(organizationId, {}),
    });

    const map = new Map<string, string>();

    for (const workflow of workflows) {
      const canonicalId = this.readSourceTemplateId(workflow.metadata);
      if (canonicalId && !map.has(canonicalId)) {
        map.set(canonicalId, workflow.id);
      }
    }

    return map;
  }

  private async findExistingInstall(
    organizationId: string,
    canonicalId: string,
  ) {
    // scopedWhere injects isDeleted: false — a soft-deleted install is treated
    // as absent so install creates a fresh usable row (#2259).
    return this.prisma.workflow.findFirst({
      where: scopedWhere(organizationId, {
        metadata: {
          equals: canonicalId,
          path: ['sourceTemplateId'],
        },
      }),
    });
  }

  private readSourceTemplateId(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const sourceTemplateId = (metadata as Record<string, unknown>)
      .sourceTemplateId;
    return typeof sourceTemplateId === 'string' && sourceTemplateId.length > 0
      ? sourceTemplateId
      : null;
  }

  private buildInstallCreateData(
    input: {
      brandId?: string;
      organizationId: string;
      userId: string;
    },
    entry: SystemWorkflowCatalogEntry,
  ): Record<string, unknown> {
    const catalogSourceId = `catalog:${entry.canonicalId}`;
    const systemWorkflowMetadata = buildSystemWorkflowMetadata({
      canonicalId: entry.canonicalId,
      changeSummary: entry.changeSummary,
      sourceIssue: entry.sourceIssue,
      version: entry.version,
    });

    // Install creates a tenant-owned editable workflow. Provenance points at
    // the catalog template; the immutable systemWorkflow marker is not stored
    // so the user can edit/enable/delete their install.
    const provenanceMetadata = buildSystemWorkflowDuplicateMetadata(
      {
        [SYSTEM_WORKFLOW_METADATA_KEY]: systemWorkflowMetadata,
        sourceIssue: entry.sourceIssue,
        sourceTemplateId: entry.canonicalId,
        sourceTemplateVersion: entry.version,
        sourceType: 'system-catalog',
      },
      catalogSourceId,
    );

    return {
      ...(input.brandId ? { brandId: input.brandId } : {}),
      description: entry.description,
      edges: toPrismaJson(entry.edges),
      executionCount: 0,
      inputVariables: toPrismaJson(entry.inputVariables),
      isDeleted: false,
      isScheduleEnabled: entry.isScheduleEnabled,
      label: entry.label,
      metadata: toPrismaJson({
        ...provenanceMetadata,
        installedAt: new Date().toISOString(),
        sourceIssue: entry.sourceIssue,
        sourceTemplateChangeSummary: entry.changeSummary,
        sourceTemplateId: entry.canonicalId,
        sourceTemplateVersion: entry.version,
        sourceType: 'catalog-install',
      }),
      nodes: toPrismaJson(entry.nodes),
      organizationId: input.organizationId,
      progress: 0,
      schedule: entry.schedule,
      status: WorkflowStatus.ACTIVE,
      timezone: entry.timezone,
      userId: input.userId,
    };
  }
}
