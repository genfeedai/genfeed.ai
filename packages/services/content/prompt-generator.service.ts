import type {
  GeneratedPrompt,
  GeneratePromptsRequest,
} from '@genfeedai/props/studio/prompt-generator.props';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/**
 * Service for generating creative prompts using AI
 * Calls POST /optimizers/prompts endpoint
 */
export class PromptGeneratorService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/optimizers`, token);
  }

  static getInstance(token: string): PromptGeneratorService {
    return HTTPBaseService.getBaseServiceInstance(
      PromptGeneratorService,
      token,
    );
  }

  /**
   * Generate creative prompts from an idea or variations of an existing prompt
   * @param params - The generation request parameters
   * @param signal - Optional AbortSignal for cancellation
   * @returns Array of generated prompts with full visual configs
   */
  async generatePrompts(
    params: GeneratePromptsRequest,
    signal?: AbortSignal,
  ): Promise<GeneratedPrompt[]> {
    const response = await this.instance.post<GeneratedPrompt[]>(
      '/prompts',
      params,
      { signal },
    );
    return response.data;
  }
}
