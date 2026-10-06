import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { AgentGenerationCostToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-cost-tool-handler.service';
import { AgentGenerationSettingsToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-settings-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { MEDIA_GENERATION_TYPES } from '@genfeedai/actions';
import type {
  AgentToolResult,
  CallableGenerationModelType,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

const GENERATION_OPTION_TYPES: readonly string[] = [
  ...MEDIA_GENERATION_TYPES,
  'image-edit',
];

function isCallableType(type: string): type is CallableGenerationModelType {
  return (
    type === 'image' ||
    type === 'image-edit' ||
    type === 'video' ||
    type === 'voice' ||
    type === 'music'
  );
}

/**
 * `get_generation_options` reads what generation can do now: the account's
 * callable model keys always, the effective settings always, and the Studio
 * credit estimate plus balance when a `type` is given.
 */
@Injectable()
export class AgentGenerationOptionsToolHandler {
  constructor(
    private readonly settings: AgentGenerationSettingsToolHandler,
    private readonly cost: AgentGenerationCostToolHandler,
    private readonly models: ModelRegistrationService,
  ) {}

  async execute(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const { type } = params;
    if (
      type !== undefined &&
      type !== null &&
      (typeof type !== 'string' || !GENERATION_OPTION_TYPES.includes(type))
    ) {
      throw new BadRequestException(
        `type must be one of: ${GENERATION_OPTION_TYPES.join(', ')}`,
      );
    }

    const category =
      typeof type === 'string' && isCallableType(type) ? type : undefined;
    const [settings, callableModels] = await Promise.all([
      this.settings.get(params, ctx),
      this.models.listCallableGenerationModels(ctx.organizationId, category),
    ]);
    if (type === undefined || type === null) {
      return {
        creditsUsed: 0,
        data: { models: callableModels, settings: settings.data },
        success: true,
      };
    }

    const cost = await this.cost.execute(params, ctx);
    return {
      creditsUsed: 0,
      data: {
        cost: cost.data,
        models: callableModels,
        settings: settings.data,
      },
      success: true,
    };
  }
}
