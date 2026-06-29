import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// Prisma serialization-failure code surfaced when a Serializable transaction
// loses a write/write race (SQLSTATE 40001). A concurrent caller already
// created the default workflow, so we treat it as success.
const PRISMA_SERIALIZATION_FAILURE = 'P2034';

type DefaultRecurringContentType = 'image' | 'newsletter' | 'post';

type DefaultRecurringContentItem = {
  contentType: DefaultRecurringContentType;
  nextRunAt: Date | null;
  status: string;
  workflowId: string;
};

export type DefaultRecurringContentStatus = {
  isConfigured: boolean;
  items: DefaultRecurringContentItem[];
};

type ExistingDefaultRecurringWorkflow = {
  id: string;
  isScheduleEnabled: boolean | null;
  metadata: unknown;
};

type EnsureDefaultRecurringContentParams = {
  brandId: string;
  includeStatus?: boolean;
  organizationId: string;
  origin: 'brand-create' | 'empty-state' | 'manual' | 'onboarding' | 'system';
  userId: string;
};

const DEFAULT_RECURRING_SCHEDULE = '0 8 * * *';
const DEFAULT_RECURRING_TYPES: DefaultRecurringContentType[] = [
  'post',
  'newsletter',
  'image',
];

@Injectable()
export class DefaultRecurringContentService {
  private readonly logContext = 'DefaultRecurringContentService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async getStatus(
    organizationId: string,
    brandId: string,
  ): Promise<DefaultRecurringContentStatus> {
    const workflows = await this.prisma.workflow.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        brands: { some: { id: brandId } },
        isDeleted: false,
        isScheduleEnabled: true,
        organizationId,
      },
    });

    const filteredWorkflows = workflows.filter((w) => {
      const contentType = this.readWorkflowContentType(
        (w as Record<string, unknown>).metadata as
          | Record<string, unknown>
          | undefined,
      );
      return contentType !== null;
    });

    const latestByType = new Map<
      DefaultRecurringContentType,
      Record<string, unknown>
    >();
    for (const workflow of filteredWorkflows) {
      const contentType = this.readWorkflowContentType(
        (workflow as Record<string, unknown>).metadata as
          | Record<string, unknown>
          | undefined,
      );
      if (!contentType || latestByType.has(contentType)) {
        continue;
      }
      latestByType.set(contentType, workflow as Record<string, unknown>);
    }

    const workflowIds = Array.from(latestByType.values()).map(
      (w) => w.id as string,
    );
    const latestExecutions =
      workflowIds.length > 0
        ? await this.prisma.workflowExecution.findMany({
            orderBy: [{ createdAt: 'desc' }, { startedAt: 'desc' }],
            where: {
              isDeleted: false,
              organizationId,
              workflowId: { in: workflowIds },
            },
          })
        : [];

    const executionByWorkflowId = new Map<string, Record<string, unknown>>();
    for (const execution of latestExecutions) {
      const workflowId = (execution as Record<string, unknown>)
        .workflowId as string;
      if (!workflowId || executionByWorkflowId.has(workflowId)) {
        continue;
      }
      executionByWorkflowId.set(
        workflowId,
        execution as Record<string, unknown>,
      );
    }

    const items = DEFAULT_RECURRING_TYPES.flatMap((contentType) => {
      const workflow = latestByType.get(contentType);
      if (!workflow) {
        return [];
      }

      const workflowId = workflow.id as string;
      const execution = executionByWorkflowId.get(workflowId);
      const recurrence = workflow.recurrence as Record<string, unknown> | null;

      return [
        {
          contentType,
          nextRunAt: (recurrence?.nextRunAt as Date) ?? null,
          status: (execution?.status ?? workflow.status) as string,
          workflowId,
        } satisfies DefaultRecurringContentItem,
      ];
    });

    return {
      isConfigured: items.length === DEFAULT_RECURRING_TYPES.length,
      items,
    };
  }

  async ensureDefaultBundle(
    params: EnsureDefaultRecurringContentParams,
  ): Promise<DefaultRecurringContentStatus> {
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: params.brandId,
        isDeleted: false,
        organizationId: params.organizationId,
      },
    });

    if (!brand) {
      throw new Error(`Brand "${params.brandId}" not found`);
    }

    const existingWorkflows = (await this.prisma.workflow.findMany({
      select: { id: true, isScheduleEnabled: true, metadata: true },
      where: {
        brands: { some: { id: params.brandId } },
        isDeleted: false,
        organizationId: params.organizationId,
      },
    })) as ExistingDefaultRecurringWorkflow[];

    const existingByType = new Map<
      DefaultRecurringContentType,
      ExistingDefaultRecurringWorkflow
    >();
    for (const workflow of existingWorkflows) {
      const contentType = this.readWorkflowContentType(
        workflow.metadata as Record<string, unknown> | undefined,
      );
      if (contentType && !existingByType.has(contentType)) {
        existingByType.set(contentType, workflow);
      }
    }

    for (const contentType of DEFAULT_RECURRING_TYPES) {
      const existing = existingByType.get(contentType);
      if (existing) {
        if (!existing.isScheduleEnabled) {
          await this.prisma.workflow.update({
            data: { isScheduleEnabled: true },
            where: { id: existing.id },
          });
        }
        continue;
      }

      // The bulk read above is only a fast path. Two concurrent onboarding
      // requests for the same brand can both observe "no existing default
      // workflow" here and both create one. The check-and-create is therefore
      // re-run inside a Serializable transaction so Postgres serialises the
      // racing callers and at most one workflow per contentType is created.
      await this.ensureRecurringWorkflowForType({
        brand: brand as unknown as BrandDocument,
        brandId: params.brandId,
        contentType,
        organizationId: params.organizationId,
        origin: params.origin,
        userId: params.userId,
      });
    }

    if (params.includeStatus === false) {
      return {
        isConfigured: true,
        items: [],
      };
    }

    return await this.getStatus(params.organizationId, params.brandId);
  }

  /**
   * Idempotently ensures a single default recurring workflow exists for the
   * given brand + contentType. Both the existence re-check and the create run
   * inside the same Serializable transaction so concurrent callers cannot each
   * create a duplicate: the second committer hits a serialization failure
   * (P2034), which we treat as "already created by the winner".
   */
  private async ensureRecurringWorkflowForType(params: {
    brand: BrandDocument;
    brandId: string;
    contentType: DefaultRecurringContentType;
    organizationId: string;
    origin: EnsureDefaultRecurringContentParams['origin'];
    userId: string;
  }): Promise<void> {
    // Best-effort credential lookup for the post node config. Deliberately read
    // OUTSIDE the Serializable transaction: it only pre-populates node config
    // and must not join the transaction's read-set. If it did, a concurrent
    // credential write (e.g. an OAuth connect during onboarding) could raise a
    // serialization failure unrelated to the workflow insert, which the catch
    // below would misread as "already created" and silently skip the workflow.
    const credentialId =
      params.contentType === 'post'
        ? ((
            await this.prisma.credential.findFirst({
              select: { id: true },
              where: {
                brandId: params.brandId,
                isConnected: true,
                isDeleted: false,
                organizationId: params.organizationId,
              },
            })
          )?.id ?? null)
        : null;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Re-check inside the transaction. The metadata filter is unindexed,
          // so Postgres seq-scans `workflows` and takes a relation-level
          // SIReadLock; any concurrent insert into `workflows` therefore forms
          // the read/write conflict that Serializable isolation needs to
          // serialise the racing callers and reject the duplicate at commit.
          const existing = await tx.workflow.findFirst({
            select: { id: true, isScheduleEnabled: true },
            where: {
              brands: { some: { id: params.brandId } },
              isDeleted: false,
              metadata: {
                equals: params.contentType,
                path: ['defaultRecurringContent', 'contentType'],
              },
              organizationId: params.organizationId,
            },
          });

          if (existing) {
            if (!existing.isScheduleEnabled) {
              await tx.workflow.update({
                data: { isScheduleEnabled: true },
                where: { id: existing.id },
              });
            }
            return;
          }

          await this.createDefaultRecurringWorkflow({
            brand: params.brand,
            contentType: params.contentType,
            credentialId,
            organizationId: params.organizationId,
            origin: params.origin,
            // The transaction.util cast idiom: the interactive-transaction
            // client is structurally a PrismaTransactionClient.
            tx: tx as unknown as PrismaTransactionClient,
            userId: params.userId,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === PRISMA_SERIALIZATION_FAILURE) {
        this.logger.debug(
          `${this.logContext} serialization conflict — default recurring workflow already created by a concurrent request`,
          {
            brandId: params.brandId,
            contentType: params.contentType,
            organizationId: params.organizationId,
          },
        );
        return;
      }
      throw error;
    }
  }

  private async createDefaultRecurringWorkflow(params: {
    brand: BrandDocument;
    contentType: DefaultRecurringContentType;
    // Pre-resolved outside the Serializable transaction; see
    // ensureRecurringWorkflowForType.
    credentialId: string | null;
    organizationId: string;
    origin: EnsureDefaultRecurringContentParams['origin'];
    tx: PrismaTransactionClient;
    userId: string;
  }): Promise<void> {
    const brandId = String(
      params.brand._id ?? (params.brand as Record<string, unknown>).id,
    );
    const brandRecord = params.brand as unknown as Record<string, unknown>;
    const agentConfig = brandRecord.agentConfig as
      | Record<string, unknown>
      | undefined;
    const schedule = agentConfig?.schedule as
      | Record<string, unknown>
      | undefined;
    const timezone =
      (typeof schedule?.timezone === 'string'
        ? schedule.timezone.trim()
        : '') || 'UTC';
    const cronSchedule = DEFAULT_RECURRING_SCHEDULE;

    const workflowLabel = this.buildWorkflowLabel(
      params.brand.label as unknown as string,
      params.contentType,
    );
    const workflowDescription = this.buildWorkflowDescription(
      params.contentType,
      cronSchedule,
      timezone,
    );
    const workflow = await params.tx.workflow.create({
      data: {
        brands: { connect: [{ id: brandId }] },
        description: workflowDescription,
        edges: [] as never,
        executionCount: 0,
        inputVariables: [] as never,
        isDeleted: false,
        isScheduleEnabled: true,
        label: workflowLabel,
        metadata: {
          createdFrom: 'system',
          defaultRecurringContent: {
            contentType: params.contentType,
            managedBy: 'system',
            origin: params.origin,
            version: 1,
          },
          taskType: 'default-recurring-content',
        },
        nodes: [
          {
            data: {
              config: this.buildNodeConfig({
                brandId,
                brandLabel: params.brand.label as unknown as string,
                contentType: params.contentType,
                credentialId: params.credentialId ?? undefined,
                timezone,
              }),
              label: this.buildNodeLabel(params.contentType),
            },
            id: `generate-${params.contentType}`,
            position: { x: 120, y: 120 },
            type: this.buildNodeType(params.contentType),
          },
        ] as never,
        organizationId: params.organizationId,
        progress: 0,
        schedule: cronSchedule,
        status: WorkflowStatus.ACTIVE,
        steps: [] as never,
        timezone,
        userId: params.userId,
      },
    });

    const workflowId = String(
      (workflow as Record<string, unknown>)._id ??
        (workflow as Record<string, unknown>).id,
    );

    this.logger.log(`${this.logContext} created default recurring workflow`, {
      brandId,
      contentType: params.contentType,
      organizationId: params.organizationId,
      workflowId,
    });
  }

  private buildNodeConfig(params: {
    brandId: string;
    brandLabel: string;
    contentType: DefaultRecurringContentType;
    credentialId?: string;
    timezone: string;
  }): Record<string, unknown> {
    const sharedConfig = {
      brandId: params.brandId,
      brandLabel: params.brandLabel,
      scheduleType: 'daily',
      timezone: params.timezone,
    };

    switch (params.contentType) {
      case 'post':
        return {
          ...sharedConfig,
          credentialId: params.credentialId,
          prompt: `Create one concise social media draft for ${params.brandLabel}. Keep it specific, on-brand, and ready for review.`,
        };
      case 'newsletter':
        return {
          ...sharedConfig,
          instructions: `Prepare the next review-ready newsletter draft for ${params.brandLabel}. Preserve continuity, avoid repetition, and keep the structure clear.`,
          prompt: `Create the next daily newsletter issue for ${params.brandLabel}.`,
        };
      case 'image':
      default:
        return {
          ...sharedConfig,
          model: 'genfeed-ai/flux2-dev',
          prompt: `Create a branded social image concept for ${params.brandLabel}.`,
          style: 'brand-campaign',
        };
    }
  }

  private buildNodeLabel(contentType: DefaultRecurringContentType): string {
    switch (contentType) {
      case 'post':
        return 'Generate Post';
      case 'newsletter':
        return 'Generate Newsletter';
      case 'image':
      default:
        return 'Generate Image';
    }
  }

  private buildNodeType(contentType: DefaultRecurringContentType): string {
    switch (contentType) {
      case 'post':
        return 'ai-generate-post';
      case 'newsletter':
        return 'ai-generate-newsletter';
      case 'image':
      default:
        return 'ai-generate-image';
    }
  }

  private buildWorkflowLabel(
    brandLabel: string,
    contentType: DefaultRecurringContentType,
  ): string {
    switch (contentType) {
      case 'post':
        return `Daily posts for ${brandLabel}`;
      case 'newsletter':
        return `Daily newsletter for ${brandLabel}`;
      case 'image':
      default:
        return `Daily images for ${brandLabel}`;
    }
  }

  private buildWorkflowDescription(
    contentType: DefaultRecurringContentType,
    schedule: string,
    timezone: string,
  ): string {
    return [
      `Default recurring ${contentType} generation workflow`,
      `Schedule: ${schedule}`,
      `Timezone: ${timezone}`,
    ].join('\n');
  }

  private readWorkflowContentType(
    metadata: Record<string, unknown> | undefined,
  ): DefaultRecurringContentType | null {
    const defaultRecurringContent = metadata?.defaultRecurringContent;
    if (
      !defaultRecurringContent ||
      typeof defaultRecurringContent !== 'object'
    ) {
      return null;
    }

    const contentType = (defaultRecurringContent as { contentType?: unknown })
      .contentType;
    return contentType === 'post' ||
      contentType === 'newsletter' ||
      contentType === 'image'
      ? contentType
      : null;
  }
}
