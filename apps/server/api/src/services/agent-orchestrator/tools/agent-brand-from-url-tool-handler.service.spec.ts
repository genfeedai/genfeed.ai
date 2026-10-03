import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AgentBrandFromUrlToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-from-url-tool-handler.service';
import { MemberRole } from '@genfeedai/contracts';
import { Reflector } from '@nestjs/core';

const CTX = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
};
const running = {
  brandId: 'brand-1',
  reviewUrl: 'https://app.example.com/org/brand/settings/kit',
  scanStatus: 'running' as const,
};
const completed = {
  ...running,
  scanStatus: 'succeeded' as const,
  completenessScore: 60,
  revisionId: 'revision-1',
  revisionStatus: 'draft' as const,
};
function harness(role: MemberRole = MemberRole.OWNER) {
  const members = {
    findOne: vi.fn().mockResolvedValue({ role: { key: role } }),
  };
  const roles = new RolesGuard(new Reflector(), members as never);
  const requestContext = { hydrate: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    user: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: CTX.userId, platformRole: 'USER' }),
    },
  };
  const service = {
    start: vi.fn().mockImplementation(async () => ({
      createdAt: Date.now(),
      running,
      completion: Promise.resolve(completed),
    })),
    get: vi.fn().mockResolvedValue(completed),
  };
  return {
    handler: new AgentBrandFromUrlToolHandler(
      roles,
      requestContext as never,
      prisma as never,
      service as never,
    ),
    service,
    members,
    requestContext,
  };
}
describe('AgentBrandFromUrlToolHandler', () => {
  afterEach(() => vi.useRealTimers());
  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'allows %s and delegates billing',
    async (role) => {
      const h = harness(role);
      expect(
        await h.handler.execute(
          'create_brand_from_url',
          { url: 'https://example.com', approve: true },
          CTX,
        ),
      ).toEqual({
        success: true,
        creditsUsed: 1,
        isBillingDelegated: true,
        data: completed,
      });
      expect(h.service.start).toHaveBeenCalledWith(
        { url: 'https://example.com', label: undefined, approve: true },
        CTX,
      );
      expect(h.members.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: CTX.organizationId,
          userId: CTX.userId,
          isDeleted: false,
          isActive: true,
        }),
        expect.any(Array),
      );
      expect(h.requestContext.hydrate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            organizationId: CTX.organizationId,
            userId: CTX.userId,
          }),
        }),
      );
    },
  );
  it.each([MemberRole.USER, MemberRole.ANALYTICS])(
    'rejects %s before validation or writes',
    async (role) => {
      const h = harness(role);
      await expect(
        h.handler.execute('create_brand_from_url', {}, CTX),
      ).rejects.toThrow(
        'Only organization owners and admins can create brands from a URL.',
      );
      expect(h.service.start).not.toHaveBeenCalled();
    },
  );
  it('reads status without the creation role check', async () => {
    const h = harness(MemberRole.ANALYTICS);
    expect(
      await h.handler.execute(
        'get_brand_scan_status',
        { brandId: 'brand-1' },
        CTX,
      ),
    ).toEqual({
      success: true,
      creditsUsed: 0,
      isBillingDelegated: true,
      data: completed,
    });
    expect(h.service.get).toHaveBeenCalledWith(CTX.organizationId, 'brand-1');
    expect(h.members.findOne).not.toHaveBeenCalled();
  });
  it('returns running twenty seconds after creation while completion continues', async () => {
    vi.useFakeTimers();
    const h = harness();
    let finish!: (value: typeof completed) => void;
    const completion = new Promise<typeof completed>((resolve) => {
      finish = resolve;
    });
    h.service.start.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return { createdAt: Date.now(), running, completion };
    });
    let hasReturned = false;
    const result = h.handler
      .execute('create_brand_from_url', { url: 'https://example.com' }, CTX)
      .then((value) => {
        hasReturned = true;
        return value;
      });
    await vi.advanceTimersByTimeAsync(24_999);
    expect(hasReturned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({
      success: true,
      creditsUsed: 0,
      isBillingDelegated: true,
      data: running,
    });
    finish(completed);
    await completion;
    expect(
      (
        await h.handler.execute(
          'get_brand_scan_status',
          { brandId: 'brand-1' },
          CTX,
        )
      ).data,
    ).toEqual(completed);
  });
  it('delegates zero credits on failure', async () => {
    const h = harness();
    h.service.start.mockResolvedValue({
      createdAt: Date.now(),
      running,
      completion: Promise.resolve({ ...completed, scanStatus: 'failed' }),
    } as never);
    expect(
      await h.handler.execute(
        'create_brand_from_url',
        { url: 'https://example.com' },
        CTX,
      ),
    ).toMatchObject({ creditsUsed: 0, isBillingDelegated: true });
  });
  it.each([
    ['create_brand_from_url', 'create_brand_from_url requires a url.'],
    ['get_brand_scan_status', 'get_brand_scan_status requires a brandId.'],
  ] as const)('requires inputs for %s', async (name, message) => {
    await expect(harness().handler.execute(name, {}, CTX)).rejects.toThrow(
      message,
    );
  });
});
