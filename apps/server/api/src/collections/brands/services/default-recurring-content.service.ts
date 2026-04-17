import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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

type EnsureDefaultRecurringContentParams = {
  brandId: string;
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
    private readonly workflowsService: WorkflowsService,
    private readonly logger: LoggerService,
  ) {}

  async getStatus(
    organizationId: string,
    brandId: string,
  ): Promise<DefaultRecurringContentStatus> {
    const workflows = await this.prisma.workflow.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        brandIds: { has: brandId },
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

    const existingStatus = await this.getStatus(
      params.organizationId,
      params.brandId,
    );
    const existingTypes = new Set(
      existingStatus.items.map((item) => item.contentType),
    );

    for (const contentType of DEFAULT_RECURRING_TYPES) {
      if (existingTypes.has(contentType)) {
        continue;
      }

      await this.createDefaultRecurringWorkflow({
        brand: brand as unknown as BrandDocument,
        contentType,
        organizationId: params.organizationId,
        origin: params.origin,
        userId: params.userId,
      });
    }

    return await this.getStatus(params.organizationId, params.brandId);
  }

  private async createDefaultRecurringWorkflow(params: {
    brand: BrandDocument;
    contentType: DefaultRecurringContentType;
    organizationId: string;
    origin: EnsureDefaultRecurringContentParams['origin'];
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
    const credential =
      params.contentType === 'post'
        ? await this.prisma.credential.findFirst({
            where: {
              brandId,
              isConnected: true,
              isDeleted: false,
              organizationId: params.organizationId,
            },
          })
        : null;

    const workflowLabel = this.buildWorkflowLabel(
      params.brand.label as unknown as string,
      params.contentType,
    );
    const workflowDescription = this.buildWorkflowDescription(
      params.contentType,
      cronSchedule,
      timezone,
    );
    const workflow = await this.workflowsService.createWorkflow(
      params.userId,
      params.organizationId,
      {
        brands: [brandId],
        description: workflowDescription,
        edges: [],
        inputVariables: [],
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
                credentialId: credential?.id,
                timezone,
              }),
              label: this.buildNodeLabel(params.contentType),
            },
            id: `generate-${params.contentType}`,
            position: { x: 120, y: 120 },
            type: this.buildNodeType(params.contentType),
          },
        ],
        schedule: cronSchedule,
        timezone,
        trigger: WorkflowTrigger.MANUAL,
      } as never,
    );

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
