import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { Request } from 'express';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/**
 * Business context every API wide event carries: who made the request, for
 * which organization and brand, and how they authenticated. Read when the
 * response finishes, so it reflects whatever the guards resolved, including
 * for requests that were rejected after authentication.
 */
export function describeApiRequest(
  request: AuthenticatedRequest,
): Record<string, unknown> {
  const user = request.user;
  if (!user) return { auth_method: 'anonymous' };

  return {
    action_origin: user.actionOrigin,
    api_key: user.apiKeyId ? { id: user.apiKeyId } : undefined,
    auth_method: user.isApiKey ? 'api_key' : 'session',
    brand: { id: user.brandId },
    organization: { id: user.organizationId },
    user: {
      id: user.userId || user.id,
      is_super_admin: user.isSuperAdmin ? true : undefined,
      subscription_tier: user.subscriptionTier,
    },
  };
}
