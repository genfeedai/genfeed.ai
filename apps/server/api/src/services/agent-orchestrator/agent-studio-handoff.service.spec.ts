import { AgentStudioHandoffService } from '@api/services/agent-orchestrator/agent-studio-handoff.service';
import type { CacheService } from '@api/services/cache/cache.service';

describe('AgentStudioHandoffService', () => {
  let cacheService: {
    del: ReturnType<typeof vi.fn>;
    generateKey: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };
  let service: AgentStudioHandoffService;

  const scope = { organizationId: 'org-1', userId: 'user-1' };
  const payload = {
    aspectRatio: '1:1',
    brandId: 'brand-1',
    modelKey: 'openai/gpt-image-2',
    outputs: 1,
    prompt: 'a red car',
    type: 'image' as const,
  };

  beforeEach(() => {
    cacheService = {
      del: vi.fn().mockResolvedValue(true),
      generateKey: vi.fn(
        (namespace: string, id: string) => `${namespace}:${id}`,
      ),
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(true),
    };
    service = new AgentStudioHandoffService(
      cacheService as unknown as CacheService,
    );
  });

  it('creates a handoff scoped to the organization and user, with a TTL', async () => {
    const id = await service.create(scope, payload);

    expect(id).toEqual(expect.any(String));
    expect(cacheService.set).toHaveBeenCalledWith(
      `agent-studio-handoff:${id}`,
      expect.objectContaining({
        ...scope,
        ...payload,
        createdAt: expect.any(String),
      }),
      { ttl: 600 },
    );
  });

  it('consumes a handoff exactly once for the matching organization and user', async () => {
    const stored = {
      ...scope,
      ...payload,
      createdAt: '2026-09-12T00:00:00.000Z',
    };
    cacheService.get.mockResolvedValue(stored);

    const consumed = await service.consume('handoff-1', scope);

    expect(consumed).toEqual(payload);
    expect(cacheService.del).toHaveBeenCalledWith(
      'agent-studio-handoff:handoff-1',
    );
  });

  it('returns null for a missing or expired handoff', async () => {
    cacheService.get.mockResolvedValue(null);

    const consumed = await service.consume('handoff-1', scope);

    expect(consumed).toBeNull();
    expect(cacheService.del).not.toHaveBeenCalled();
  });

  it('returns null and still deletes the record for a foreign organization', async () => {
    cacheService.get.mockResolvedValue({
      ...scope,
      ...payload,
      organizationId: 'org-2',
      createdAt: '2026-09-12T00:00:00.000Z',
    });

    const consumed = await service.consume('handoff-1', scope);

    expect(consumed).toBeNull();
    expect(cacheService.del).toHaveBeenCalledWith(
      'agent-studio-handoff:handoff-1',
    );
  });

  it('returns null and still deletes the record for a foreign user', async () => {
    cacheService.get.mockResolvedValue({
      ...scope,
      ...payload,
      userId: 'user-2',
      createdAt: '2026-09-12T00:00:00.000Z',
    });

    const consumed = await service.consume('handoff-1', scope);

    expect(consumed).toBeNull();
    expect(cacheService.del).toHaveBeenCalledWith(
      'agent-studio-handoff:handoff-1',
    );
  });

  it('never leaks organizationId/userId/createdAt back to the caller', async () => {
    cacheService.get.mockResolvedValue({
      ...scope,
      ...payload,
      createdAt: '2026-09-12T00:00:00.000Z',
    });

    const consumed = await service.consume('handoff-1', scope);

    expect(consumed).not.toHaveProperty('organizationId');
    expect(consumed).not.toHaveProperty('userId');
    expect(consumed).not.toHaveProperty('createdAt');
  });

  it('a second consume of the same id returns null (single use)', async () => {
    const stored = {
      ...scope,
      ...payload,
      createdAt: '2026-09-12T00:00:00.000Z',
    };
    cacheService.get.mockResolvedValueOnce(stored).mockResolvedValueOnce(null);

    const first = await service.consume('handoff-1', scope);
    const second = await service.consume('handoff-1', scope);

    expect(first).toEqual(payload);
    expect(second).toBeNull();
  });
});
