import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialInboxSyncController } from '@api/collections/social-inbox/controllers/social-inbox-sync.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /messages/youtube/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncYoutubeComments,
  ],
  [
    'POST /messages/facebook/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncFacebookComments,
  ],
  [
    'POST /messages/threads/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncThreadsReplies,
  ],
  [
    'POST /messages/instagram/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncInstagramComments,
  ],
  [
    'POST /messages/instagram/dms/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncInstagramDms,
  ],
  [
    'POST /messages/x/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncXComments,
  ],
  [
    'POST /messages/x/dms/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncXDms,
  ],
  [
    'POST /messages/linkedin/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncLinkedInComments,
  ],
  [
    'POST /messages/linkedin/dms/sync',
    SocialInboxSyncController,
    SocialInboxSyncController.prototype.syncLinkedInDms,
  ],
];

describe.each(ADMIN_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:create', 'images:create', 'prompts:create', 'articles:create']],
      [['posts:draft', 'posts:schedule', 'posts:publish', 'brands:write']],
      [['videos:read', 'images:read', 'brands:read', 'credits:read']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['admin']])('allows a key with %s', async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    });
  },
);

const INBOX_ROUTES: readonly ScopedRoute[] = [
  [
    'PATCH /messages/:conversationId/read',
    SocialInboxController,
    SocialInboxController.prototype.markConversationRead,
  ],
  [
    'PATCH /messages/:conversationId',
    SocialInboxController,
    SocialInboxController.prototype.updateConversation,
  ],
];

describe.each(INBOX_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:create', 'images:create', 'prompts:create']],
      [['posts:read', 'brands:read', 'analytics:read']],
      [['posts:schedule', 'brands:write', 'credits:read']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['posts:draft'], ['posts:approve'], ['posts:publish'], ['admin']])(
      'allows a key with %s',
      async (scope) => {
        const guard = buildGuard(keyWithScopes([scope]));

        await expect(
          guard.canActivate(
            routeContext(controller, handler, httpMethod(route)),
          ),
        ).resolves.toBe(true);
      },
    );
  },
);
