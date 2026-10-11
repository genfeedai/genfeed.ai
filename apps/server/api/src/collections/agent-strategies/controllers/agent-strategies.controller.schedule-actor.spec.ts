import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import type { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import type { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import type { Request } from 'express';

describe('AgentStrategiesController schedule actor (#6689)', () => {
  const user = {
    brandId: 'brand-1',
    id: 'auth-1',
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'user-1',
  } as unknown as AuthenticatedUser;
  const apiKeyUser = {
    ...user,
    apiKeyId: 'key-1',
    isApiKey: true,
    scopes: ['agents:write'],
  } as unknown as AuthenticatedUser;
  const forgedActor = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: ['admin'],
    userId: 'attacker',
  };
  const forgedPrincipal = { ...forgedActor, scopes: [] as string[] };

  let strategies: {
    setActive: ReturnType<typeof vi.fn>;
    supportsField: ReturnType<typeof vi.fn>;
  };
  let controller: AgentStrategiesController;

  beforeEach(() => {
    strategies = {
      setActive: vi.fn().mockResolvedValue({ id: 'strategy-1' }),
      supportsField: vi.fn().mockReturnValue(true),
    };
    controller = new AgentStrategiesController(
      strategies as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('derives the create principal from the authenticated user only', () => {
    const dto = controller.enrichCreateDto(
      {
        label: 'Agent',
        schedulePrincipal: forgedPrincipal,
        scheduleInitiatingActor: forgedActor,
        userId: 'someone-else',
      } as unknown as Partial<CreateAgentStrategyDto>,
      user,
    ) as unknown as Record<string, unknown>;

    expect(dto.schedulePrincipal).toEqual({
      apiKeyId: undefined,
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'user-1',
    });
    expect(dto).not.toHaveProperty('scheduleInitiatingActor');
    expect(dto.userId).toBe('user-1');
  });

  it('keeps an API key identity in the principal it derives', () => {
    const dto = controller.enrichCreateDto(
      { label: 'Agent' } as Partial<CreateAgentStrategyDto>,
      apiKeyUser,
    ) as unknown as Record<string, unknown>;

    expect(dto.schedulePrincipal).toEqual({
      apiKeyId: 'key-1',
      isApiKey: true,
      organizationId: 'org-1',
      scopes: ['agents:write'],
      userId: 'user-1',
    });
  });

  it('discards a client-supplied actor or principal on update and uses the authenticated one', async () => {
    const dto = (await controller.enrichUpdateDto(
      {
        label: 'Renamed',
        schedulePrincipal: forgedPrincipal,
        scheduleInitiatingActor: forgedActor,
      } as unknown as Partial<UpdateAgentStrategyDto>,
      user,
    )) as unknown as Record<string, unknown>;

    expect(dto.schedulePrincipal).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(dto).not.toHaveProperty('scheduleInitiatingActor');
    expect(dto.label).toBe('Renamed');
  });

  it('hands the authenticated user to setActive when a PATCH enables or disables the strategy', async () => {
    const request = {
      headers: {},
      url: '/agent-strategies/strategy-1',
    } as unknown as Request;

    await controller.patch(request, user, 'strategy-1', { isActive: true });
    await controller.patch(request, user, 'strategy-1', { isActive: false });

    expect(strategies.setActive).toHaveBeenNthCalledWith(
      1,
      'strategy-1',
      'org-1',
      true,
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
    );
    expect(strategies.setActive).toHaveBeenNthCalledWith(
      2,
      'strategy-1',
      'org-1',
      false,
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
    );
  });
});
