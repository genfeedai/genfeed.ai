import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  type GeneratedPrompt,
  type GeneratePromptsRequest,
  PromptGeneratorService,
} from '@services/content/prompt-generator.service';
import {
  clearRequestOrganizationId,
  HTTPBaseService,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import axios, { type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/helpers/ui/modal/modal.helper');

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
  },
}));

const generated: GeneratedPrompt[] = [
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

const request: GeneratePromptsRequest = {
  count: 1,
  input: 'base prompt',
  mode: 'idea',
  targetMedia: 'image',
};

const adapter = vi.fn<AxiosAdapter>(async (config) => ({
  config,
  data: generated,
  headers: {},
  status: 200,
  statusText: 'OK',
}));

describe('PromptGeneratorService', () => {
  const token = 'prompt-token';

  beforeEach(() => {
    HTTPBaseService.clearAllInstances();
    const create = axios.create.bind(axios);
    vi.spyOn(axios, 'create').mockImplementation((config) =>
      create({ ...config, adapter }),
    );
  });

  afterEach(() => {
    clearRequestOrganizationId();
    vi.restoreAllMocks();
    adapter.mockClear();
  });

  it('caches instances by token', () => {
    const first = PromptGeneratorService.getInstance(token);

    expect(PromptGeneratorService.getInstance(token)).toBe(first);
    expect(PromptGeneratorService.getInstance('other-token')).not.toBe(first);
  });

  it('posts to /optimizers/prompts with auth and the abort signal', async () => {
    const controller = new AbortController();

    const result = await new PromptGeneratorService(token).generatePrompts(
      request,
      controller.signal,
    );

    const config = adapter.mock.calls[0]?.[0];
    expect(config?.baseURL).toBe('https://api.test.com/optimizers');
    expect(config?.url).toBe('/prompts');
    expect(config?.method).toBe('post');
    expect(JSON.parse(String(config?.data))).toEqual(request);
    expect(config?.headers.Authorization).toBe(`Bearer ${token}`);
    expect(result).toEqual(generated);
    controller.abort();
    expect((config?.signal as AbortSignal | undefined)?.aborted).toBe(true);
  });

  it('sends the routed organization header', async () => {
    setRequestOrganizationId('org-a');

    await new PromptGeneratorService(token).generatePrompts(request);

    expect(
      adapter.mock.calls[0]?.[0].headers[ORGANIZATION_CONTEXT_HEADER],
    ).toBe('org-a');
  });
});
