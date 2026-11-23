import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { SocialInboxQueryDto } from '@api/collections/social-inbox/dto/social-inbox-query.dto';
import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.service';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { traced } from '@libs/tracing/traced';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/** The organization, brand and user a Messages request acts for. */
export const buildSocialInboxScope = traced(
  'buildSocialInboxScope',
  (
    user: User,
    query: Pick<SocialInboxQueryDto, 'organizationId' | 'brandId'> = {},
    request?: Request,
    readScope?: ITenantReadScope,
  ): SocialInboxScope => {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    if (!user.organizationId) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }

    return {
      brandId: readScope
        ? readScope.brandId
        : (tenant.brandId ??
          (tenant.isOrganizationOverride ? undefined : user.brandId)),
      organizationId: readScope
        ? readScope.organizationId
        : tenant.organizationId,
      userId: user.userId ?? user.id,
    };
  },
);
