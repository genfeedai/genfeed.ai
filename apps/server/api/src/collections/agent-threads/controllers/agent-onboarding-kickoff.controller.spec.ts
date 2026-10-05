import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentOnboardingKickoffController } from '@api/collections/agent-threads/controllers/agent-onboarding-kickoff.controller';
import type { AgentOnboardingKickoffService } from '@api/collections/agent-threads/services/agent-onboarding-kickoff.service';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentOnboardingKickoffController', () => {
  const kickoff = vi.fn();
  let controller: AgentOnboardingKickoffController;
  const req = { originalUrl: '/v1/agent/threads/onboarding/kickoff' } as never;
  const user = {
    id: 'auth_user',
    organizationId: 'org_current',
    userId: 'user_current',
  } as unknown as User;

  beforeEach(() => {
    kickoff.mockReset();
    controller = new AgentOnboardingKickoffController({
      kickoff,
    } as unknown as AgentOnboardingKickoffService);
  });

  it('uses the canonical user and authenticated organization and serializes the thread', async () => {
    kickoff.mockResolvedValue({
      id: 'thread-onboarding',
      organizationId: 'org_current',
      source: 'onboarding',
    });

    const result = await controller.kickoffOnboarding(
      req,
      { brandId: 'brand_current' },
      user,
    );

    expect(kickoff).toHaveBeenCalledWith(
      'user_current',
      'org_current',
      'brand_current',
    );
    expect(result).toMatchObject({ data: { id: 'thread-onboarding' } });
  });

  it('rejects a request without an organization', async () => {
    await expect(
      controller.kickoffOnboarding(req, {}, {
        ...user,
        organizationId: undefined,
      } as unknown as User),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(kickoff).not.toHaveBeenCalled();
  });
});
