import type { AxiosInstance } from 'axios';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
  },
}));

import {
  type GeneratedPrompt,
  type GeneratePromptsRequest,
  PromptGeneratorService,
} from '@services/content/prompt-generator.service';

type PromptGeneratorServiceClass = typeof PromptGeneratorService & {
  instances: Map<string, PromptGeneratorService>;
};

type MockFn = ReturnType<typeof vi.fn>;

const mockCreate = vi.mocked(axios.create);

const createInstance = (postMock: MockFn): AxiosInstance =>
  ({
    post: postMock,
  }) as AxiosInstance;

describe('PromptGeneratorService', () => {
  const token = 'prompt-token';

  beforeEach(() => {
    vi.clearAllMocks();
    (
      PromptGeneratorService as unknown as PromptGeneratorServiceClass
    ).instances.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes axios with base url and auth header', () => {
    const postMock = vi.fn();
    mockCreate.mockReturnValue(createInstance(postMock));

    new PromptGeneratorService(token);

    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: 'https://api.test.com/optimizers',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  });

  it('caches instances by token', () => {
    const postMock = vi.fn();
    mockCreate.mockReturnValue(createInstance(postMock));

    const first = PromptGeneratorService.getInstance(token);
    const second = PromptGeneratorService.getInstance(token);
    const other = PromptGeneratorService.getInstance('other-token');

    expect(first).toBe(second);
    expect(other).not.toBe(first);
  });

  it('generates prompts with optional abort signal', async () => {
    const postMock = vi.fn();
    const response: GeneratedPrompt[] = [
      {
        camera: '35mm',
        format: 'square',
        id: 'prompt-1',
        lighting: 'soft',
        mood: 'calm',
        style: 'cinematic',
        text: 'Generate a scene',
      },
    ];

    postMock.mockResolvedValue({ data: response });
    mockCreate.mockReturnValue(createInstance(postMock));

    const service = new PromptGeneratorService(token);
    const controller = new AbortController();
    const request: GeneratePromptsRequest = {
      count: 1,
      input: 'base prompt',
      mode: 'idea',
      targetMedia: 'image',
    };
    const result = await service.generatePrompts(request, controller.signal);

    expect(postMock).toHaveBeenCalledWith('/prompts', request, {
      signal: controller.signal,
    });
    expect(result).toEqual(response);
  });
});
