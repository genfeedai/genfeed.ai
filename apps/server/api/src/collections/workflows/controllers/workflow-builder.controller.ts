import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import {
  GenerateWorkflowDto,
  ImportWorkflowDto,
} from '@api/collections/workflows/dto/execute-workflow.dto';
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
import type { WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import {
  type CloudWorkflowFormat,
  type CoreWorkflowFormat,
  WorkflowFormatConverterService,
} from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { WorkflowValidator } from '@api/collections/workflows/validators/workflow.validator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { wrapError } from '@api/helpers/utils/controller/wrap-error.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WorkflowTrigger } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { WorkflowSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Visual-builder + AI authoring endpoints for workflows: node registry lookups,
 * connection validation, AI generation/import, and the per-workflow interface /
 * validation helpers. Split out of the former monolithic `WorkflowsController`.
 */
@AutoSwagger()
@Controller('workflows')
export class WorkflowBuilderController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowGenerationService: WorkflowGenerationService,
    private readonly formatConverterService: WorkflowFormatConverterService,
    readonly _loggerService: LoggerService,
  ) {}

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
    return wrapError(async () => {
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
    }, 'Failed to generate workflow');
  }

  @Post('import')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importWorkflow(
    @Req() request: Request,
    @Body() dto: ImportWorkflowDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
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
          organization: publicMetadata.organization,
          trigger: WorkflowTrigger.MANUAL,
          user: publicMetadata.user,
        } as unknown as CreateWorkflowDto,
        publicMetadata.brand || undefined,
      );

      return serializeSingle(request, WorkflowSerializer, created);
    }, 'Failed to import workflow');
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
    const workflow = await this.workflowsService.findOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
    });

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
    const workflow = await this.workflowsService.findOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
    });

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
    const workflow = await this.workflowsService.findOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    const result = WorkflowValidator.validate({
      edges: workflow.edges,
      nodes: workflow.nodes as unknown as WorkflowVisualNode[],
    });

    return { data: result };
  }
}
