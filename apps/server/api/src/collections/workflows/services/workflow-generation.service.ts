import { UNIFIED_NODE_REGISTRY as NODE_REGISTRY } from '@api/collections/workflows/registry/node-registry-adapter';
import {
  getDefaultModel,
  OpenRouterModelTier,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import {
  buildWorkflowGenerationMessages,
  parseWorkflowGenerationResponse,
} from '@genfeedai/workflows';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface GenerateWorkflowParams {
  description: string;
  targetPlatforms?: string[];
}

@Injectable()
export class WorkflowGenerationService {
  constructor(private readonly openRouterService: OpenRouterService) {}

  async generateWorkflowFromDescription(
    params: GenerateWorkflowParams,
  ): Promise<{
    tokensUsed: number;
    workflow: Record<string, unknown>;
  }> {
    const availableNodeTypes = Object.entries(NODE_REGISTRY)
      .filter(([, def]) => def.isEnabled !== false)
      .map(([key, def]) => ({
        category: def.category,
        description: def.description,
        inputs: Object.keys(def.inputs),
        outputs: Object.keys(def.outputs),
        type: key,
      }));

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
      return {
        tokensUsed,
        workflow: parseWorkflowGenerationResponse(raw).workflow,
      };
    } catch {
      throw new HttpException(
        'Failed to parse generated workflow JSON',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
