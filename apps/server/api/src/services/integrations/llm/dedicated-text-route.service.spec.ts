import type { ServerCustomerInstanceResolver } from '@api/server.dependencies';
import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { ModelProvider } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DedicatedTextRouteService } from './dedicated-text-route.service';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('axios', () => ({ default: { post } }));

interface OwnedModel {
  externalId?: string | null;
  key: string;
  organizationId: string;
  provider: string;
}

describe('DedicatedTextRouteService', () => {
  let models: OwnedModel[];
  let instances: Array<{
    apiUrl: string;
    organizationId: string;
    role: string;
  }>;
  let service: DedicatedTextRouteService;

  beforeEach(() => {
    post.mockReset();
    models = [
      {
        externalId: 'org-model-8b',
        key: 'dedicated/org-model',
        organizationId: 'org-a',
        provider: ModelProvider.GENFEED_AI,
      },
      {
        key: 'hosted/other',
        organizationId: 'org-a',
        provider: ModelProvider.OPENROUTER,
      },
    ];
    instances = [
      {
        apiUrl: 'https://llm.org-a.example.com',
        organizationId: 'org-a',
        role: 'llm',
      },
    ];
    const registry = {
      findOrganizationModel: async (key: string, organizationId?: string) =>
        models.find(
          (model) =>
            model.key === key && model.organizationId === organizationId,
        ),
    } as unknown as AgentChatModelRegistryService;
    const resolver: ServerCustomerInstanceResolver = {
      findRunningForOrg: async (organizationId, role) =>
        instances.find(
          (instance) =>
            instance.organizationId === organizationId &&
            instance.role === role,
        ) ?? null,
    };
    service = new DedicatedTextRouteService(
      { error: vi.fn() } as unknown as LoggerService,
      registry,
      resolver,
    );
  });

  describe('resolve', () => {
    it('routes the owner of a Genfeed AI text model to its llm instance', async () => {
      await expect(
        service.resolve('org-a', 'dedicated/org-model'),
      ).resolves.toEqual({
        apiUrl: 'https://llm.org-a.example.com',
        upstreamModel: 'org-model-8b',
      });
    });

    it('does not route another organization, a platform model or a hosted-provider row', async () => {
      await expect(
        service.resolve('org-b', 'dedicated/org-model'),
      ).resolves.toBeNull();
      await expect(
        service.resolve(undefined, 'dedicated/org-model'),
      ).resolves.toBeNull();
      await expect(
        service.resolve('org-a', 'anthropic/claude'),
      ).resolves.toBeNull();
      await expect(
        service.resolve('org-a', 'hosted/other'),
      ).resolves.toBeNull();
    });

    it('fails closed with a 503 when the organization has no running llm instance', async () => {
      instances = [];

      await expect(
        service.resolve('org-a', 'dedicated/org-model'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('never uses a media instance for text', async () => {
      instances = [
        {
          apiUrl: 'https://media.org-a.example.com',
          organizationId: 'org-a',
          role: 'videos',
        },
      ];

      await expect(
        service.resolve('org-a', 'dedicated/org-model'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('names the model by its key when it has no external name', async () => {
      models[0].externalId = null;

      await expect(
        service.resolve('org-a', 'dedicated/org-model'),
      ).resolves.toMatchObject({ upstreamModel: 'dedicated/org-model' });
    });
  });

  describe('chatCompletion', () => {
    const route = {
      apiUrl: 'https://llm.org-a.example.com',
      upstreamModel: 'org-model-8b',
    };
    const params = {
      messages: [{ content: 'hi', role: 'user' as const }],
      model: 'dedicated/org-model',
    };
    const choices = [
      {
        finish_reason: 'stop',
        message: { content: 'hello', role: 'assistant' },
      },
    ];

    it('asks the instance for the upstream model without streaming', async () => {
      post.mockResolvedValue({
        data: {
          choices,
          usage: { completion_tokens: 2, prompt_tokens: 3 },
        },
      });

      await service.chatCompletion(route, params);

      const [url, body] = post.mock.calls[0];
      expect(url).toBe('https://llm.org-a.example.com/v1/chat/completions');
      expect(body).toMatchObject({ model: 'org-model-8b', stream: false });
    });

    it('answers under the catalogue key with usage the instance cannot price itself', async () => {
      post.mockResolvedValue({
        data: {
          choices,
          id: 'abc',
          model: 'whatever-the-instance-calls-it',
          usage: {
            completion_tokens: 2,
            cost: 0,
            is_byok: true,
            prompt_tokens: 3,
            total_tokens: 999,
          },
        },
      });

      const response = await service.chatCompletion(route, params);

      expect(response.model).toBe('dedicated/org-model');
      expect(response.usage).toEqual({
        completion_tokens: 2,
        prompt_tokens: 3,
        total_tokens: 5,
      });
    });

    it.each([
      ['no usage', { choices }],
      [
        'no choices',
        { choices: [], usage: { completion_tokens: 1, prompt_tokens: 1 } },
      ],
      [
        'negative usage',
        { choices, usage: { completion_tokens: -1, prompt_tokens: 1 } },
      ],
      [
        'non-numeric usage',
        { choices, usage: { completion_tokens: 'x', prompt_tokens: 1 } },
      ],
      ['an empty body', null],
    ])(
      'refuses an answer with %s instead of settling it at zero',
      async (_name, data) => {
        post.mockResolvedValue({ data });

        await expect(
          service.chatCompletion(route, params),
        ).rejects.toBeInstanceOf(BadGatewayException);
      },
    );

    it('refuses an instance address that points at a private host', async () => {
      await expect(
        service.chatCompletion(
          { apiUrl: 'https://localhost', upstreamModel: 'x' },
          params,
        ),
      ).rejects.toThrow();
      expect(post).not.toHaveBeenCalled();
    });
  });
});
