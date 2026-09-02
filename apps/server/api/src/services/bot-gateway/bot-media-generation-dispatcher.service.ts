import { AgentGenerationGatewayService } from '@api/services/agent-generation-gateway/agent-generation-gateway.service';
import type { AgentGenerationInput } from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import type { BotMediaGenerationDispatcher } from '@api/services/bot-gateway/services/bot-media-generation-dispatcher.interface';
import { ActivitySource, BotCommandType } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

/**
 * Bot slash-command media generation.
 *
 * Runs through the shared in-process generation gateway, so a bot command is
 * enforced and settled by exactly the same code path as `POST /v1/images` and
 * `POST /v1/videos`. Only the credit ledger label differs, so bot spend stays
 * distinguishable in cost reporting.
 */
@Injectable()
export class BotMediaGenerationDispatcherService
  implements BotMediaGenerationDispatcher
{
  constructor(
    private readonly generationGateway: AgentGenerationGatewayService,
  ) {}

  async generate(
    input: Parameters<BotMediaGenerationDispatcher['generate']>[0],
  ): Promise<{ ingredientId: string }> {
    const generationInput: AgentGenerationInput = {
      body: {
        brandId: input.user.brandId,
        brandingMode: 'brand',
        isBrandingEnabled: true,
        outputs: 1,
        text: input.prompt,
        waitForCompletion: false,
      },
      creditsAttribution: {
        description: 'Bot media generation',
        source: ActivitySource.BOT_GENERATION,
      },
      onPlaceholderCreated: input.onPlaceholderCreated,
      principal: {
        brandId: input.user.brandId,
        organizationId: input.user.organizationId,
        userId: input.user.userId,
      },
    };

    let response: JsonApiSingleResponse;
    switch (input.command) {
      case BotCommandType.PROMPT_IMAGE:
        response = await this.generationGateway.generateImage(generationInput);
        break;
      case BotCommandType.PROMPT_VIDEO:
        response = await this.generationGateway.generateVideo(generationInput);
        break;
      default:
        throw new BadRequestException('Unsupported bot generation command');
    }

    return { ingredientId: this.readIngredientId(response) };
  }

  private readIngredientId(response: JsonApiSingleResponse): string {
    const ingredientId = response.data?.id;
    if (!ingredientId) {
      throw new InternalServerErrorException(
        'Bot generation did not return a durable Ingredient ID',
      );
    }
    return ingredientId;
  }
}
