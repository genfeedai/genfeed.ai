import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { VisualProjectAuthorizationService } from '@api/collections/visual-projects/services/visual-project-authorization.service';
import { MemberRole } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const user = {
  id: 'actor',
  userId: 'actor',
  organizationId: 'org',
  brandId: 'brand',
} as AuthenticatedUser;
function fixture() {
  const prisma = {
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    member: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ role: { key: MemberRole.OWNER }, brands: [] }),
    },
    visualProject: {
      findFirst: vi.fn().mockResolvedValue({ id: 'project', brandId: 'brand' }),
    },
    visualRevision: {
      findFirst: vi.fn().mockResolvedValue({ id: 'revision' }),
    },
  };
  return {
    prisma,
    service: new VisualProjectAuthorizationService(prisma as never),
  };
}
describe('visual scope authorization', () => {
  it('scopes project and immutable revision reads to organization, brand and nondeleted rows', async () => {
    const { service, prisma } = fixture();
    await service.revision(user, 'project', 1);
    expect(prisma.visualProject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project',
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
      },
    });
    expect(prisma.visualRevision.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: 'project',
        number: 1,
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
      },
    });
    expect(prisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'actor',
          organizationId: 'org',
          isDeleted: false,
          isActive: true,
        },
      }),
    );
  });
  it('denies revoked membership', async () => {
    const { service, prisma } = fixture();
    prisma.member.findFirst.mockResolvedValueOnce(null);
    await expect(service.project(user, 'project')).rejects.toThrow(
      'active membership',
    );
  });
  it('denies a brand that is not assigned to a non-admin member', async () => {
    const { service, prisma } = fixture();
    prisma.member.findFirst.mockResolvedValueOnce({
      brands: [{ id: 'brand' }],
      role: { key: MemberRole.USER },
    });
    await expect(service.authorizeBrand(user, 'other-brand')).rejects.toThrow(
      'not available',
    );
  });
  it('lets an owner catalog a different organization brand than the JWT current brand', async () => {
    const { service, prisma } = fixture();
    prisma.brand.findFirst.mockResolvedValueOnce({ id: 'other-brand' });
    await expect(
      service.authorizeBrand(user, 'other-brand'),
    ).resolves.toBeUndefined();
  });
  it('does not disclose a foreign or deleted project through source history', async () => {
    const { service, prisma } = fixture();
    prisma.visualProject.findFirst.mockResolvedValueOnce(null);
    await expect(service.revision(user, 'foreign', 1)).rejects.toThrow(
      'Visual project unavailable',
    );
    expect(prisma.visualRevision.findFirst).not.toHaveBeenCalled();
  });
});
