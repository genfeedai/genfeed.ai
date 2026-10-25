import { McpApprovalPolicyService } from '@api/collections/mcp-approvals/services/mcp-approval-policy.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

function createService(
  organization: { isMcpApprovalRequired: boolean } | null,
  member: { isMcpApprovalRequired: boolean } | null,
) {
  const prisma = {
    organizationSetting: { findFirst: vi.fn().mockResolvedValue(organization) },
    setting: { findFirst: vi.fn().mockResolvedValue(member) },
  };
  return {
    prisma,
    service: new McpApprovalPolicyService(prisma as unknown as PrismaService),
  };
}

describe('McpApprovalPolicyService', () => {
  it('requires approval by default at both levels', async () => {
    const { service } = createService(
      { isMcpApprovalRequired: true },
      { isMcpApprovalRequired: true },
    );
    await expect(service.isApprovalRequired('org_1', 'user_1')).resolves.toBe(
      true,
    );
  });

  it('skips the queue only when the organization and the member both turn it off', async () => {
    const { service } = createService(
      { isMcpApprovalRequired: false },
      { isMcpApprovalRequired: false },
    );
    await expect(service.isApprovalRequired('org_1', 'user_1')).resolves.toBe(
      false,
    );
  });

  it('keeps approvals when the organization still requires them', async () => {
    const { service } = createService(
      { isMcpApprovalRequired: true },
      { isMcpApprovalRequired: false },
    );
    await expect(service.isApprovalRequired('org_1', 'user_1')).resolves.toBe(
      true,
    );
  });

  it('keeps approvals when the member still requires them', async () => {
    const { service } = createService(
      { isMcpApprovalRequired: false },
      { isMcpApprovalRequired: true },
    );
    await expect(service.isApprovalRequired('org_1', 'user_1')).resolves.toBe(
      true,
    );
  });

  it('requires approval when a settings row is missing', async () => {
    const { service } = createService({ isMcpApprovalRequired: false }, null);
    await expect(service.isApprovalRequired('org_1', 'user_1')).resolves.toBe(
      true,
    );
  });

  it('requires approval when the read fails', async () => {
    const { prisma, service } = createService(null, null);
    prisma.setting.findFirst.mockRejectedValue(new Error('db down'));
    await expect(service.isApprovalRequired('org_1', 'user_1')).resolves.toBe(
      true,
    );
  });

  it('reads the member scoped to its own non-deleted row', async () => {
    const { prisma, service } = createService(null, null);
    await service.isApprovalRequired('org_1', 'user_1');
    expect(prisma.setting.findFirst).toHaveBeenCalledWith({
      select: { isMcpApprovalRequired: true },
      where: { isDeleted: false, userId: 'user_1' },
    });
  });
});
