import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import type { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MemberRole } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

/**
 * The in-conversation confirm route (#9647) runs the real RolesGuard against
 * the route's own metadata: only an organization owner or admin may answer,
 * even when the call carries a valid MCP origin proof.
 */
const ORGANIZATION_ID = testId('org-confirm');
const USER_ID = testId('user-confirm');

function confirmRouteGuard(memberRole: MemberRole): RolesGuard {
  const membersService = {
    findOne: async () => ({ id: 'member-1', role: { key: memberRole } }),
  } as unknown as MembersService;
  return new RolesGuard(new Reflector(), membersService);
}

function confirmRequestContext(user: Record<string, unknown>) {
  return {
    getClass: () => McpApprovalsController,
    getHandler: () => McpApprovalsController.prototype.confirm,
    switchToHttp: () => ({
      getRequest: () => ({
        body: { decision: 'approve' },
        params: { id: 'approval-1' },
        user,
      }),
    }),
  } as unknown as ExecutionContext;
}

const sessionUser = { organizationId: ORGANIZATION_ID, userId: USER_ID };

describe('POST /mcp-approvals/:id/confirm roles', () => {
  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'lets an organization %s answer',
    async (role) => {
      await expect(
        confirmRouteGuard(role).canActivate(confirmRequestContext(sessionUser)),
      ).resolves.toBe(true);
    },
  );

  it.each([
    ['an ordinary member', MemberRole.USER, sessionUser],
    ['a creator', MemberRole.CREATOR, sessionUser],
    [
      'an admin API key without an admin scope',
      MemberRole.ADMIN,
      { ...sessionUser, isApiKey: true, scopes: [] },
    ],
  ])('refuses %s with 403', async (_label, role, user) => {
    await expect(
      confirmRouteGuard(role).canActivate(confirmRequestContext(user)),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });
});
