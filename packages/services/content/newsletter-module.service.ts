import type { NewsletterSendAction } from '@genfeedai/contracts/constants';
import type {
  IBrandSubscriber,
  IBrandSubscriberImportSummary,
  IBrandSubscriberStats,
  INewsletterAnalytics,
  INewsletterEmailPreview,
  INewsletterSend,
  INewsletterSettings,
  INewsletterUsage,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import { extractCollection } from '@services/core/json-api';
import { toPaginatedResponse } from '@services/core/paginated-response';

export class BrandSubscriberRecord implements IBrandSubscriber {
  id!: string;
  brandId!: string;
  email!: string;
  name!: string | null;
  tags!: string[];
  status!: IBrandSubscriber['status'];
  source!: string;
  sourceRef!: string | null;
  consentMethod!: string | null;
  consentAt!: string | null;
  confirmedAt!: string | null;
  unsubscribedAt!: string | null;
  bouncedAt!: string | null;
  complainedAt!: string | null;
  createdAt!: string;

  constructor(partial: Partial<IBrandSubscriber>) {
    Object.assign(this, partial);
    this.tags = partial.tags ?? [];
  }
}

export interface BrandSubscribersQuery {
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
  tag?: string;
}

export interface ImportBrandSubscribersInput {
  csv: string;
  fileName?: string;
  hasConsent?: boolean;
  isPreview?: boolean;
}

export type UpdateNewsletterSettingsInput = Partial<
  Omit<INewsletterSettings, 'brandId'>
>;

/**
 * The brand Newsletter module (#9722): audience, sends, sending settings and
 * analytics. Every path is brand-scoped; the API checks brand access.
 */
export class NewsletterModuleService extends BaseService<BrandSubscriberRecord> {
  constructor(token: string) {
    super('', token, BrandSubscriberRecord);
  }

  public static getInstance(token: string): NewsletterModuleService {
    return BaseService.getDataServiceInstance(NewsletterModuleService, token);
  }

  private brandPath(brandId: string, path: string): string {
    return `/brands/${encodeURIComponent(brandId)}/newsletter/${path}`;
  }

  async listSubscribers(
    brandId: string,
    query: BrandSubscribersQuery = {},
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<BrandSubscriberRecord>> {
    const path = this.brandPath(brandId, 'subscribers');
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<JsonApiResponseDocument>(path, { params: query, signal })
        .then((response) => this.mapPage(response.data)),
    );
  }

  async getSubscriberStats(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IBrandSubscriberStats> {
    const path = this.brandPath(brandId, 'subscribers/stats');
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<{ data: IBrandSubscriberStats }>(path, { signal })
        .then((response) => response.data.data),
    );
  }

  async addSubscribers(
    brandId: string,
    input: { emails: string[]; hasConsent: boolean; tags?: string[] },
  ): Promise<IBrandSubscriberImportSummary> {
    const path = this.brandPath(brandId, 'subscribers');
    return this.executeWithErrorHandling(
      `POST ${path}`,
      this.instance
        .post<{ data: IBrandSubscriberImportSummary }>(path, input)
        .then((response) => response.data.data),
    );
  }

  async importSubscribers(
    brandId: string,
    input: ImportBrandSubscribersInput,
  ): Promise<IBrandSubscriberImportSummary> {
    const path = this.brandPath(brandId, 'subscribers/imports');
    return this.executeWithErrorHandling(
      `POST ${path}`,
      this.instance
        .post<{ data: IBrandSubscriberImportSummary }>(path, input)
        .then((response) => response.data.data),
    );
  }

  async exportSubscribers(brandId: string): Promise<string> {
    const path = this.brandPath(brandId, 'subscribers/export');
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<string>(path, {
          responseType: 'text',
          transformResponse: [(value: string) => value],
        })
        .then((response) => response.data),
    );
  }

  async removeSubscriber(brandId: string, subscriberId: string): Promise<void> {
    const path = this.brandPath(
      brandId,
      `subscribers/${encodeURIComponent(subscriberId)}`,
    );
    await this.executeWithErrorHandling(
      `DELETE ${path}`,
      this.instance.delete(path),
    );
  }

  async resendConfirmation(
    brandId: string,
    subscriberId: string,
  ): Promise<void> {
    const path = this.brandPath(
      brandId,
      `subscribers/${encodeURIComponent(subscriberId)}/confirmation`,
    );
    await this.executeWithErrorHandling(
      `POST ${path}`,
      this.instance.post(path),
    );
  }

  async getSettings(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<INewsletterSettings> {
    const path = this.brandPath(brandId, 'settings');
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<JsonApiResponseDocument>(path, { signal })
        .then((response) =>
          this.extractResource<INewsletterSettings>(response.data),
        ),
    );
  }

  async updateSettings(
    brandId: string,
    input: UpdateNewsletterSettingsInput,
  ): Promise<INewsletterSettings> {
    const path = this.brandPath(brandId, 'settings');
    return this.executeWithErrorHandling(
      `PATCH ${path}`,
      this.instance
        .patch<JsonApiResponseDocument>(path, input)
        .then((response) =>
          this.extractResource<INewsletterSettings>(response.data),
        ),
    );
  }

  async getUsage(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<INewsletterUsage> {
    const path = this.brandPath(brandId, 'usage');
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<{ data: INewsletterUsage }>(path, { signal })
        .then((response) => response.data.data),
    );
  }

  async getAnalytics(
    brandId: string,
    range: { from?: string; to?: string } = {},
    signal?: AbortSignal,
  ): Promise<INewsletterAnalytics> {
    const path = this.brandPath(brandId, 'analytics');
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<{ data: INewsletterAnalytics }>(path, { params: range, signal })
        .then((response) => response.data.data),
    );
  }

  async listSends(
    brandId: string,
    query: { limit?: number; newsletterId?: string; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<INewsletterSend>> {
    const path = this.brandPath(brandId, 'sends');
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<JsonApiResponseDocument>(path, { params: query, signal })
        .then((response) =>
          toPaginatedResponse(
            extractCollection<INewsletterSend>(response.data),
            response.data,
          ),
        ),
    );
  }

  async sendIssue(
    newsletterId: string,
    input: { scheduledFor?: string } = {},
  ): Promise<INewsletterSend> {
    const path = `/newsletters/${encodeURIComponent(newsletterId)}/sends`;
    return this.executeWithErrorHandling(
      `POST ${path}`,
      this.instance
        .post<JsonApiResponseDocument>(path, input)
        .then((response) =>
          this.extractResource<INewsletterSend>(response.data),
        ),
    );
  }

  async controlSend(
    sendId: string,
    action: NewsletterSendAction,
  ): Promise<INewsletterSend> {
    const path = `/newsletter-sends/${encodeURIComponent(sendId)}`;
    return this.executeWithErrorHandling(
      `PATCH ${path}`,
      this.instance
        .patch<JsonApiResponseDocument>(path, { action })
        .then((response) =>
          this.extractResource<INewsletterSend>(response.data),
        ),
    );
  }

  async getEmailPreview(
    newsletterId: string,
    isGated = false,
    signal?: AbortSignal,
  ): Promise<INewsletterEmailPreview> {
    const path = `/newsletters/${encodeURIComponent(newsletterId)}/email-preview`;
    return this.executeWithErrorHandling(
      `GET ${path}`,
      this.instance
        .get<{ data: INewsletterEmailPreview }>(path, {
          params: { gated: isGated },
          signal,
        })
        .then((response) => response.data.data),
    );
  }

  async sendTest(newsletterId: string): Promise<{ to: string }> {
    const path = `/newsletters/${encodeURIComponent(newsletterId)}/test-send`;
    return this.executeWithErrorHandling(
      `POST ${path}`,
      this.instance
        .post<{ data: { to: string } }>(path)
        .then((response) => response.data.data),
    );
  }
}
