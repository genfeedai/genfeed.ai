import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  BeehiivProviderError,
  toBeehiivProviderError,
} from '@api/services/integrations/beehiiv/errors/beehiiv-provider.error';
import type {
  BeehiivCreatePostInput,
  BeehiivCreatePostResponse,
  BeehiivCreateSubscriberResponse,
  BeehiivGetPostResponse,
  BeehiivPost,
  BeehiivPublication,
  BeehiivPublicationsResponse,
  BeehiivSubscriber,
  BeehiivSubscriberOutcome,
  BeehiivSubscribersResponse,
} from '@api/services/integrations/beehiiv/interfaces/beehiiv.interface';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class BeehiivService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly apiBase: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiBase =
      this.configService.get('BEEHIIV_API_URL') ?? 'https://api.beehiiv.com/v2';
  }

  /**
   * List all publications for the given API key
   */
  async listPublications(apiKey: string): Promise<BeehiivPublication[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get<BeehiivPublicationsResponse>(
          `${this.apiBase}/publications`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        count: response.data.data?.length ?? 0,
      });
      return response.data.data || [];
    } catch (error: unknown) {
      this.rethrowProviderError(error, url);
    }
  }

  /**
   * Get subscribers for a publication
   */
  async getSubscribers(
    apiKey: string,
    publicationId: string,
    page?: number,
    limit?: number,
  ): Promise<BeehiivSubscribersResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const params: Record<string, string> = {};
      if (page !== undefined) {
        params.page = String(page);
      }
      if (limit !== undefined) {
        params.limit = String(limit);
      }

      const response = await firstValueFrom(
        this.httpService.get<BeehiivSubscribersResponse>(
          `${this.apiBase}/publications/${publicationId}/subscriptions`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            params,
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        count: response.data.data?.length ?? 0,
        publicationId,
      });
      return response.data;
    } catch (error: unknown) {
      this.rethrowProviderError(error, url, { publicationId });
    }
  }

  /**
   * Create a subscriber in a publication. Private 1:1 HTTP helper — product
   * callers use {@link createSubscribers}.
   */
  private async createSubscriber(
    apiKey: string,
    publicationId: string,
    email: string,
    utmSource?: string,
  ): Promise<BeehiivSubscriber> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const body: Record<string, unknown> = { email };
      if (utmSource) {
        body.utm_source = utmSource;
      }

      const response = await firstValueFrom(
        this.httpService.post<BeehiivCreateSubscriberResponse>(
          `${this.apiBase}/publications/${publicationId}/subscriptions`,
          body,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        publicationId,
        subscriberId: response.data.data?.id,
      });
      return response.data.data;
    } catch (error: unknown) {
      this.rethrowProviderError(error, url, { publicationId });
    }
  }

  /**
   * Add every requested address independently so one provider rejection does
   * not hide the outcome of the remaining addresses.
   */
  async createSubscribers(
    apiKey: string,
    publicationId: string,
    emails: readonly string[],
    utmSource?: string,
  ): Promise<BeehiivSubscriberOutcome[]> {
    const outcomes: BeehiivSubscriberOutcome[] = [];

    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      try {
        const subscriber = await this.createSubscriber(
          apiKey,
          publicationId,
          email,
          utmSource,
        );
        outcomes.push({
          email,
          id: email,
          status: subscriber.status,
          subscriberId: subscriber.id,
          success: true,
        });
      } catch (error: unknown) {
        const providerError = toBeehiivProviderError(error);
        outcomes.push({
          email,
          errorCode: providerError.code,
          errorMessage: providerError.message,
          id: email,
          isRetryable: providerError.isRetryable,
          success: false,
        });
      }
    }

    return outcomes;
  }

  /**
   * Create a post (email/newsletter) in a publication. Status is required so
   * Beehiiv's changing provider default can never alter execution semantics.
   */
  async createPost(
    apiKey: string,
    publicationId: string,
    input: BeehiivCreatePostInput,
  ): Promise<BeehiivPost> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    if (input.status === 'draft' && input.scheduledAt) {
      throw new BeehiivProviderError(
        'validation_failed',
        'Beehiiv draft posts cannot include a scheduled time.',
        { isRetryable: false },
      );
    }

    try {
      const body = {
        body_content: input.contentHtml,
        ...(input.scheduledAt
          ? { scheduled_at: input.scheduledAt.toISOString() }
          : {}),
        status: input.status,
        title: input.title,
      };
      const response = await firstValueFrom(
        this.httpService.post<BeehiivCreatePostResponse>(
          `${this.apiBase}/publications/${publicationId}/posts`,
          body,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        postId: response.data.data?.id,
        publicationId,
        status: input.status,
      });
      return response.data.data;
    } catch (error: unknown) {
      this.rethrowProviderError(error, url, { publicationId });
    }
  }

  /**
   * Get a specific post from a publication
   */
  async getPost(
    apiKey: string,
    publicationId: string,
    postId: string,
  ): Promise<BeehiivPost> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get<BeehiivGetPostResponse>(
          `${this.apiBase}/publications/${publicationId}/posts/${postId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        postId,
        publicationId,
      });
      return response.data.data;
    } catch (error: unknown) {
      this.rethrowProviderError(error, url, { postId, publicationId });
    }
  }

  /**
   * Get a decrypted API key from stored credentials
   */
  async getDecryptedApiKey(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<{ apiKey: string; publicationId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // API-key credentials never lose isConnected on a refresh failure, but a
      // publication that failed verification still has to be readable here.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.BEEHIIV,
    });

    if (!credential?.accessToken || !credential?.externalId) {
      this.loggerService.error(
        `${url} Beehiiv credential or publication ID not found`,
        {
          brandId,
          organizationId,
        },
      );
      throw new BeehiivProviderError(
        'authorization_failed',
        'Beehiiv credential or publication ID not found. Please reconnect your account.',
        { isRetryable: false },
      );
    }

    return {
      apiKey: EncryptionUtil.decrypt(credential.accessToken),
      publicationId: credential.externalId,
    };
  }

  private rethrowProviderError(
    error: unknown,
    logContext: string,
    metadata: Record<string, unknown> = {},
  ): never {
    const providerError = toBeehiivProviderError(error);
    this.loggerService.error(`${logContext} failed`, {
      code: providerError.code,
      isRetryable: providerError.isRetryable,
      ...metadata,
      statusCode: providerError.statusCode,
    });
    throw providerError;
  }
}
