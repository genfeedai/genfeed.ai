import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  parseWorkflowActor,
  refreshWorkflowActor,
  toWorkflowActor,
  workflowActorKey,
} from '@api/authorization/brand-access/workflow-actor.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));

const actor = {
  userId: 'opaque-user',
  organizationId: 'org',
  isApiKey: false,
  scopes: [],
};

function harness() {
  const findMember = vi
    .fn()
    .mockResolvedValue({ role: { key: MemberRole.ADMIN }, brands: [] });
  const findKey = vi
    .fn()
    .mockResolvedValue({ scopes: ['admin', 'content:read'] });
  const prisma = {
    member: { findFirst: findMember },
    apiKey: { findFirst: findKey },
  } as unknown as PrismaService;
  return {
    findKey,
    findMember,
    policy: new BrandAccessService(prisma),
    prisma,
  };
}

describe('shared automatic workflow actor', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });

  it('copies only authenticated fields and sorts scopes', () => {
    expect(
      parseWorkflowActor(
        {
          ...actor,
          scopes: ['b', 'a', 'b'],
          role: 'OWNER',
          bearer: 'secret',
        },
        'org',
      ),
    ).toEqual({ ...actor, scopes: ['a', 'b'] });
  });

  it.each([
    undefined,
    { ...actor, userId: '' },
    { ...actor, organizationId: 'foreign' },
    { ...actor, scopes: ['admin', 1] },
    { ...actor, isApiKey: true },
    { ...actor, apiKeyId: ' ' },
  ])('denies a malformed or actorless value in Cloud: %j', (value) => {
    expect(() => parseWorkflowActor(value, 'org')).toThrow(
      new ForbiddenException('Brand access denied'),
    );
  });

  it('uses the caller supplied denial', () => {
    const deny = vi.fn((): never => {
      throw new Error('custom denial');
    });
    expect(() => parseWorkflowActor(undefined, 'org', deny)).toThrow(
      'custom denial',
    );
    expect(deny).toHaveBeenCalledOnce();
  });

  it('defaults a missing key flag and scopes, and rejects a key actor without a key id', () => {
    expect(
      toWorkflowActor({ userId: 'opaque-user', organizationId: 'org' }),
    ).toEqual(actor);
    expect(() =>
      toWorkflowActor({
        userId: 'opaque-user',
        organizationId: 'org',
        isApiKey: true,
      }),
    ).toThrow('Brand access denied');
  });

  it('keys job identities by actor, not by scope order or duplicates', () => {
    expect(workflowActorKey({ ...actor, scopes: ['b', 'a', 'b'] })).toEqual(
      workflowActorKey({ ...actor, scopes: ['a', 'b'] }),
    );
    expect(workflowActorKey(actor)).not.toBe(
      workflowActorKey({ ...actor, userId: 'other' }),
    );
    expect(workflowActorKey(actor)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refreshes key authority by exact identity and only narrows scopes', async () => {
    const h = harness();
    const result = await refreshWorkflowActor(
      h.prisma,
      h.policy,
      {
        ...actor,
        isApiKey: true,
        apiKeyId: 'key',
        scopes: ['admin', 'removed'],
      },
      'org',
    );
    expect(result?.scopes).toEqual(['admin']);
    expect(h.findKey).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { scopes: true },
        where: expect.objectContaining({
          id: 'key',
          userId: actor.userId,
          organizationId: 'org',
          isRevoked: false,
        }),
      }),
    );
    expect(h.findMember).toHaveBeenCalled();
  });

  it('denies a revoked, expired or foreign key before resolving membership', async () => {
    const h = harness();
    h.findKey.mockResolvedValue(null);
    await expect(
      refreshWorkflowActor(
        h.prisma,
        h.policy,
        { ...actor, isApiKey: true, apiKeyId: 'key' },
        'org',
      ),
    ).rejects.toThrow('Brand access denied');
    expect(h.findMember).not.toHaveBeenCalled();
  });

  it('denies when live membership is gone', async () => {
    const h = harness();
    h.findMember.mockResolvedValue(null);
    await expect(
      refreshWorkflowActor(h.prisma, h.policy, actor, 'org'),
    ).rejects.toThrow('Brand access denied');
  });

  it('retains the actorless self-host path only outside Cloud', async () => {
    const h = harness();
    runtime.cloud = false;
    await expect(
      refreshWorkflowActor(h.prisma, h.policy, undefined, 'org'),
    ).resolves.toBeUndefined();
    expect(h.findMember).not.toHaveBeenCalled();
    runtime.cloud = true;
    await expect(
      refreshWorkflowActor(h.prisma, h.policy, undefined, 'org'),
    ).rejects.toThrow('Brand access denied');
  });
});
