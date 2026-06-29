export interface GoogleSearchConsoleOAuthTokens {
  accessToken: string;
  expiresIn?: number;
  refreshToken?: string;
  tokenType?: string;
}

export interface GoogleSearchConsoleSitesResponse {
  siteEntry?: Array<{
    siteUrl?: string;
    permissionLevel?: string;
  }>;
}

export interface GoogleSearchConsoleSearchAnalyticsResponse {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
  responseAggregationType?: string;
}
