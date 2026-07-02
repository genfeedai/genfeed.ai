import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type {
  GoogleSearchConsoleSearchAnalyticsResponse,
  GoogleSearchConsoleSitesResponse,
} from '@api/services/integrations/google-search-console/interfaces/google-search-console.interface';
import { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  GoogleSearchConsoleDimension,
  GoogleSearchConsoleSearchAnalyticsParams,
  GoogleSearchConsoleSearchAnalyticsResult,
  GoogleSearchConsoleSearchAnalyticsRow,
  GoogleSearchConsoleSite,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const DEFAULT_DIMENSIONS: GoogleSearchConsoleDimension[] = [
  'query',
  'page',
  'country',
  'device',
];

const ALLOWED_DIMENSIONS = new Set<GoogleSearchConsoleDimension>([
  'query',
  'page',
  'country',
  'device',
  'date',
  'searchAppearance',
]);

@Injectable()
export class GoogleSearchConsoleService {
  private readonly BASE_URL = 'https://www.googleapis.com/webmasters/v3';
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly googleSearchConsoleOAuthService: GoogleSearchConsoleOAuthService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  async listSites(accessToken: string): Promise<GoogleSearchConsoleSite[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<GoogleSearchConsoleSitesResponse>(
          `${this.BASE_URL}/sites`,
          {
            headers: this.getHeaders(accessToken),
            timeout: 10000,
          },
        ),
      );

      return (response.data.siteEntry ?? []).map((site) => ({
        _id: site.siteUrl ?? 'unknown',
        permissionLevel: site.permissionLevel ?? 'unknown',
        siteUrl: site.siteUrl ?? '',
      }));
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `${caller} failed: ${message}${status ? ` (HTTP ${status})` : ''}`,
      );
      throw error;
    }
  }

  async getSearchAnalytics(
    accessToken: string,
    params: GoogleSearchConsoleSearchAnalyticsParams,
  ): Promise<GoogleSearchConsoleSearchAnalyticsResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const dimensions = this.normalizeDimensions(params.dimensions);
    const rowLimit = this.normalizeRowLimit(params.rowLimit);
    const startRow = Math.max(0, params.startRow ?? 0);

    try {
      const response = await firstValueFrom(
        this.httpService.post<GoogleSearchConsoleSearchAnalyticsResponse>(
          `${this.BASE_URL}/sites/${encodeURIComponent(params.siteUrl)}/searchAnalytics/query`,
          {
            dimensions,
            endDate: params.endDate,
            rowLimit,
            startDate: params.startDate,
            startRow,
          },
          {
            headers: this.getHeaders(accessToken),
            timeout: 30000,
          },
        ),
      );

      return {
        _id: `${params.siteUrl}:${params.startDate}:${params.endDate}:${dimensions.join(',')}`,
        dimensions,
        endDate: params.endDate,
        responseAggregationType: response.data.responseAggregationType,
        rows: (response.data.rows ?? []).map((row) =>
          this.mapSearchAnalyticsRow(row, dimensions),
        ),
        siteUrl: params.siteUrl,
        startDate: params.startDate,
      };
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `${caller} failed: ${message}${status ? ` (HTTP ${status})` : ''}`,
      );
      throw error;
    }
  }

  async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const credential = await this.credentialsService.findOne({
      brand: brandId,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
    });

    if (!credential?.refreshToken) {
      throw new NotFoundException('Google Search Console credential');
    }

    try {
      const tokens =
        await this.googleSearchConsoleOAuthService.refreshAccessToken(
          EncryptionUtil.decrypt(credential.refreshToken),
        );

      return await this.credentialsService.patch(credential._id, {
        accessToken: tokens.accessToken,
        accessTokenExpiry: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : undefined,
        isConnected: true,
        isDeleted: false,
        refreshToken: tokens.refreshToken,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      await this.credentialsService.patch(credential._id, {
        isConnected: false,
      });
      throw error;
    }
  }

  private getHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private normalizeDimensions(
    dimensions?: GoogleSearchConsoleDimension[],
  ): GoogleSearchConsoleDimension[] {
    const requested = dimensions?.filter((dimension) =>
      ALLOWED_DIMENSIONS.has(dimension),
    );

    return requested?.length ? requested : DEFAULT_DIMENSIONS;
  }

  private normalizeRowLimit(rowLimit?: number): number {
    if (!rowLimit || Number.isNaN(rowLimit)) {
      return 100;
    }

    return Math.min(Math.max(rowLimit, 1), 25_000);
  }

  private mapSearchAnalyticsRow(
    row: NonNullable<
      GoogleSearchConsoleSearchAnalyticsResponse['rows']
    >[number],
    dimensions: GoogleSearchConsoleDimension[],
  ): GoogleSearchConsoleSearchAnalyticsRow {
    const keys = row.keys ?? [];
    const mapped: Partial<
      Pick<
        GoogleSearchConsoleSearchAnalyticsRow,
        'country' | 'date' | 'device' | 'page' | 'query' | 'searchAppearance'
      >
    > = {};

    dimensions.forEach((dimension, index) => {
      const value = keys[index];
      if (typeof value === 'string' && value.length > 0) {
        mapped[dimension] = value;
      }
    });

    return {
      ...mapped,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      impressions: row.impressions ?? 0,
      keys,
      position: row.position ?? 0,
    };
  }
}
