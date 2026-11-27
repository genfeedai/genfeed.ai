import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { GoogleAdsSelectableAccount } from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { normalizeGoogleAdsCustomerId } from '@api/services/integrations/google-ads/services/google-ads-customer-id.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';

const MANAGER_CLIENTS_QUERY =
  "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'";

interface ManagerClientRow {
  customerClient: {
    currencyCode?: string;
    descriptiveName?: string;
    id: string;
  };
}

/** Google refused to show this manager's clients to this login. */
function isManagerUnreadable(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return (
    status === HttpStatus.BAD_REQUEST ||
    status === HttpStatus.FORBIDDEN ||
    status === HttpStatus.NOT_FOUND
  );
}

export interface GoogleAdsPendingAccount extends GoogleAdsSelectableAccount {
  /** Another live credential of the brand already holds this account. */
  isAlreadyConnected: boolean;
}

/**
 * Which Google Ads account a connection reads campaigns from. A Google login
 * can reach several accounts, and a manager account has no campaigns of its
 * own, so the operator picks one client account instead of the first being
 * taken silently.
 */
@Traced()
@Injectable()
export class GoogleAdsAccountsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * The accounts this Google login can read campaigns from: every directly
   * accessible client account, plus the enabled client accounts under each
   * directly accessible manager account. A client reachable both ways is
   * listed once, as a direct account.
   */
  async listSelectable(
    accessToken: string,
  ): Promise<GoogleAdsSelectableAccount[]> {
    const customers =
      await this.googleAdsService.listAccessibleCustomers(accessToken);
    const selectable = new Map<string, GoogleAdsSelectableAccount>();

    for (const customer of customers) {
      if (!customer.isManager) {
        selectable.set(normalizeGoogleAdsCustomerId(customer.id), {
          currencyCode: customer.currencyCode,
          id: customer.id,
          name: customer.descriptiveName || customer.id,
        });
      }
    }

    for (const manager of customers.filter((customer) => customer.isManager)) {
      let clients: ManagerClientRow[] = [];
      try {
        clients = await this.googleAdsService.executeGaql<ManagerClientRow>(
          accessToken,
          manager.id,
          MANAGER_CLIENTS_QUERY,
          manager.id,
        );
      } catch (error: unknown) {
        // A manager this login may not read is skipped. Anything else (an
        // outage, rate limit or network failure) would hand back a partial
        // list that verify could mistake for the whole account set.
        if (!isManagerUnreadable(error)) {
          throw error;
        }
        this.loggerService.warn(
          `${this.constructorName}: Could not list clients of manager ${manager.id}`,
          { error: error instanceof Error ? error.message : String(error) },
        );
      }

      for (const { customerClient } of clients) {
        const key = normalizeGoogleAdsCustomerId(customerClient.id);
        if (selectable.has(key)) {
          continue;
        }
        selectable.set(key, {
          currencyCode: customerClient.currencyCode,
          id: customerClient.id,
          managerId: manager.id,
          managerName: manager.descriptiveName || manager.id,
          name: customerClient.descriptiveName || customerClient.id,
        });
      }
    }

    return [...selectable.values()];
  }

  /** `listSelectable`, with a provider failure mapped to a client-safe error. */
  async listOrExplain(
    accessToken: string,
  ): Promise<GoogleAdsSelectableAccount[]> {
    try {
      return await this.listSelectable(accessToken);
    } catch (error: unknown) {
      throw this.toVerifyException(error, 'Customer lookup failed');
    }
  }

  /** The accounts a pending connection can still choose from. */
  async listForPending(
    user: User,
    credentialId: string,
  ): Promise<GoogleAdsPendingAccount[]> {
    const credential = await this.requirePendingCredential(user, credentialId);
    const accounts = await this.listOrExplain(
      EncryptionUtil.decrypt(credential.accessToken as string),
    );
    const held = credential.brandId
      ? await this.credentialsService.findConnectedAccounts(
          user.organizationId,
          credential.brandId,
          CredentialPlatform.GOOGLE_ADS,
        )
      : [];
    const heldIds = new Set(
      held
        .filter((account) => account.id !== credential.id)
        .map((account) => account.externalId),
    );

    return accounts.map((account) => ({
      ...account,
      isAlreadyConnected: heldIds.has(account.id),
    }));
  }

  /**
   * Settle a pending connection onto the chosen account. The account is read
   * again from Google, never trusted from the caller, so an id this login
   * does not reach is rejected.
   */
  async selectForPending(
    user: User,
    credentialId: string,
    customerId: string,
  ): Promise<CredentialDocument> {
    const owned = await this.findOwnedCredential(user, credentialId);
    const wanted = normalizeGoogleAdsCustomerId(customerId);
    // A repeat of a selection that already went through (the response was
    // lost) returns the connected credential instead of an error.
    if (
      owned.isConnected &&
      owned.externalId &&
      normalizeGoogleAdsCustomerId(owned.externalId) === wanted
    ) {
      return owned;
    }
    const credential = this.requirePending(owned);
    const accounts = await this.listOrExplain(
      EncryptionUtil.decrypt(credential.accessToken as string),
    );
    const chosen = accounts.find(
      (account) => normalizeGoogleAdsCustomerId(account.id) === wanted,
    );

    if (!chosen) {
      throw new HttpException(
        {
          detail:
            'This Google Ads account is not available to this Google login. Connect again and choose another.',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.connectAccount(credential, chosen, {});
  }

  /**
   * Connects the credential to the account. A client reached through a
   * manager keeps the manager's id, because every read of it sends that id as
   * the `login-customer-id` header.
   */
  async connectAccount(
    credential: CredentialDocument,
    account: GoogleAdsSelectableAccount,
    connection: Record<string, unknown>,
  ): Promise<CredentialDocument> {
    return this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId as string,
      {
        handle: account.name,
        id: account.id,
        name: account.name,
      },
      {
        ...connection,
        externalParentId: account.managerId ?? null,
      },
    );
  }

  /**
   * Maps a provider failure during OAuth verify to a client-safe HttpException.
   * A provider 400/401/403 means the code or token is no longer usable and the
   * user must reconnect; anything else is an upstream failure.
   */
  toVerifyException(error: unknown, title: string): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    const providerStatus = isAxiosError(error) ? error.response?.status : null;
    const isProviderRejection =
      providerStatus === HttpStatus.BAD_REQUEST ||
      providerStatus === HttpStatus.UNAUTHORIZED ||
      providerStatus === HttpStatus.FORBIDDEN;

    this.loggerService.warn(`${this.constructorName} verify failed: ${title}`, {
      providerStatus: providerStatus ?? null,
    });

    return new HttpException(
      {
        detail: isProviderRejection
          ? 'Google rejected the authorization. Reconnect Google Ads and try again.'
          : 'Google Ads is temporarily unavailable. Try again shortly.',
        title,
      },
      isProviderRejection ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY,
    );
  }

  private async requirePendingCredential(
    user: User,
    credentialId: string,
  ): Promise<CredentialDocument> {
    return this.requirePending(
      await this.findOwnedCredential(user, credentialId),
    );
  }

  /**
   * The caller's own Google Ads credential. A brand-restricted key reaches
   * only its brands, and the key guard cannot see a brand through a
   * credential id, so the check lives here; a miss reads as not found.
   */
  private async findOwnedCredential(
    user: User,
    credentialId: string,
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.GOOGLE_ADS,
    });

    const isBrandAllowed =
      !user.allowedBrandIds ||
      (credential?.brandId != null &&
        user.allowedBrandIds.includes(credential.brandId));
    if (!credential || credential.isDeleted || !isBrandAllowed) {
      throw new NotFoundException({
        message: 'Google Ads credential not found',
      });
    }
    return credential;
  }

  /**
   * A pending credential holds a token and was never settled onto an account.
   * Anything else must reconnect, so this cannot repoint a live connection.
   */
  private requirePending(credential: CredentialDocument): CredentialDocument {
    if (credential.isConnected || credential.externalId) {
      throw new HttpException(
        {
          detail:
            'This credential is already connected to an account. Disconnect and reconnect to choose a different one.',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!credential.accessToken) {
      throw new HttpException(
        {
          detail: 'Google Ads is not connected. Connect again.',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return credential;
  }
}
