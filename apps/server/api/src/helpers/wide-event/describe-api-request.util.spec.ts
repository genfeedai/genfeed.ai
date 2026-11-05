import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { describeApiRequest } from '@api/helpers/wide-event/describe-api-request.util';
import type { Request } from 'express';

function createRequest(
  user?: Partial<AuthenticatedUser>,
  context?: Partial<IRequestContext>,
): Request {
  return { context, user } as unknown as Request;
}

describe('describeApiRequest', () => {
  it('marks unauthenticated requests as anonymous with no identity', () => {
    expect(describeApiRequest(createRequest())).toEqual({
      auth_method: 'anonymous',
    });
  });

  it('describes a signed-in user, their organization and brand', () => {
    expect(
      describeApiRequest(
        createRequest(
          {
            brandId: 'brand-1',
            id: 'legacy-id',
            organizationId: 'org-1',
            userId: 'user-1',
          },
          { subscriptionTier: 'pro' },
        ),
      ),
    ).toEqual({
      action_origin: undefined,
      api_key: undefined,
      auth_method: 'session',
      brand: { id: 'brand-1' },
      organization: { id: 'org-1' },
      user: {
        id: 'user-1',
        is_super_admin: undefined,
        subscription_tier: 'pro',
      },
    });
  });

  it('describes an API key caller and flags super admins', () => {
    expect(
      describeApiRequest(
        createRequest(
          {
            apiKeyId: 'key-1',
            brandId: 'brand-1',
            id: 'user-1',
            isApiKey: true,
            organizationId: 'org-1',
            userId: '',
          },
          { isSuperAdmin: true },
        ),
      ),
    ).toMatchObject({
      api_key: { id: 'key-1' },
      auth_method: 'api_key',
      user: { id: 'user-1', is_super_admin: true },
    });
  });
});
