import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentStudioHandoffController } from '@api/services/agent-orchestrator/agent-studio-handoff.controller';
import { AgentStudioHandoffService } from '@api/services/agent-orchestrator/agent-studio-handoff.service';
import type { AgentStudioHandoffIdentityService } from '@api/services/agent-orchestrator/agent-studio-handoff-identity.service';
import type { CreateAgentStudioHandoffDto } from '@api/services/agent-orchestrator/dto/create-agent-studio-handoff.dto';
import type { CacheService } from '@api/services/cache/cache.service';
import type {
  AgentStudioHandoffPayload,
  AgentStudioHandoffScope,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

/** In-memory stand-in for the Redis cache the real handoff service writes. */
function createCache() {
  const entries = new Map<string, { ttl?: number; value: unknown }>();
  const cache = {
    generateKey: (namespace: string, ...parts: (string | number)[]) =>
      [namespace, ...parts].join(':'),
    getdel: async (key: string) => {
      const entry = entries.get(key);
      entries.delete(key);
      return entry?.value ?? null;
    },
    set: async (key: string, value: unknown, options?: { ttl?: number }) => {
      entries.set(key, { ttl: options?.ttl, value });
      return true;
    },
  };
  return { cache: cache as unknown as CacheService, entries };
}

const userFor = (organizationId: string, userId: string) =>
  ({
    brandId: 'brand-1',
    id: userId,
    organizationId,
    userId,
  }) as AuthenticatedUser;

const owner = userFor('org-1', 'user-1');

function setup(
  resolveIdentity: (
    scope: AgentStudioHandoffScope,
    payload: AgentStudioHandoffPayload,
  ) => AgentStudioHandoffPayload = (_scope, payload) => payload,
) {
  const { cache, entries } = createCache();
  const identityScopes: AgentStudioHandoffScope[] = [];
  const identityService = {
    attachIdentity: async (
      scope: AgentStudioHandoffScope,
      payload: AgentStudioHandoffPayload,
    ) => {
      identityScopes.push(scope);
      return resolveIdentity(scope, payload);
    },
  } as unknown as AgentStudioHandoffIdentityService;
  const logger = { log: () => undefined } as unknown as LoggerService;
  const controller = new AgentStudioHandoffController(
    new AgentStudioHandoffService(cache),
    identityService,
    logger,
  );
  return { controller, entries, identityScopes };
}

describe('AgentStudioHandoffController', () => {
  it('stores the handoff under the authenticated organization and user, and hands it back once', async () => {
    const { controller, entries, identityScopes } = setup();
    const body = {
      brandId: 'brand-1',
      harness: false,
      modelKey: 'openai/gpt-image-2',
      organizationId: 'org-attacker',
      prompt: 'a red car',
      requestedSkillSlugs: ['cinema'],
      type: 'image',
      userId: 'user-attacker',
    } as CreateAgentStudioHandoffDto;

    const { id } = await controller.create(body, owner);

    expect(identityScopes).toEqual([
      { organizationId: 'org-1', userId: 'user-1' },
    ]);
    expect(entries.get(`agent-studio-handoff:${id}`)).toEqual({
      ttl: 600,
      value: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    });
    await expect(controller.consume(id, owner)).resolves.toMatchObject({
      brandId: 'brand-1',
      harness: false,
      modelKey: 'openai/gpt-image-2',
      prompt: 'a red car',
      requestedSkillSlugs: ['cinema'],
      type: 'image',
    });
  });

  it('stores the identity-resolved payload, not the raw request body', async () => {
    const { controller } = setup(() => ({
      avatarPhotoUrl: 'https://cdn.test/portrait.png',
      brandId: 'brand-1',
      modelKey: 'openai/gpt-image-2',
      prompt: 'speak as the brand',
      type: 'avatar',
      useIdentity: true,
      voiceId: 'voice-1',
    }));
    const body = {
      brandId: 'brand-1',
      modelKey: 'openai/gpt-image-2',
      prompt: 'speak as the brand',
      type: 'video',
      useIdentity: true,
    } as CreateAgentStudioHandoffDto;

    const { id } = await controller.create(body, owner);

    await expect(controller.consume(id, owner)).resolves.toEqual({
      avatarPhotoUrl: 'https://cdn.test/portrait.png',
      brandId: 'brand-1',
      modelKey: 'openai/gpt-image-2',
      prompt: 'speak as the brand',
      type: 'avatar',
      useIdentity: true,
      voiceId: 'voice-1',
    });
  });

  it('404s on a second read of the same handoff', async () => {
    const { controller } = setup();
    const { id } = await controller.create(
      {
        brandId: 'brand-1',
        modelKey: 'openai/gpt-image-2',
        prompt: 'a red car',
        type: 'image',
      } as CreateAgentStudioHandoffDto,
      owner,
    );
    await controller.consume(id, owner);

    await expect(controller.consume(id, owner)).rejects.toThrow(
      'This handoff is missing, expired, already used, or belongs to someone else.',
    );
  });

  it('404s for a foreign user and burns the handoff for its owner too', async () => {
    const { controller } = setup();
    const { id } = await controller.create(
      {
        brandId: 'brand-1',
        modelKey: 'openai/gpt-image-2',
        prompt: 'a red car',
        type: 'image',
      } as CreateAgentStudioHandoffDto,
      owner,
    );

    await expect(
      controller.consume(id, userFor('org-2', 'user-2')),
    ).rejects.toThrow('This handoff is missing');
    await expect(controller.consume(id, owner)).rejects.toThrow(
      'This handoff is missing',
    );
  });

  it('404s for an id that was never created', async () => {
    const { controller } = setup();

    await expect(controller.consume('handoff-404', owner)).rejects.toThrow(
      'This handoff is missing, expired, already used, or belongs to someone else.',
    );
  });
});
