import { AgentOnboardingKickoffService } from '@api/collections/agent-threads/services/agent-onboarding-kickoff.service';
import type { AgentScopeContextService } from '@api/index';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ONBOARDING_GREETING } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

function fixture(email = 'user@acme.com', brandDomain?: string) {
  const records: Array<Record<string, unknown>> = [];
  let lockTail = Promise.resolve();
  const tx = {
    $queryRaw: vi.fn(),
    agentThread: {
      findFirst: vi.fn(async () => records[0] ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: 'thread-1' };
        records.push(row);
        return row;
      }),
    },
    agentMessage: {
      create: vi.fn().mockResolvedValue({
        id: 'message-1',
        createdAt: new Date('2026-10-05T00:00:00Z'),
      }),
    },
    agentThreadEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: 'event-1',
      })),
    },
    agentThreadSnapshot: {
      create: vi.fn().mockResolvedValue({ id: 'snapshot-1' }),
    },
  };
  const prisma = {
    member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
    brand: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'brand-1',
        agentConfig: { signupPrefill: { brandDomain } },
      }),
    },
    user: { findFirst: vi.fn().mockResolvedValue({ email }) },
    $transaction: vi.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => {
        let release = () => {};
        const client = {
          ...tx,
          $queryRaw: vi.fn(async (...args: unknown[]) => {
            tx.$queryRaw(...args);
            const previous = lockTail;
            lockTail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            return [];
          }),
        };
        try {
          return await work(client);
        } finally {
          release();
        }
      },
    ),
  };
  const scope = {
    prepareForTurn: vi.fn().mockResolvedValue({
      initialScopeFields: {
        brandId: 'brand-1',
        contextVersion: 1,
        isLegacyBrandFallbackEligible: false,
      },
    }),
  };
  const service = new AgentOnboardingKickoffService(
    prisma as unknown as PrismaService,
    scope as unknown as AgentScopeContextService,
    new AgentThreadProjectorService(),
  );
  return { service, prisma, tx, records, scope };
}

describe('AgentOnboardingKickoffService', () => {
  it('creates one assistant greeting and resolvable URL request without a run', async () => {
    const { service, tx } = fixture();
    await service.kickoff('user-1', 'org-1', 'brand-1');
    expect(tx.agentMessage.create).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({
        content: ONBOARDING_GREETING,
        role: 'assistant',
        organizationId: 'org-1',
        threadId: 'thread-1',
      }),
    });
    const snapshot = tx.agentThreadSnapshot.create.mock.calls[0][0].data.data;
    expect(snapshot).toMatchObject({
      lastSequence: 1,
      source: 'onboarding',
      pendingInputRequests: [
        { requestId: 'onboarding-url:thread-1', allowFreeText: true },
      ],
      inputRequests: [
        { requestId: 'onboarding-url:thread-1', status: 'pending' },
      ],
    });
    expect(snapshot).not.toHaveProperty('activeRun');
    expect(tx.agentThread.create.mock.calls[0][0].data).toMatchObject({
      source: 'onboarding',
      mode: 'auto',
      brandId: 'brand-1',
    });
  });

  it('serializes concurrent kickoffs before checking for an existing thread', async () => {
    const { service, tx } = fixture();
    const [a, b] = await Promise.all([
      service.kickoff('user-1', 'org-1', 'brand-1'),
      service.kickoff('user-1', 'org-1', 'brand-1'),
    ]);
    expect(a.id).toBe(b.id);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.agentThread.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.agentThread.create).toHaveBeenCalledTimes(1);
    expect(tx.agentMessage.create).toHaveBeenCalledTimes(1);
    expect(tx.agentThreadSnapshot.create).toHaveBeenCalledTimes(1);
    expect(tx.agentThreadEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.agentThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          source: 'onboarding',
          status: 'active',
          isDeleted: false,
        },
      }),
    );
  });

  it('returns an existing thread unchanged', async () => {
    const { service, tx, records } = fixture();
    const existing = { id: 'old-thread', title: 'Already talking' };
    records.push(existing);
    expect(await service.kickoff('user-1', 'org-1', 'brand-1')).toBe(existing);
    expect(tx.agentMessage.create).not.toHaveBeenCalled();
    expect(tx.agentThreadSnapshot.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'user@acme.com',
      undefined,
      [{ id: 'https://acme.com', label: 'Use acme.com' }],
    ],
    ['user@gmail.com', undefined, []],
    [
      'user@gmail.com',
      'chosen.com',
      [{ id: 'https://chosen.com', label: 'Use chosen.com' }],
    ],
  ])('detects the URL option for %s / %s', async (email, domain, options) => {
    const { service, tx } = fixture(email, domain);
    await service.kickoff('user-1', 'org-1', 'brand-1');
    expect(
      tx.agentThreadSnapshot.create.mock.calls[0][0].data.data,
    ).toMatchObject({ pendingInputRequests: [{ options }] });
  });

  it('rejects a foreign organization before writing', async () => {
    const { service, prisma, tx } = fixture();
    prisma.member.findFirst.mockResolvedValue(null);
    await expect(
      service.kickoff('user-1', 'foreign-org', 'brand-1'),
    ).rejects.toThrow('Organization membership');
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'foreign-org',
        isActive: true,
        isDeleted: false,
      },
    });
    expect(tx.agentThread.create).not.toHaveBeenCalled();
  });

  it('rejects a brand outside the active organization', async () => {
    const { service, prisma, tx } = fixture();
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(
      service.kickoff('user-1', 'org-1', 'foreign-brand'),
    ).rejects.toThrow('Brand not found');
    expect(prisma.brand.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign-brand',
          organizationId: 'org-1',
          isDeleted: false,
        },
      }),
    );
    expect(tx.agentThread.create).not.toHaveBeenCalled();
  });
});
