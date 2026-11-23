import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  IFacebookManagedPage,
  IFacebookPageCandidate,
} from '@genfeedai/contracts/interfaces/integrations/facebook.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';

/**
 * A Facebook credential is one Page: the Page is the channel posts, comments
 * and messages belong to. This service settles a connection that holds a user
 * token onto the Pages the account manages.
 */
@Traced()
@Injectable()
export class FacebookPageConnectionService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly facebookService: FacebookService,
    private readonly loggerService: LoggerService,
  ) {}

  async listPagesOrExplain(
    accessToken: string,
  ): Promise<IFacebookManagedPage[]> {
    try {
      return await this.facebookService.listManagedPages(accessToken);
    } catch (error: unknown) {
      this.loggerService.error('Facebook Page listing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new BadGatewayException(
        'Facebook could not list your Pages. Please try connecting again.',
      );
    }
  }

  /**
   * A pending credential holds a token and was never settled onto a Page.
   * Anything else must reconnect, so this cannot repoint a live channel onto
   * another Page of the same Facebook account.
   */
  async requirePendingCredential(
    organizationId: string,
    credentialId: string,
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId,
      platform: CredentialPlatform.FACEBOOK,
    });

    if (!credential || credential.isDeleted) {
      throw new NotFoundException('Facebook credential', credentialId);
    }
    if (credential.isConnected || credential.externalId) {
      throw new BadRequestException(
        'This credential is already connected to a Page. Disconnect and reconnect to choose a different one.',
      );
    }
    if (!credential.accessToken) {
      throw new BadRequestException(
        'Facebook is not connected. Connect again.',
      );
    }
    return credential;
  }

  /**
   * The Pages a pending connection can choose from. Pages another live
   * credential of the brand already holds stay listed (choosing one is a
   * deliberate reconnect), but are flagged.
   */
  async listCandidates(
    organizationId: string,
    credentialId: string,
  ): Promise<IFacebookPageCandidate[]> {
    const credential = await this.requirePendingCredential(
      organizationId,
      credentialId,
    );
    const pages = await this.listPagesOrExplain(
      EncryptionUtil.decrypt(credential.accessToken as string),
    );
    const held = credential.brandId
      ? await this.credentialsService.findConnectedAccounts(
          organizationId,
          credential.brandId,
          CredentialPlatform.FACEBOOK,
        )
      : [];
    const heldIds = new Set(
      held
        .filter((account) => account.id !== credential.id)
        .map((account) => account.externalId),
    );
    return pages.map((page) => ({
      ...page,
      isAlreadyConnected: heldIds.has(page.id),
    }));
  }

  /**
   * Settle a pending connection onto the chosen Pages. Names are read again
   * from Facebook, never trusted from the caller.
   */
  async connectChosen(
    organizationId: string,
    credentialId: string,
    pageIds: readonly string[],
  ): Promise<CredentialDocument[]> {
    const credential = await this.requirePendingCredential(
      organizationId,
      credentialId,
    );
    const authorized = await this.listPagesOrExplain(
      EncryptionUtil.decrypt(credential.accessToken as string),
    );
    const byId = new Map(authorized.map((page) => [page.id, page]));
    const chosen = pageIds.flatMap((id) => {
      const page = byId.get(id);
      return page ? [page] : [];
    });

    if (chosen.length !== pageIds.length) {
      throw new BadRequestException(
        'A selected Page is not available to this Facebook account. Reconnect and try again.',
      );
    }

    return this.connectPages(credential, chosen);
  }

  /**
   * The first Page takes this credential and each further one becomes its own
   * credential on the brand, carrying a copy of the one Facebook grant so each
   * can be disconnected on its own.
   */
  async connectPages(
    credential: CredentialDocument,
    pages: readonly IFacebookManagedPage[],
  ): Promise<CredentialDocument[]> {
    const [first, ...others] = pages;
    if (!first) {
      return [];
    }
    const { brandId, organizationId, userId } = credential;
    if (!organizationId) {
      throw new BadRequestException('This connection has no organization.');
    }
    if (others.length > 0 && (!brandId || !userId)) {
      throw new BadRequestException(
        'This connection is missing its brand or owner, so it can connect only one Page. Choose one, or reconnect from the brand.',
      );
    }

    const connected = [
      await this.credentialsService.connectAccount(
        credential.id,
        organizationId,
        toProfile(first),
      ),
    ];

    if (!brandId || !userId) {
      return connected;
    }

    const accessToken = EncryptionUtil.decrypt(
      credential.accessToken as string,
    );
    for (const page of others) {
      let siblingId: string | undefined;
      try {
        const sibling = await this.credentialsService.createPendingForBrand(
          { id: brandId, organizationId },
          userId,
          CredentialPlatform.FACEBOOK,
        );
        siblingId = sibling.id;
        connected.push(
          await this.credentialsService.connectAccount(
            siblingId,
            organizationId,
            toProfile(page),
            {
              accessToken,
              accessTokenExpiry: credential.accessTokenExpiry ?? null,
              grantedScopes: credential.grantedScopes ?? [],
              grantedScopesCapturedAt:
                credential.grantedScopesCapturedAt ?? null,
            },
          ),
        );
      } catch (error: unknown) {
        this.loggerService.warn(
          'Facebook could not connect an additional Page',
          { error: error instanceof Error ? error.message : String(error) },
        );
        if (siblingId) {
          await this.credentialsService
            .patch(siblingId, { accessToken: null, isDeleted: true })
            .catch(() => undefined);
        }
      }
    }

    return connected;
  }
}

function toProfile(page: IFacebookManagedPage) {
  return {
    avatarUrl: page.picture,
    // A Page has a public name but Genfeed does not request its @handle.
    handle: undefined,
    id: page.id,
    name: page.name,
  };
}
