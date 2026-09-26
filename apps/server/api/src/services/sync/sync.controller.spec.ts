import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncController } from './sync.controller';
import type { SyncService } from './sync.service';

describe('SyncController', () => {
  let syncService: {
    getStatus: ReturnType<typeof vi.fn>;
    pullWorkflow: ReturnType<typeof vi.fn>;
    pushWorkflow: ReturnType<typeof vi.fn>;
  };
  let controller: SyncController;

  const user = { id: 'user_1', organizationId: 'org_1' } as User;
  const requestWith = (authorization?: string): Request =>
    ({ headers: authorization ? { authorization } : {} }) as Request;

  beforeEach(() => {
    syncService = {
      getStatus: vi.fn(),
      pullWorkflow: vi.fn().mockResolvedValue({}),
      pushWorkflow: vi.fn().mockResolvedValue({}),
    };
    controller = new SyncController(syncService as unknown as SyncService);
  });

  it.each([
    ['well-formed', 'Bearer session-token', 'session-token'],
    // RFC 7235: scheme names are case-insensitive.
    ['lowercase scheme', 'bearer session-token', 'session-token'],
    ['mixed-case scheme', 'BeArEr session-token', 'session-token'],
  ])(
    'forwards the bare token from a %s Authorization header on push',
    async (_label, authorization, expectedToken) => {
      await controller.pushWorkflow(user, 'wf_1', requestWith(authorization));

      expect(syncService.pushWorkflow).toHaveBeenCalledWith(
        user,
        'wf_1',
        expectedToken,
      );
    },
  );

  it.each([
    ['absent header', undefined],
    ['wrong scheme', 'Basic session-token'],
    ['surplus fields', 'Bearer session-token extra'],
    ['single field', 'Bearer'],
  ])(
    // Regression coverage for #5206: `authorization?.replace('Bearer ', '')`
    // was a case-sensitive literal match, so a lowercase `bearer <tok>`
    // header left the scheme word un-stripped and SyncService re-emitted it
    // as `Authorization: Bearer bearer <tok>` to the cloud API. A malformed
    // or foreign-scheme header must now resolve to an empty token instead of
    // leaking raw header text downstream.
    'forwards an empty token for a %s Authorization header on pull',
    async (_label, authorization) => {
      await controller.pullWorkflow(
        user,
        'cloud_1',
        requestWith(authorization),
      );

      expect(syncService.pullWorkflow).toHaveBeenCalledWith(
        user,
        'cloud_1',
        '',
      );
    },
  );
});
