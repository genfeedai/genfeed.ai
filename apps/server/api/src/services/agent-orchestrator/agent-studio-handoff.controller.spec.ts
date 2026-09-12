import { AgentStudioHandoffController } from '@api/services/agent-orchestrator/agent-studio-handoff.controller';
import type { AgentStudioHandoffService } from '@api/services/agent-orchestrator/agent-studio-handoff.service';
import type { CreateAgentStudioHandoffDto } from '@api/services/agent-orchestrator/dto/create-agent-studio-handoff.dto';

describe('AgentStudioHandoffController', () => {
  let handoffService: {
    consume: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let controller: AgentStudioHandoffController;

  const authenticatedUser = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    handoffService = { consume: vi.fn(), create: vi.fn() };
    controller = new AgentStudioHandoffController(
      handoffService as unknown as AgentStudioHandoffService,
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
      expect(result).toEqual({ id: 'handoff-1' });
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
