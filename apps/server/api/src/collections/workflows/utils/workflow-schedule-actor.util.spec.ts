import { parseWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import {
  resolveScheduleInitiatingActor,
  toScheduleInitiatingActorWrite,
  toWorkflowSchedulePrincipal,
} from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));

const user = {
  brandId: 'brand-1',
  id: 'fallback-id',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('workflow schedule actor capture', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });

  it('derives the principal from the authenticated user only', () => {
    expect(
      toWorkflowSchedulePrincipal({
        ...user,
        scopes: ['b', 'a'],
      }),
    ).toEqual({
      apiKeyId: undefined,
      isApiKey: false,
      organizationId: 'org-1',
      scopes: ['b', 'a'],
      userId: 'user-1',
    });
  });

  it('falls back to the user id and carries API key identity', () => {
    expect(
      toWorkflowSchedulePrincipal({
        ...user,
        apiKeyId: 'key-1',
        isApiKey: true,
        scopes: ['content:read'],
        userId: undefined as unknown as string,
      }),
    ).toMatchObject({
      apiKeyId: 'key-1',
      isApiKey: true,
      userId: 'fallback-id',
    });
  });

  it('serializes exactly what the shared actor parser accepts', () => {
    const actor = resolveScheduleInitiatingActor({
      isEnabled: true,
      organizationId: 'org-1',
      principal: toWorkflowSchedulePrincipal({
        ...user,
        apiKeyId: 'key-1',
        isApiKey: true,
        scopes: ['b', 'a', 'b'],
      }),
      schedule: '0 9 * * *',
    });

    expect(actor).toEqual({
      apiKeyId: 'key-1',
      isApiKey: true,
      organizationId: 'org-1',
      scopes: ['a', 'b'],
      userId: 'user-1',
    });
    expect(
      parseWorkflowActor(toScheduleInitiatingActorWrite(actor), 'org-1'),
    ).toEqual(actor);
  });

  it.each([
    ['no schedule', { isEnabled: true, schedule: null }],
    ['a disabled schedule', { isEnabled: false, schedule: '0 9 * * *' }],
    ['an unset enabled flag', { isEnabled: undefined, schedule: '0 9 * * *' }],
  ])('does not bind %s', (_name, input) => {
    expect(
      resolveScheduleInitiatingActor({
        ...input,
        organizationId: 'org-1',
        principal: toWorkflowSchedulePrincipal(user),
      }),
    ).toBeNull();
  });

  it('does not bind when no principal is supplied', () => {
    expect(
      resolveScheduleInitiatingActor({
        isEnabled: true,
        organizationId: 'org-1',
        schedule: '0 9 * * *',
      }),
    ).toBeNull();
  });

  it('rejects a principal from another organization', () => {
    expect(() =>
      resolveScheduleInitiatingActor({
        isEnabled: true,
        organizationId: 'org-2',
        principal: toWorkflowSchedulePrincipal(user),
        schedule: '0 9 * * *',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects a Cloud API key without a key id instead of storing a partial actor', () => {
    expect(() =>
      resolveScheduleInitiatingActor({
        isEnabled: true,
        organizationId: 'org-1',
        principal: toWorkflowSchedulePrincipal({ ...user, isApiKey: true }),
        schedule: '0 9 * * *',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects a principal without a user id', () => {
    expect(() =>
      resolveScheduleInitiatingActor({
        isEnabled: true,
        organizationId: 'org-1',
        principal: {
          organizationId: 'org-1',
          userId: '',
        },
        schedule: '0 9 * * *',
      }),
    ).toThrow(ForbiddenException);
  });

  it('writes SQL NULL to clear the binding', () => {
    expect(toScheduleInitiatingActorWrite(null)).toBe(Prisma.DbNull);
  });
});
