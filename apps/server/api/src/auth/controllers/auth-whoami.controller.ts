import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { Controller, Get, Req } from '@nestjs/common';

type AuthWhoamiUser = {
  email?: string;
  emailAddresses?: Array<{
    emailAddress?: string;
  }>;
  firstName?: string;
  id?: string;
  lastName?: string;
  publicMetadata?: Record<string, unknown>;
};

type AuthWhoamiRequest = {
  user?: AuthWhoamiUser;
};

/**
 * Auth controller for identity introspection.
 * Works with both Clerk JWT and API key authentication.
 *
 * GET /auth/whoami — returns the authenticated user/org context.
 */
@Controller('auth')
export class AuthWhoamiController {
  @Get('whoami')
  whoami(@Req() req: AuthWhoamiRequest) {
    const user = req.user;
    const meta = user?.publicMetadata || {};
    const mongoUserId = ObjectIdUtil.isValid(meta.user)
      ? String(meta.user)
      : '';
    const clerkUserId = user?.id || '';

    return {
      data: {
        isApiKey: meta.isApiKey || false,
        organization: {
          id: meta.organization || '',
          name: meta.organizationName || '',
        },
        scopes: meta.scopes || ['*'],
        user: {
          clerkId: clerkUserId,
          email: user?.emailAddresses?.[0]?.emailAddress || user?.email || '',
          id: mongoUserId,
          name: user?.firstName
            ? `${user.firstName} ${user.lastName || ''}`.trim()
            : '',
        },
      },
    };
  }
}
