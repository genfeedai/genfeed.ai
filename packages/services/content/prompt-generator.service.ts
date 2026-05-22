import type {
  GeneratedPrompt,
  GeneratePromptsRequest,
} from '@genfeedai/props/studio/prompt-generator.props';
import { EnvironmentService } from '@services/core/environment.service';
import { ServiceInstanceManager } from '@services/core/service-instance-manager';
import axios, { type AxiosInstance } from 'axios';

const promptGeneratorInstances =
  new ServiceInstanceManager<PromptGeneratorService>();

/**
 * Service for generating creative prompts using AI
 * Calls POST /optimizers/prompts endpoint
 */
export class PromptGeneratorService {
  private instance: AxiosInstance;

  constructor(token: string) {
    this.instance = axios.create({
      baseURL: `${EnvironmentService.apiEndpoint}/optimizers`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  static getInstance(token: string): PromptGeneratorService {
    const cached = promptGeneratorInstances.get(PromptGeneratorService, token);
    if (cached) {
      return cached;
    }

    const instance = new PromptGeneratorService(token);
    promptGeneratorInstances.set(PromptGeneratorService, token, instance);
    return instance;
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
