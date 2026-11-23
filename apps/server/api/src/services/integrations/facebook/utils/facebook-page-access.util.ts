import type { ServerCredentialStore } from '@api/server.dependencies';
import { requireMetaScopes } from '@api/services/integrations/_shared/meta-page-access.util';
import type { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';
import { BadRequestException } from '@nestjs/common';

/** What a call as a connected Facebook Page needs: the Page and its token. */
export interface FacebookPageAccess {
  grantedScopes: readonly string[] | undefined;
  pageId: string;
  pageToken: string;
}

export interface FacebookPageAccessDeps {
  credentialsService: ServerCredentialStore;
  facebookService: Pick<FacebookService, 'getUserPages'>;
}

export interface FacebookPageScope {
  brandId: string;
  credentialId: string;
  organizationId: string;
}

/**
 * The Page a Facebook credential is bound to and its token. A grant that
 * lacks a required permission is refused before any call, with a message that
 * asks the user to reconnect.
 */
export const resolveFacebookPageAccess = traced(
  'resolveFacebookPageAccess',
  async (
    deps: FacebookPageAccessDeps,
    scope: FacebookPageScope,
    requiredScopes: readonly string[] = [],
  ): Promise<FacebookPageAccess> => {
    const credential = await deps.credentialsService.resolveBrandAccount({
      brandId: scope.brandId,
      credentialId: scope.credentialId,
      organizationId: scope.organizationId,
      platform: CredentialPlatform.FACEBOOK,
    });
    if (!credential?.externalId) {
      throw new BadRequestException(
        'This Facebook connection is not bound to a Page. Reconnect it and choose a Page.',
      );
    }
    requireMetaScopes(credential.grantedScopes, requiredScopes);

    const pages = await deps.facebookService.getUserPages(
      scope.organizationId,
      scope.brandId,
      credential.id,
    );
    const pageToken = pages.find(
      (page) => page.id === credential.externalId,
    )?.accessToken;
    if (!pageToken) {
      throw new BadRequestException(
        'Facebook no longer lets this account manage the connected Page. Reconnect it.',
      );
    }

    return {
      grantedScopes: credential.grantedScopes,
      pageId: credential.externalId,
      pageToken,
    };
  },
);
