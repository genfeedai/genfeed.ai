import {
  type CoreWorkflowFormat,
  WorkflowFormatConverterService,
} from '@api/collections/workflows/services/workflow-format-converter.service';
import {
  getDefaultModel,
  OpenRouterModelTier,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import {
  buildWorkflowGenerationMessages,
  buildWorkflowGenerationNodeTypes,
  parseWorkflowGenerationResponse,
} from '@genfeedai/workflows/generation';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface GenerateWorkflowParams {
  description: string;
  targetPlatforms?: string[];
}

@Injectable()
export class WorkflowGenerationService {
  constructor(
    private readonly openRouterService: OpenRouterService,
    private readonly workflowFormatConverter: WorkflowFormatConverterService,
  ) {}

  async generateWorkflowFromDescription(
    params: GenerateWorkflowParams,
  ): Promise<{
    tokensUsed: number;
    workflow: Record<string, unknown>;
  }> {
    const availableNodeTypes = buildWorkflowGenerationNodeTypes();

    const model = getDefaultModel(OpenRouterModelTier.STANDARD);
    const response = await this.openRouterService.chatCompletion({
      max_tokens: 4000,
      messages: buildWorkflowGenerationMessages({
        availableNodeTypes,
        description: params.description,
        targetPlatforms: params.targetPlatforms,
      }),
      model,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const tokensUsed = response.usage?.total_tokens ?? 0;

    try {
      const generated = parseWorkflowGenerationResponse(raw).workflow;
      if (!Array.isArray(generated.nodes) || !Array.isArray(generated.edges)) {
        throw new Error('Generated workflow has no graph');
      }
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
        'Failed to parse generated workflow JSON',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
