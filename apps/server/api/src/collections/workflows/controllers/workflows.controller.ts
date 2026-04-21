import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import {
  CreditEstimateQueryDto,
  ExecutePartialDto,
  GenerateWorkflowDto,
  ImportWorkflowDto,
  LockNodesDto,
  ResumeExecutionDto,
  SubmitApprovalDto,
  UnlockNodesDto,
} from '@api/collections/workflows/dto/execute-workflow.dto';
import { SetThumbnailDto } from '@api/collections/workflows/dto/set-thumbnail.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import {
  isWorkflowInputNodeType,
  isWorkflowOutputNodeType,
} from '@api/collections/workflows/node-type-aliases';
import {
  getNodeDefinition,
  getNodesByCategory,
  UNIFIED_NODE_REGISTRY as NODE_REGISTRY,
  type NodeDefinition,
  validateConnection,
} from '@api/collections/workflows/registry/node-registry-adapter';
import type {
  WorkflowDocument,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { BatchWorkflowQueueService } from '@api/collections/workflows/services/batch-workflow-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import {
  type CloudWorkflowFormat,
  type CoreWorkflowFormat,
  WorkflowFormatConverterService,
} from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { WorkflowValidator } from '@api/collections/workflows/validators/workflow.validator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import { ListingType, WorkflowTrigger } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  WorkflowExecutionSerializer,
  WorkflowSerializer,
} from '@genfeedai/serializers';
import type { CreditEstimate } from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

type WorkflowTemplates = Awaited<
  ReturnType<WorkflowsService['getWorkflowTemplates']>
>;

type WorkflowStatistics = Awaited<
  ReturnType<WorkflowsService['getWorkflowStatistics']>
>;

type JsonApiResourceLike = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
};

@AutoSwagger()
@Controller('workflows')
export class WorkflowsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowSchedulerService: WorkflowSchedulerService,
    @Optional()
    private readonly marketplaceApiClient: MarketplaceApiClient | undefined,
    private readonly workflowGenerationService: WorkflowGenerationService,
    private readonly formatConverterService: WorkflowFormatConverterService,
    private readonly batchWorkflowService: BatchWorkflowService,
    private readonly batchWorkflowQueueService: BatchWorkflowQueueService,
    readonly _loggerService: LoggerService,
  ) {}

  @Get('templates')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTemplates(): Promise<{ data: WorkflowTemplates }> {
    const templates = await this.workflowsService.getWorkflowTemplates();

    return { data: templates };
  }

  // ===========================================================================
  // VISUAL BUILDER ENDPOINTS
  // ===========================================================================

  @Get('nodes/registry')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  getNodeRegistry(): {
    data: {
      nodes: Record<string, NodeDefinition>;
      byCategory: Record<string, NodeDefinition[]>;
    };
  } {
    return {
      data: {
        byCategory: getNodesByCategory(),
        nodes: NODE_REGISTRY,
      },
    };
  }

  @Get('nodes/:nodeType')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  getNodeDefinition(@Param('nodeType') nodeType: string): {
    data: NodeDefinition | null;
  } {
    const definition = getNodeDefinition(nodeType);
    return { data: definition || null };
  }

  @Post('validate-connection')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  validateNodeConnection(
    @Body()
    body: {
      sourceType: string;
      sourceHandle: string;
      targetType: string;
      targetHandle: string;
    },
  ): { data: { valid: boolean; reason?: string } } {
    const { sourceType, sourceHandle, targetType, targetHandle } = body;
    const valid = validateConnection(
      sourceType,
      sourceHandle,
      targetType,
      targetHandle,
    );

    return {
      data: {
        reason: valid ? undefined : 'Incompatible port types',
        valid,
      },
    };
  }

  @Post('generate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateWorkflow(
    @Body() dto: GenerateWorkflowDto,
    @CurrentUser() _user: User,
  ): Promise<{
    data: { workflow: Record<string, unknown>; tokensUsed: number };
  }> {
    try {
      const result =
        await this.workflowGenerationService.generateWorkflowFromDescription({
          description: dto.description,
          targetPlatforms: dto.targetPlatforms,
        });

      return {
        data: {
          tokensUsed: result.tokensUsed,
          workflow: result.workflow,
        },
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message =
        (error as Error)?.message ?? 'Failed to generate workflow';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('import')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importWorkflow(
    @Req() request: Request,
    @Body() dto: ImportWorkflowDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);

      const inputWorkflow = dto.workflow as unknown as
        | CoreWorkflowFormat
        | CloudWorkflowFormat;

      const {
        workflow: cloudWorkflow,
        warnings,
        unmappedNodeTypes,
      } = dto.format === 'core'
        ? this.formatConverterService.convertCoreToCloud(
            inputWorkflow as CoreWorkflowFormat,
          )
        : this.formatConverterService.ensureCloudFormat(inputWorkflow);

      const workflowName =
        dto.name ?? cloudWorkflow.name ?? 'Imported Workflow';

      const created = await this.workflowsService.createWorkflow(
        publicMetadata.user,
        publicMetadata.organization,
        {
          description: cloudWorkflow.description,
          edges: cloudWorkflow.edges,
          label: workflowName,
          metadata: {
            importedAt: new Date().toISOString(),
            sourceFormat: dto.format ?? 'auto',
            unmappedNodeTypes:
              unmappedNodeTypes.length > 0 ? unmappedNodeTypes : undefined,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
          nodes: cloudWorkflow.nodes,
          trigger: WorkflowTrigger.MANUAL,
        } as CreateWorkflowDto,
      );

      return serializeSingle(request, WorkflowSerializer, created);
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to import workflow';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('marketplace')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMarketplace(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted: false,
          isPublic: true,
          isTemplate: true,
        },
      },
      {
        $sort: handleQuerySort(query.sort || '-executionCount'),
      },
    ];

    const data: AggregatePaginateResult<WorkflowDocument> =
      await this.workflowsService.findAll(aggregate, options);
    return serializeCollection(request, WorkflowSerializer, data);
  }

  @Get('referencable')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getReferencableWorkflows(
    @Req() request: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted: false,
          organization: publicMetadata.organization,
        },
      },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          description: 1,
          name: 1,
          nodes: 1,
          organization: 1,
          updatedAt: 1,
        },
      },
    ];
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults({}),
    };
    const data = await this.workflowsService.findAll(aggregate, options);
    return serializeCollection(request, WorkflowSerializer, data);
  }

  @Get(':workflowId/interface')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getWorkflowInterface(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{
    data: { inputs: Record<string, unknown>; outputs: Record<string, unknown> };
  }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
    } as Record<string, unknown>);

    if (
      !workflow ||
      String(workflow.organization ?? '') !== publicMetadata.organization
    ) {
      throw new NotFoundException('Workflow not found');
    }

    const inputs: Record<string, unknown> = {};
    const outputs: Record<string, unknown> = {};

    if (workflow.inputVariables && workflow.inputVariables.length > 0) {
      for (const variable of workflow.inputVariables) {
        inputs[variable.key] = {
          defaultValue: variable.defaultValue,
          description: variable.description,
          label: variable.label,
          required: variable.required,
          type: variable.type,
          validation: variable.validation,
        };
      }
    } else {
      for (const node of workflow.nodes || []) {
        if (isWorkflowInputNodeType(node.type)) {
          const nodeData = node.data as
            | {
                config?: {
                  defaultValue?: unknown;
                  description?: string;
                  inputName?: string;
                  inputType?: string;
                  required?: boolean;
                };
                label?: string;
              }
            | undefined;
          const inputName = nodeData?.config?.inputName ?? node.id;
          inputs[inputName] = {
            defaultValue: nodeData?.config?.defaultValue,
            description: nodeData?.config?.description,
            label: nodeData?.label ?? inputName,
            required: Boolean(nodeData?.config?.required),
            type: nodeData?.config?.inputType ?? 'text',
          };
        }
      }
    }

    for (const node of workflow.nodes || []) {
      if (isWorkflowOutputNodeType(node.type)) {
        const outputName =
          (node.data?.config?.outputName as string | undefined) ?? node.id;
        outputs[outputName] = { type: 'any' };
      }
    }

    return { data: { inputs, outputs } };
  }

  @Post(':workflowId/validate-reference')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async validateWorkflowReference(
    @Param('workflowId') workflowId: string,
    @Body() body: { inputs: Record<string, unknown> },
    @CurrentUser() user: User,
  ): Promise<{ data: { isValid: boolean; errors: string[] } }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
    } as Record<string, unknown>);

    if (
      !workflow ||
      String(workflow.organization ?? '') !== publicMetadata.organization
    ) {
      throw new NotFoundException('Workflow not found');
    }

    const errors: string[] = [];
    const requiredInputs = new Set<string>();

    // Extract required workflow input nodes
    for (const node of workflow.nodes || []) {
      if (isWorkflowInputNodeType(node.type)) {
        const nodeConfig = (node.data as { config?: { inputName?: string } })
          ?.config;
        const name = nodeConfig?.inputName || 'input';
        requiredInputs.add(name);
      }
    }

    // Validate provided inputs match requirements
    for (const required of requiredInputs) {
      if (!(required in (body.inputs || {}))) {
        errors.push(`Missing required input: ${required}`);
      }
    }

    return {
      data: {
        errors,
        isValid: errors.length === 0,
      },
    };
  }

  @Post(':workflowId/validate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async validateWorkflow(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      valid: boolean;
      errors: Array<{ nodeId?: string; edgeId?: string; message: string }>;
    };
  }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    const result = WorkflowValidator.validate({
      edges: workflow.edges,
      nodes: workflow.nodes as unknown as WorkflowVisualNode[],
    });

    return { data: result };
  }

  @Post(':workflowId/schedule')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async setSchedule(
    @Param('workflowId') workflowId: string,
    @Body() body: { schedule: string; timezone?: string; enabled?: boolean },
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      return returnNotFound(this.constructorName, workflowId);
    }

    // Update schedule and register/unregister cron job immediately
    const updated = await this.workflowSchedulerService.updateSchedule(
      workflowId,
      body.schedule,
      body.timezone || 'UTC',
      body.enabled !== false,
    );

    return updated
      ? ({
          data: { id: workflowId, message: 'Schedule updated' },
        } as unknown as JsonApiSingleResponse)
      : returnNotFound(this.constructorName, workflowId);
  }

  @Delete(':workflowId/schedule')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async removeSchedule(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      return returnNotFound(this.constructorName, workflowId);
    }

    // Remove schedule and unregister cron job immediately
    const updated = await this.workflowSchedulerService.updateSchedule(
      workflowId,
      null, // null schedule removes it
      'UTC',
      false,
    );

    return updated
      ? ({
          data: { id: workflowId, message: 'Schedule removed' },
        } as unknown as JsonApiSingleResponse)
      : returnNotFound(this.constructorName, workflowId);
  }

  @Post(':workflowId/publish')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async publishToMarketplace(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      return returnNotFound(this.constructorName, workflowId);
    }

    // Mark workflow as public/template
    await this.workflowsService.patch(workflowId, {
      isPublic: true,
      isTemplate: true,
    });

    // Create marketplace listing if seller profile exists and marketplace API is available
    let listingId: string | undefined;

    if (this.marketplaceApiClient) {
      const seller = await this.marketplaceApiClient.getSellerByUserId(
        publicMetadata.user,
      );

      if (seller) {
        const nodes = (workflow as WorkflowDocument).nodes || [];
        const edges = (workflow as WorkflowDocument).edges || [];
        const nodeTypes = [
          ...new Set(nodes.map((n: { type: string }) => n.type)),
        ];

        const listing = await this.marketplaceApiClient.createListing(
          seller._id.toString(),
          publicMetadata.organization,
          {
            description:
              (workflow as WorkflowDocument).description ||
              workflow.name ||
              'A workflow published from the builder',
            downloadData: {
              edges,
              name: workflow.name,
              nodes,
              version: 1,
            },
            previewData: {
              connections: edges.length,
              nodes: nodes.length,
              nodeTypes,
            },
            price: 0,
            shortDescription:
              (workflow as WorkflowDocument).description?.slice(0, 300) ||
              workflow.name ||
              'Workflow',
            tags: ['community', 'workflow'],
            title: workflow.name || 'Untitled Workflow',
            type: ListingType.WORKFLOW,
          },
        );

        if (listing) {
          // Auto-approve (submit for review)
          await this.marketplaceApiClient.submitForReview(
            listing._id.toString(),
            seller._id.toString(),
          );

          listingId = listing._id.toString();
        }
      }
    }

    return {
      data: {
        attributes: {
          listingId,
          message: 'Published to marketplace',
          workflowId,
        },
        id: workflowId,
        type: 'workflow-publish',
      },
    } as unknown as JsonApiSingleResponse;
  }

  @Delete(':workflowId/publish')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async unpublishFromMarketplace(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      return returnNotFound(this.constructorName, workflowId);
    }

    const updated = await this.workflowsService.patch(workflowId, {
      isPublic: false,
    });

    return updated
      ? {
          data: {
            id: workflowId,
            message: 'Removed from marketplace',
          } as unknown as JsonApiResourceLike,
        }
      : returnNotFound(this.constructorName, workflowId);
  }

  // ===========================================================================
  // NEW WORKFLOW ENGINE ENDPOINTS
  // ===========================================================================

  @Post(':workflowId/execute/partial')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async executePartial(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: ExecutePartialDto,
    @CurrentUser() user: User,
  ): Promise<
    | JsonApiSingleResponse
    | { data: { runId: string; status: string; message: string } }
  > {
    try {
      const publicMetadata = getPublicMetadata(user);
      const result = await this.workflowsService.executePartial(
        workflowId,
        dto.nodeIds,
        publicMetadata.user,
        publicMetadata.organization,
        { dryRun: dto.dryRun, respectLocks: dto.respectLocks },
      );

      if (dto.dryRun) {
        return {
          data: result as { runId: string; status: string; message: string },
        };
      }

      return serializeSingle(request, WorkflowExecutionSerializer, result);
    } catch (error: unknown) {
      const message =
        (error as Error)?.message ?? 'Failed to execute partial workflow';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':workflowId/execute/resume/:runId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resumeExecution(
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @Body() _dto: ResumeExecutionDto,
    @CurrentUser() user: User,
  ): Promise<{ data: { runId: string; status: string; message: string } }> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const result = await this.workflowsService.resumeFromFailed(
        workflowId,
        runId,
        publicMetadata.user,
        publicMetadata.organization,
      );

      return { data: result };
    } catch (error: unknown) {
      const message =
        (error as Error)?.message ?? 'Failed to resume workflow execution';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':workflowId/credits-estimate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCreditsEstimate(
    @Param('workflowId') workflowId: string,
    @Query() query: CreditEstimateQueryDto,
    @CurrentUser() user: User,
  ): Promise<{ data: CreditEstimate }> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const estimate = await this.workflowsService.validateCredits(
        workflowId,
        publicMetadata.organization,
        query.nodeIds,
      );

      return { data: estimate };
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to estimate credits';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':workflowId/lifecycle/publish')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async publishWorkflowLifecycle(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const workflow = await this.workflowsService.publishWorkflowLifecycle(
        workflowId,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to publish workflow';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':workflowId/lifecycle/archive')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async archiveWorkflow(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const workflow = await this.workflowsService.archiveWorkflow(
        workflowId,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to archive workflow';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':workflowId/executions/:runId/logs')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getExecutionLogs(
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: unknown }> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const logs = await this.workflowsService.getExecutionLogs(
        workflowId,
        runId,
        publicMetadata.organization,
      );

      return { data: logs };
    } catch (error: unknown) {
      const message =
        (error as Error)?.message ?? 'Failed to get execution logs';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':workflowId/executions/:executionId/approve')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async submitApproval(
    @Param('workflowId') workflowId: string,
    @Param('executionId') executionId: string,
    @Body() dto: SubmitApprovalDto,
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      executionId: string;
      nodeId: string;
      status: 'approved' | 'rejected';
      approvedBy: string;
      approvedAt: string;
      rejectionReason?: string;
    };
  }> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const result =
        await this.workflowExecutorService.submitReviewGateApproval(
          workflowId,
          executionId,
          publicMetadata.user,
          publicMetadata.organization,
          dto.nodeId,
          dto.approved,
          dto.rejectionReason,
        );

      return { data: result };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message =
        (error as Error)?.message ?? 'Failed to submit workflow approval';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':workflowId/nodes/lock')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async lockNodes(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: LockNodesDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const workflow = await this.workflowsService.lockNodes(
        workflowId,
        dto.nodeIds,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to lock nodes';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':workflowId/nodes/unlock')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async unlockNodes(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: UnlockNodesDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const workflow = await this.workflowsService.unlockNodes(
        workflowId,
        dto.nodeIds,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to unlock nodes';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':workflowId/thumbnail')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async setThumbnail(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: SetThumbnailDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const workflow = await this.workflowsService.setThumbnail(
        workflowId,
        dto.thumbnailUrl,
        dto.nodeId,
        publicMetadata.user,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    } catch (error: unknown) {
      const message =
        (error as Error)?.message ?? 'Failed to set workflow thumbnail';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ===========================================================================
  // STANDARD CRUD ENDPOINTS
  // ===========================================================================

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createWorkflowDto: CreateWorkflowDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);

      const workflow = await this.workflowsService.createWorkflow(
        publicMetadata.user,
        publicMetadata.organization,
        createWorkflowDto,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to create workflow';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          organization: publicMetadata.organization,
          user: publicMetadata.user,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
      {
        $project: {
          comfyuiTemplate: 0,
          edges: 0,
          inputVariables: 0,
          metadata: 0,
          nodes: 0,
          steps: 0,
          webhookSecret: 0,
        },
      },
    ];

    const data: AggregatePaginateResult<WorkflowDocument> =
      await this.workflowsService.findAll(aggregate, options);
    return serializeCollection(request, WorkflowSerializer, data);
  }

  @Get('statistics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getStatistics(
    @CurrentUser() user: User,
  ): Promise<{ data: WorkflowStatistics }> {
    const publicMetadata = getPublicMetadata(user);
    const stats = await this.workflowsService.getWorkflowStatistics(
      publicMetadata.user,
      publicMetadata.organization,
    );

    return { data: stats };
  }

  // ===========================================================================
  // BATCH STATUS ENDPOINTS (must be before :workflowId to avoid route conflict)
  // ===========================================================================

  @Get('batch/:batchJobId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getBatchStatus(
    @Param('batchJobId') batchJobId: string,
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      _id: string;
      workflowId: string;
      status: string;
      totalCount: number;
      completedCount: number;
      failedCount: number;
      items: Array<{
        _id: string;
        ingredientId: string;
        status: string;
        executionId?: string;
        outputIngredientId?: string;
        outputCategory?: string;
        outputSummary?: {
          id: string;
          category: string;
          status?: string;
          ingredientUrl?: string;
          thumbnailUrl?: string;
        };
        error?: string;
        startedAt?: string;
        completedAt?: string;
      }>;
      createdAt?: string;
      updatedAt?: string;
    };
  }> {
    const publicMetadata = getPublicMetadata(user);

    const job = await this.batchWorkflowService.getBatchJobForOrg(
      batchJobId,
      publicMetadata.organization,
    );

    return {
      data: {
        _id: job._id.toString(),
        completedCount: job.completedCount,
        createdAt: job.createdAt?.toISOString(),
        failedCount: job.failedCount,
        items: job.items.map((item) => ({
          _id: item._id.toString(),
          completedAt: item.completedAt?.toISOString(),
          error: item.error,
          executionId: item.executionId,
          ingredientId: item.ingredientId.toString(),
          outputCategory: item.outputCategory,
          outputIngredientId: item.outputIngredientId?.toString(),
          outputSummary: item.outputSummary
            ? {
                category: item.outputSummary.category,
                id: item.outputSummary.id,
                ingredientUrl: item.outputSummary.ingredientUrl,
                status: item.outputSummary.status,
                thumbnailUrl: item.outputSummary.thumbnailUrl,
              }
            : undefined,
          startedAt: item.startedAt?.toISOString(),
          status: item.status,
        })),
        status: job.status,
        totalCount: job.totalCount,
        updatedAt: job.updatedAt?.toISOString(),
        workflowId: job.workflowId.toString(),
      },
    };
  }

  @Get('batch')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listBatchJobs(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{
    data: Array<{
      _id: string;
      workflowId: string;
      status: string;
      totalCount: number;
      completedCount: number;
      failedCount: number;
      createdAt?: string;
    }>;
  }> {
    const publicMetadata = getPublicMetadata(user);
    const jobs = await this.batchWorkflowService.listBatchJobs(
      publicMetadata.organization,
      limit ? Number.parseInt(limit, 10) : 20,
      offset ? Number.parseInt(offset, 10) : 0,
    );

    return {
      data: jobs.map((job) => ({
        _id: job._id.toString(),
        completedCount: job.completedCount,
        createdAt: job.createdAt?.toISOString(),
        failedCount: job.failedCount,
        status: job.status,
        totalCount: job.totalCount,
        workflowId: job.workflowId.toString(),
      })),
    };
  }

  @Get(':workflowId/export-comfyui')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async exportComfyUI(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: Record<string, unknown> | null }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    const template = (workflow as WorkflowDocument).comfyuiTemplate;
    if (!template) {
      throw new HttpException(
        'This workflow does not have a ComfyUI template',
        HttpStatus.NOT_FOUND,
      );
    }

    return { data: template };
  }

  @Get(':workflowId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    return workflow
      ? serializeSingle(request, WorkflowSerializer, workflow)
      : returnNotFound(this.constructorName, workflowId);
  }

  @Post(':workflowId/clone')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cloneWorkflow(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);

      const clonedWorkflow = await this.workflowsService.cloneWorkflow(
        workflowId,
        publicMetadata.user,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, clonedWorkflow);
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to clone workflow';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':workflowId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      return returnNotFound(this.constructorName, workflowId);
    }

    const data = await this.workflowsService.patch(
      workflowId,
      updateWorkflowDto,
    );

    return data
      ? serializeSingle(request, WorkflowSerializer, data)
      : returnNotFound(this.constructorName, workflowId);
  }

  @Delete(':workflowId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      return returnNotFound(this.constructorName, workflowId);
    }

    const data = await this.workflowsService.remove(workflowId);
    return data
      ? serializeSingle(request, WorkflowSerializer, data)
      : returnNotFound(this.constructorName, workflowId);
  }

  // ===========================================================================
  // WEBHOOK TRIGGER ENDPOINTS
  // ===========================================================================

  @Post(':workflowId/webhook')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateWebhook(
    @Param('workflowId') workflowId: string,
    @Body() body: { authType?: 'none' | 'secret' | 'bearer' },
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      webhookId: string;
      webhookUrl: string;
      webhookSecret: string | null;
      authType: 'none' | 'secret' | 'bearer';
    };
  }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    const result = await this.workflowsService.generateWebhook(
      workflowId,
      body.authType || 'secret',
    );

    return { data: result };
  }

  @Post(':workflowId/webhook/regenerate-secret')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async regenerateWebhookSecret(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: { webhookSecret: string } }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    if (!workflow.webhookId) {
      throw new HttpException(
        'Webhook not configured for this workflow',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result =
      await this.workflowsService.regenerateWebhookSecret(workflowId);
    return { data: result };
  }

  @Delete(':workflowId/webhook')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async deleteWebhook(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: { message: string } }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    await this.workflowsService.deleteWebhook(workflowId);
    return { data: { message: 'Webhook deleted' } };
  }

  @Get(':workflowId/webhook')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getWebhookInfo(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      webhookId: string | null;
      webhookUrl: string | null;
      authType: 'none' | 'secret' | 'bearer';
      triggerCount: number;
      lastTriggeredAt: Date | null;
    };
  }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!workflow) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    const baseUrl = process.env.API_URL || 'https://api.genfeed.ai';

    return {
      data: {
        authType: workflow.webhookAuthType || 'secret',
        lastTriggeredAt: workflow.webhookLastTriggeredAt || null,
        triggerCount: workflow.webhookTriggerCount || 0,
        webhookId: workflow.webhookId || null,
        webhookUrl: workflow.webhookId
          ? `${baseUrl}/v1/webhooks/${workflow.webhookId}`
          : null,
      },
    };
  }

  // ===========================================================================
  // BATCH WORKFLOW EXECUTION
  // ===========================================================================

  @Post(':workflowId/batch')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async runBatch(
    @Param('workflowId') workflowId: string,
    @Body() body: { ingredientIds: string[] },
    @CurrentUser() user: User,
  ): Promise<{ data: { batchJobId: string; totalCount: number } }> {
    const publicMetadata = getPublicMetadata(user);

    // Validate workflow exists and belongs to org
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!workflow) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    if (!body.ingredientIds?.length) {
      throw new HttpException(
        'At least one ingredientId is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Create the batch job
    const batchJob = await this.batchWorkflowService.createBatchJob({
      ingredientIds: body.ingredientIds,
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
      workflowId,
    });

    // Mark as processing
    await this.batchWorkflowService.markProcessing(batchJob._id.toString());

    // Enqueue all items
    const itemJobs = batchJob.items.map((item) => ({
      batchJobId: batchJob._id.toString(),
      ingredientId: item.ingredientId.toString(),
      itemId: item._id.toString(),
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
      workflowId,
    }));

    await this.batchWorkflowQueueService.enqueueBatchItems(itemJobs);

    return {
      data: {
        batchJobId: batchJob._id.toString(),
        totalCount: batchJob.totalCount,
      },
    };
  }
}
