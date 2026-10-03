import { AgentGenerationCostToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-cost-tool-handler.service';
import { AgentGenerationSettingsToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-settings-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { MEDIA_GENERATION_TYPES } from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

const GENERATION_OPTION_TYPES: readonly string[] = [
  ...MEDIA_GENERATION_TYPES,
  'image-edit',
];

/**
 * `get_generation_options` reads one answer to "what can generation do now":
 * the effective settings always, and the Studio credit estimate plus balance
 * when a `type` is given. It owns no logic of its own; both halves come from
 * the handlers that previously served the two separate tools.
 */
@Injectable()
export class AgentGenerationOptionsToolHandler {
  constructor(
    private readonly settings: AgentGenerationSettingsToolHandler,
    private readonly cost: AgentGenerationCostToolHandler,
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

    const settings = await this.settings.get(params, ctx);
    if (type === undefined || type === null) {
      return {
        creditsUsed: 0,
        data: { settings: settings.data },
        success: true,
      };
    }

    const cost = await this.cost.execute(params, ctx);
    return {
      creditsUsed: 0,
      data: { cost: cost.data, settings: settings.data },
      success: true,
    };
  }
}
