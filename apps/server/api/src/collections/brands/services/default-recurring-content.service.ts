import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import {
  Credential,
  type CredentialDocument,
} from '@api/collections/credentials/schemas/credential.schema';
import {
  WorkflowExecution,
  type WorkflowExecutionDocument,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import {
  Workflow,
  type WorkflowDocument,
} from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { WorkflowTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

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
    @InjectModel(Brand.name, DB_CONNECTIONS.CLOUD)
    private readonly brandModel: Model<BrandDocument>,
    @InjectModel(Workflow.name, DB_CONNECTIONS.CLOUD)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowExecution.name, DB_CONNECTIONS.CLOUD)
    private readonly workflowExecutionModel: Model<WorkflowExecutionDocument>,
    @InjectModel(Credential.name, DB_CONNECTIONS.CLOUD)
    private readonly credentialModel: Model<CredentialDocument>,
    private readonly workflowsService: WorkflowsService,
    private readonly logger: LoggerService,
  ) {}

  async getStatus(
    organizationId: string,
    brandId: string,
  ): Promise<DefaultRecurringContentStatus> {
    const brandObjectId = new Types.ObjectId(brandId);
    const organizationObjectId = new Types.ObjectId(organizationId);
    const workflows = await this.workflowModel
      .find({
        brands: brandObjectId,
        isDeleted: false,
        isScheduleEnabled: true,
        'metadata.defaultRecurringContent.contentType': {
          $in: DEFAULT_RECURRING_TYPES,
        },
        organization: organizationObjectId,
      })
      .sort({ createdAt: -1 })
      .lean();

    const latestByType = new Map<
      DefaultRecurringContentType,
      WorkflowDocument
    >();
    for (const workflow of workflows) {
      const contentType = this.readWorkflowContentType(workflow.metadata);
      if (!contentType || latestByType.has(contentType)) {
        continue;
      }
      latestByType.set(contentType, workflow);
    }

    const workflowIds = Array.from(latestByType.values()).map(
      (workflow) => new Types.ObjectId(workflow._id),
    );
    const latestExecutions =
      workflowIds.length > 0
        ? await this.workflowExecutionModel
            .find({
              isDeleted: false,
              organization: organizationObjectId,
              workflow: { $in: workflowIds },
            })
            .sort({ createdAt: -1, startedAt: -1 })
            .lean()
        : [];

    const executionByWorkflowId = new Map<string, WorkflowExecutionDocument>();
    for (const execution of latestExecutions) {
      const workflowId = execution.workflow?.toString();
      if (!workflowId || executionByWorkflowId.has(workflowId)) {
        continue;
      }
      executionByWorkflowId.set(workflowId, execution);
    }

    const items = DEFAULT_RECURRING_TYPES.flatMap((contentType) => {
      const workflow = latestByType.get(contentType);
      if (!workflow) {
        return [];
      }

      const workflowId = workflow._id.toString();
      const execution = executionByWorkflowId.get(workflowId);

      return [
        {
          contentType,
          nextRunAt: workflow.recurrence?.nextRunAt ?? null,
          status: execution?.status ?? workflow.status,
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
    const brand = await this.brandModel.findOne({
      _id: new Types.ObjectId(params.brandId),
      isDeleted: false,
      organization: new Types.ObjectId(params.organizationId),
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
        brand,
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
    const brandId = params.brand._id.toString();
    const timezone =
      params.brand.agentConfig?.schedule?.timezone?.trim() || 'UTC';
    const schedule = DEFAULT_RECURRING_SCHEDULE;
    const credential =
      params.contentType === 'post'
        ? await this.credentialModel.findOne({
            brand: new Types.ObjectId(brandId),
            isConnected: true,
            isDeleted: false,
            organization: new Types.ObjectId(params.organizationId),
          })
        : null;

    const workflowLabel = this.buildWorkflowLabel(
      params.brand.label,
      params.contentType,
    );
    const workflowDescription = this.buildWorkflowDescription(
      params.contentType,
      schedule,
      timezone,
    );
    const workflow = await this.workflowsService.createWorkflow(
      params.userId,
      params.organizationId,
      {
        brands: [new Types.ObjectId(brandId)],
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
                brandLabel: params.brand.label,
                contentType: params.contentType,
                credentialId: credential?._id?.toString(),
                timezone,
              }),
              label: this.buildNodeLabel(params.contentType),
            },
            id: `generate-${params.contentType}`,
            position: { x: 120, y: 120 },
            type: this.buildNodeType(params.contentType),
          },
        ],
        schedule,
        timezone,
        trigger: WorkflowTrigger.MANUAL,
      } as never,
    );

    const workflowId = String(workflow._id ?? workflow.id);

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
