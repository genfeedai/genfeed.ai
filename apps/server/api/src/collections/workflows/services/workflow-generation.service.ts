import {
  type CoreWorkflowFormat,
  WorkflowFormatConverterService,
} from '@api/collections/workflows/services/workflow-format-converter.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  getDefaultModel,
  OpenRouterModelTier,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import {
  buildWorkflowGenerationMessages,
  buildWorkflowGenerationNodeTypes,
  WORKFLOW_GENERATION_SCHEMA_NAME,
  workflowGenerationSchema,
} from '@genfeedai/workflows/generation';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface GenerateWorkflowParams {
  description: string;
  targetPlatforms?: string[];
}

@Injectable()
export class WorkflowGenerationService {
  constructor(
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly workflowFormatConverter: WorkflowFormatConverterService,
  ) {}

  async generateWorkflowFromDescription(
    params: GenerateWorkflowParams,
  ): Promise<{
    tokensUsed: number;
    workflow: Record<string, unknown>;
  }> {
    // A repair turn is a second billed call, so usage is summed across every
    // attempt rather than read off the last one.
    let tokensUsed = 0;

    const generated = await this.llmDispatcherService.completeStructured({
      max_tokens: 4000,
      messages: buildWorkflowGenerationMessages({
        availableNodeTypes: buildWorkflowGenerationNodeTypes(),
        description: params.description,
        targetPlatforms: params.targetPlatforms,
      }),
      model: getDefaultModel(OpenRouterModelTier.STANDARD),
      onAttempt: (response) => {
        tokensUsed += response.usage?.total_tokens ?? 0;
      },
      schema: workflowGenerationSchema,
      schemaName: WORKFLOW_GENERATION_SCHEMA_NAME,
      temperature: 0.3,
    });

    try {
      const converted = this.workflowFormatConverter.ensureCloudFormat(
        generated as unknown as CoreWorkflowFormat,
      );

      return {
        tokensUsed,
        workflow: {
          ...generated,
          edges: converted.workflow.edges,
          nodes: converted.workflow.nodes,
        },
      };
    } catch {
      throw new HttpException(
        'Generated workflow could not be converted to the cloud format',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
