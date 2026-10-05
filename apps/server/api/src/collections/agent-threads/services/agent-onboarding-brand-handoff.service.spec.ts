import { AgentOnboardingBrandHandoffService } from '@api/collections/agent-threads/services/agent-onboarding-brand-handoff.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const prisma = {
    member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
  };
  const brands = { findOne: vi.fn().mockResolvedValue({ id: 'brand-1' }) };
  const organizations = {
    findOne: vi.fn().mockResolvedValue({ accountType: 'EXPERT' }),
  };
  const users = {
    findOne: vi
      .fn()
      .mockResolvedValue({
        id: 'user-1',
        isOnboardingCompleted: false,
        onboardingStepsCompleted: ['positioning'],
      }),
    patch: vi
      .fn()
      .mockResolvedValue({
        id: 'user-1',
        onboardingStepsCompleted: ['positioning', 'brand'],
      }),
  };
  const cache = { invalidateAll: vi.fn() };
  const service = new AgentOnboardingBrandHandoffService(
    prisma as never,
    brands as never,
    organizations as never,
    users as never,
    cache as never,
  );
  return { service, prisma, brands, organizations, users, cache };
}
describe('AgentOnboardingBrandHandoffService', () => {
  it('records only the brand step for an Expert fallback and preserves required progress', async () => {
    const h = fixture();
    await h.service.complete('user-1', 'org-1', 'brand-1');
    expect(h.prisma.member.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'org-1',
        isActive: true,
        isDeleted: false,
      },
    });
    expect(h.brands.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: 'org-1',
      isDeleted: false,
    });
    expect(h.users.patch).toHaveBeenCalledWith('user-1', {
      onboardingStepsCompleted: ['positioning', 'brand'],
      onboardingStartedAt: expect.any(Date),
    });
    expect(h.users.patch.mock.calls[0][1]).not.toHaveProperty(
      'isOnboardingCompleted',
    );
    expect(h.cache.invalidateAll).toHaveBeenCalledWith('user-1');
  });
  it('rejects foreign or inactive membership before any completion reads or writes', async () => {
    const h = fixture();
    h.prisma.member.findFirst.mockResolvedValue(null);
    await expect(
      h.service.complete('user-1', 'org-1', 'brand-1'),
    ).rejects.toThrow('Organization membership');
    expect(h.organizations.findOne).not.toHaveBeenCalled();
    expect(h.users.patch).not.toHaveBeenCalled();
  });
  it('rejects normal accounts', async () => {
    const h = fixture();
    h.organizations.findOne.mockResolvedValue({ accountType: 'CREATOR' });
    await expect(
      h.service.complete('user-1', 'org-1', 'brand-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.users.patch).not.toHaveBeenCalled();
  });
  it('requires a saved fallback brand in the active organization', async () => {
    const h = fixture();
    h.brands.findOne.mockResolvedValue(null);
    await expect(
      h.service.complete('user-1', 'org-1', 'foreign-brand'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.users.patch).not.toHaveBeenCalled();
  });
  it('rejects completed-user reentry without altering progress', async () => {
    const h = fixture();
    h.users.findOne.mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: [],
    });
    await expect(
      h.service.complete('user-1', 'org-1', 'brand-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.users.patch).not.toHaveBeenCalled();
  });
});
