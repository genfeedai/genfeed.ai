import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface BeehiivPublication {
  id: string;
  name: string;
  description: string;
  url: string;
  created: number;
}

interface BeehiivPublicationsResponse {
  data: BeehiivPublication[];
  total_results: number;
}

interface BeehiivSubscriber {
  id: string;
  email: string;
  status: string;
  created: number;
  utm_source: string;
}

interface BeehiivSubscribersResponse {
  data: BeehiivSubscriber[];
  total_results: number;
  page: number;
  limit: number;
}

interface BeehiivCreateSubscriberResponse {
  data: BeehiivSubscriber;
}

interface BeehiivPost {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  publish_date: number;
  web_url: string;
  content_html: string;
}

interface BeehiivCreatePostResponse {
  data: BeehiivPost;
}

interface BeehiivGetPostResponse {
  data: BeehiivPost;
}

@Injectable()
export class BeehiivService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly apiBase: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
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
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
      });
      throw error;
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
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
        publicationId,
      });
      throw error;
    }
  }

  /**
   * Create a subscriber in a publication
   */
  async createSubscriber(
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
        email,
        publicationId,
        subscriberId: response.data.data?.id,
      });
      return response.data.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
        publicationId,
      });
      throw error;
    }
  }

  /**
   * Create a post (email/newsletter) in a publication
   * Status can be 'draft' or 'confirmed' (published)
   */
  async createPost(
    apiKey: string,
    publicationId: string,
    title: string,
    contentHtml: string,
    status: 'draft' | 'confirmed' = 'draft',
  ): Promise<BeehiivPost> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.post<BeehiivCreatePostResponse>(
          `${this.apiBase}/publications/${publicationId}/posts`,
          {
            content_html: contentHtml,
            status,
            title,
          },
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
        status,
      });
      return response.data.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
        publicationId,
      });
      throw error;
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
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
        postId,
        publicationId,
      });
      throw error;
    }
  }

  /**
   * Get a decrypted API key from stored credentials
   */
  async getDecryptedApiKey(
    organizationId: string,
    brandId: string,
  ): Promise<{ apiKey: string; publicationId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.findOne({
      brand: brandId,
      isDeleted: false,
      organization: organizationId,
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
      throw new Error(
        'Beehiiv credential or publication ID not found. Please reconnect your account.',
      );
    }

    return {
      apiKey: EncryptionUtil.decrypt(credential.accessToken),
      publicationId: credential.externalId,
    };
  }
}
