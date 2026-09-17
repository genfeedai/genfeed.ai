import { AgentStudioHandoffController } from '@api/services/agent-orchestrator/agent-studio-handoff.controller';
import type { AgentStudioHandoffService } from '@api/services/agent-orchestrator/agent-studio-handoff.service';
import type { AgentStudioHandoffIdentityService } from '@api/services/agent-orchestrator/agent-studio-handoff-identity.service';
import type { CreateAgentStudioHandoffDto } from '@api/services/agent-orchestrator/dto/create-agent-studio-handoff.dto';

describe('AgentStudioHandoffController', () => {
  let handoffService: {
    consume: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let identityService: { attachIdentity: ReturnType<typeof vi.fn> };
  let controller: AgentStudioHandoffController;

  const authenticatedUser = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    handoffService = { consume: vi.fn(), create: vi.fn() };
    identityService = {
      attachIdentity: vi.fn(
        async (_scope: unknown, payload: unknown) => payload,
      ),
    };
    controller = new AgentStudioHandoffController(
      handoffService as unknown as AgentStudioHandoffService,
      identityService as unknown as AgentStudioHandoffIdentityService,
      { log: vi.fn() } as never,
    );
  });

  describe('create', () => {
    it('scopes the handoff to the authenticated organization and user, never the request body', async () => {
      handoffService.create.mockResolvedValue('handoff-1');
      const body: CreateAgentStudioHandoffDto = {
        brandId: 'brand-1',
        modelKey: 'openai/gpt-image-2',
        prompt: 'a red car',
        type: 'image',
      } as CreateAgentStudioHandoffDto;

      const result = await controller.create(body, authenticatedUser as never);

      expect(handoffService.create).toHaveBeenCalledWith(
        { organizationId: 'org-1', userId: 'user-1' },
        expect.objectContaining({
          brandId: 'brand-1',
          modelKey: 'openai/gpt-image-2',
          prompt: 'a red car',
          type: 'image',
        }),
      );
      expect(identityService.attachIdentity).toHaveBeenCalledWith(
        { organizationId: 'org-1', userId: 'user-1' },
        expect.objectContaining({
          brandId: 'brand-1',
          type: 'image',
        }),
      );
      expect(result).toEqual({ id: 'handoff-1' });
    });

    it('stores the identity-resolved payload, not the raw request body', async () => {
      identityService.attachIdentity.mockResolvedValue({
        avatarPhotoUrl: 'https://cdn.test/portrait.png',
        brandId: 'brand-1',
        modelKey: 'openai/gpt-image-2',
        prompt: 'speak as the brand',
        type: 'avatar',
        useIdentity: true,
        voiceId: 'voice-1',
      });
      handoffService.create.mockResolvedValue('handoff-identity');
      const body: CreateAgentStudioHandoffDto = {
        brandId: 'brand-1',
        modelKey: 'openai/gpt-image-2',
        prompt: 'speak as the brand',
        type: 'video',
        useIdentity: true,
      } as CreateAgentStudioHandoffDto;

      await controller.create(body, authenticatedUser as never);

      expect(handoffService.create).toHaveBeenCalledWith(
        { organizationId: 'org-1', userId: 'user-1' },
        {
          avatarPhotoUrl: 'https://cdn.test/portrait.png',
          brandId: 'brand-1',
          modelKey: 'openai/gpt-image-2',
          prompt: 'speak as the brand',
          type: 'avatar',
          useIdentity: true,
          voiceId: 'voice-1',
        },
      );
    });
  });

  describe('consume', () => {
    it('returns the payload for a valid handoff', async () => {
      handoffService.consume.mockResolvedValue({
        brandId: 'brand-1',
        modelKey: 'openai/gpt-image-2',
        prompt: 'a red car',
        type: 'image',
      });

      const result = await controller.consume(
        'handoff-1',
        authenticatedUser as never,
      );

      expect(handoffService.consume).toHaveBeenCalledWith('handoff-1', {
        organizationId: 'org-1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        brandId: 'brand-1',
        modelKey: 'openai/gpt-image-2',
        prompt: 'a red car',
        type: 'image',
      });
    });

    it('404s for a missing, expired, consumed, or foreign handoff', async () => {
      handoffService.consume.mockResolvedValue(null);

      await expect(
        controller.consume('handoff-1', authenticatedUser as never),
      ).rejects.toThrow(
        'This handoff is missing, expired, already used, or belongs to someone else.',
      );
    });
  });
});
