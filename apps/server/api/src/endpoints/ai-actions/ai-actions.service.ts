import { ExecuteAiActionDto } from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { AI_ACTION_PROMPTS } from '@api/endpoints/ai-actions/prompts/action-prompts';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { ByokService } from '@api/services/byok/byok.service';
import { getDefaultModel } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface AiActionResult {
  result: string;
  tokensUsed: number;
  isByok: boolean;
}

@Injectable()
export class AiActionsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly openRouterService: OpenRouterService,
    private readonly byokService: ByokService,
    private readonly loggerService: LoggerService,
  ) {}

  private async getByokApiKey(orgId: string): Promise<string | undefined> {
    const resolved = await this.byokService.resolveApiKey(
      orgId,
      ByokProvider.OPENROUTER,
    );
    return resolved?.apiKey;
  }

  async execute(
    orgId: string,
    dto: ExecuteAiActionDto,
  ): Promise<AiActionResult> {
    const promptConfig = AI_ACTION_PROMPTS[dto.action];

    if (!promptConfig) {
      throw new BadRequestException(`Unknown action type: ${dto.action}`);
    }

    let systemPrompt = promptConfig.systemPrompt;

    if (dto.context) {
      for (const [key, value] of Object.entries(dto.context)) {
        systemPrompt = systemPrompt.replace(`{{${key}}}`, value);
      }
    }

    // Prepend brand voice/identity to system prompt
    const brandContext = await this.contextAssemblyService.assembleContext({
      layers: { brandGuidance: true, brandIdentity: true },
      organizationId: orgId,
    });
    if (brandContext) {
      const brandPreamble = this.contextAssemblyService.buildSystemPrompt(
        '',
        brandContext,
      );
      systemPrompt = `${brandPreamble}\n\n${systemPrompt}`;
    }

    const model = getDefaultModel(promptConfig.modelTier);
    const byokApiKey = await this.getByokApiKey(orgId);

    try {
      const response = await this.openRouterService.chatCompletion(
        {
          max_tokens: 2000,
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: dto.content, role: 'user' },
          ],
          model,
          temperature: 0.7,
        },
        byokApiKey,
      );

      const resultText = response.choices[0]?.message?.content ?? '';
      const tokensUsed = response.usage?.total_tokens ?? 0;

      return {
        isByok: !!byokApiKey,
        result: resultText.trim(),
        tokensUsed,
      };
    } catch (error: unknown) {
      const errorRecord = error as {
        message?: string;
        response?: {
          status?: number;
          statusText?: string;
        };
      };

      this.loggerService.error(
        `${this.constructorName}.execute failed for org=${orgId} action=${dto.action}`,
        {
          message: errorRecord?.message ?? 'Unknown error',
          status: errorRecord?.response?.status,
          statusText: errorRecord?.response?.statusText,
        },
      );
      throw error;
    }
  }
}
