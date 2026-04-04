import { UNIFIED_NODE_REGISTRY as NODE_REGISTRY } from '@api/collections/workflows/registry/node-registry-adapter';
import {
  getDefaultModel,
  OpenRouterModelTier,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
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

    const platformConstraint = params.targetPlatforms?.length
      ? `The workflow should target these platforms: ${params.targetPlatforms.join(', ')}.`
      : '';

    const systemPrompt = [
      'You are a workflow generator for a visual content creation platform.',
      'Given a natural language description, generate a valid workflow JSON.',
      '',
      'Available node types:',
      JSON.stringify(availableNodeTypes, null, 2),
      '',
      'Output a JSON object with this structure:',
      '{',
      '  "name": "string - workflow name",',
      '  "description": "string - workflow description",',
      '  "nodes": [{ "id": "string", "type": "string (from available types)", "position": { "x": number, "y": number }, "data": { "label": "string", "config": {} } }],',
      '  "edges": [{ "id": "string", "source": "node-id", "target": "node-id", "sourceHandle": "output-key", "targetHandle": "input-key" }]',
      '}',
      '',
      'Rules:',
      '- Only use node types from the available list above.',
      '- Connect nodes via edges using valid input/output handles.',
      '- Position nodes in a left-to-right flow with ~250px horizontal spacing.',
      '- Return ONLY the JSON object, no markdown fences or explanation.',
      platformConstraint,
    ].join('\n');

    const model = getDefaultModel(OpenRouterModelTier.STANDARD);
    const response = await this.openRouterService.chatCompletion({
      max_tokens: 4000,
      messages: [
        { content: systemPrompt, role: 'system' },
        { content: params.description, role: 'user' },
      ],
      model,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const tokensUsed = response.usage?.total_tokens ?? 0;

    try {
      return {
        tokensUsed,
        workflow: JSON.parse(raw) as Record<string, unknown>,
      };
    } catch {
      throw new HttpException(
        'Failed to parse generated workflow JSON',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
