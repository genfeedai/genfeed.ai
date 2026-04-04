import type {
  GeneratedPrompt,
  GeneratePromptsRequest,
} from '@props/studio/prompt-generator.props';
import { EnvironmentService } from '@services/core/environment.service';
import axios, { type AxiosInstance } from 'axios';

/**
 * Service for generating creative prompts using AI
 * Calls POST /optimizers/prompts endpoint
 */
export class PromptGeneratorService {
  private static instances = new Map<string, PromptGeneratorService>();
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
    if (!PromptGeneratorService.instances.has(token)) {
      PromptGeneratorService.instances.set(
        token,
        new PromptGeneratorService(token),
      );
    }
    return PromptGeneratorService.instances.get(token)!;
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
