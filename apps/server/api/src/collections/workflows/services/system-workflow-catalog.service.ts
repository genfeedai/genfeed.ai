import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
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
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
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
      return existing as unknown as WorkflowDocument;
    }

    const createData = this.buildInstallCreateData(input, entry);

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          const concurrent = await tx.workflow.findFirst({
            where: scopedWhere(input.organizationId, {
              metadata: {
                equals: entry.canonicalId,
                path: ['sourceTemplateId'],
              },
            }),
          });

          if (concurrent) {
            return concurrent;
          }

          return tx.workflow.create({
            data: createData as never,
          });
        },
        { isolationLevel: 'Serializable' },
      );

      await this.workflowExecutionQueueService?.syncWorkflowScheduler({
        id: created.id,
        isDeleted: created.isDeleted,
        isScheduleEnabled: created.isScheduleEnabled,
        metadata: created.metadata,
        schedule: created.schedule,
        status: created.status,
        timezone: created.timezone,
      });

      return created as unknown as WorkflowDocument;
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'P2034') {
        const raced = await this.findExistingInstall(
          input.organizationId,
          entry.canonicalId,
        );
        if (raced) {
          return raced as unknown as WorkflowDocument;
        }
      }
      throw error;
    }
  }

  private async findInstalledByCanonicalId(
    organizationId: string,
  ): Promise<Map<string, string>> {
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
      edges: entry.edges as never,
      executionCount: 0,
      inputVariables: entry.inputVariables as never,
      isDeleted: false,
      isScheduleEnabled: entry.isScheduleEnabled,
      label: entry.label,
      metadata: {
        ...provenanceMetadata,
        installedAt: new Date().toISOString(),
        sourceIssue: entry.sourceIssue,
        sourceTemplateChangeSummary: entry.changeSummary,
        sourceTemplateId: entry.canonicalId,
        sourceTemplateVersion: entry.version,
        sourceType: 'catalog-install',
      },
      nodes: entry.nodes as never,
      organizationId: input.organizationId,
      progress: 0,
      schedule: entry.schedule,
      status: WorkflowStatus.ACTIVE,
      steps: entry.steps as never,
      timezone: entry.timezone,
      userId: input.userId,
    };
  }
}
