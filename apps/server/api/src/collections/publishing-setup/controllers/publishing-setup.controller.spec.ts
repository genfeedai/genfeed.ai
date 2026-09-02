import type { MembersService } from '@api/collections/members/services/members.service';
import { PublishingSetupController } from '@api/collections/publishing-setup/controllers/publishing-setup.controller';
import type { PublishingSetupService } from '@api/collections/publishing-setup/services/publishing-setup.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const ORGANIZATION_ID = testId('org');
const USER_ID = testId('user');

describe('PublishingSetupController', () => {
  it('separates the schedule-scoped checklist from the admin-scoped support bundle', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PublishingSetupController.prototype.getChecklist,
      ),
    ).toEqual([ApiKeyScope.POSTS_SCHEDULE]);

    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PublishingSetupController.prototype.getDiagnostics,
      ),
    ).toEqual([ApiKeyScope.ADMIN]);
  });

  it('returns the computed checklist and diagnostics contracts untouched', async () => {
    const checklist = { checks: [], generatedAt: 'now', state: 'unknown' };
    const diagnosticsExport = {
      checklist,
      deployment: 'self-hosted',
      diagnostics: [],
      generatedAt: 'now',
    };
    const service = {
      buildChecklist: vi.fn().mockResolvedValue(checklist),
      exportDiagnostics: vi.fn().mockResolvedValue(diagnosticsExport),
    };
    const controller = new PublishingSetupController(
      service as unknown as PublishingSetupService,
    );

    await expect(controller.getChecklist()).resolves.toBe(checklist);
    await expect(controller.getDiagnostics()).resolves.toBe(diagnosticsExport);
  });

  /**
   * `@RequiredScopes(ApiKeyScope.ADMIN)` only binds API-key tokens. Browser
   * sessions are judged by RolesGuard, which lets any active member through
   * when a handler declares no roles — so the admin intent has to be stated
   * as role metadata too. Exercise the real guard, not the metadata.
   */
  describe('RolesGuard behaviour', () => {
    const mockMembersService = { findOne: vi.fn() };
    let guard: RolesGuard;

    const createContext = (handler: () => unknown): ExecutionContext =>
      ({
        getClass: vi.fn(),
        getHandler: () => handler,
        switchToHttp: () => ({
          getRequest: () => ({
            body: {},
            params: {},
            user: {
              organizationId: ORGANIZATION_ID,
              userId: USER_ID,
            },
          }),
        }),
      }) as unknown as ExecutionContext;

    const asActiveMember = (role: MemberRole) =>
      mockMembersService.findOne.mockResolvedValue({
        id: 'member-1',
        role: { id: 'role-1', key: role },
      });

    beforeEach(() => {
      mockMembersService.findOne.mockReset();
      guard = new RolesGuard(
        new Reflector(),
        mockMembersService as unknown as MembersService,
      );
    });

    it('rejects a non-admin organization member on diagnostics', async () => {
      asActiveMember(MemberRole.CREATOR);

      let thrownError: unknown;
      try {
        await guard.canActivate(
          createContext(PublishingSetupController.prototype.getDiagnostics),
        );
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(HttpException);
      expect((thrownError as HttpException).getStatus()).toBe(
        HttpStatus.FORBIDDEN,
      );
    });

    it.each([MemberRole.OWNER, MemberRole.ADMIN])(
      'allows %s on diagnostics',
      async (role) => {
        asActiveMember(role);

        await expect(
          guard.canActivate(
            createContext(PublishingSetupController.prototype.getDiagnostics),
          ),
        ).resolves.toBe(true);
      },
    );

    it('keeps the checklist open to any active member', async () => {
      asActiveMember(MemberRole.CREATOR);

      await expect(
        guard.canActivate(
          createContext(PublishingSetupController.prototype.getChecklist),
        ),
      ).resolves.toBe(true);
    });
  });
});
