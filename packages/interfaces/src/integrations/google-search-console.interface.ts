export type GoogleSearchConsoleDimension =
  | 'query'
  | 'page'
  | 'country'
  | 'device'
  | 'date'
  | 'searchAppearance';

export interface GoogleSearchConsoleSite {
  _id?: string;
  siteUrl: string;
  permissionLevel: string;
}

export interface GoogleSearchConsoleSearchAnalyticsRow {
  keys: string[];
  query?: string;
  page?: string;
  country?: string;
  device?: string;
  date?: string;
  searchAppearance?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GoogleSearchConsoleSearchAnalyticsParams {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: GoogleSearchConsoleDimension[];
  rowLimit?: number;
  startRow?: number;
}

export interface GoogleSearchConsoleSearchAnalyticsResult {
  _id?: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: GoogleSearchConsoleDimension[];
  rows: GoogleSearchConsoleSearchAnalyticsRow[];
  responseAggregationType?: string;
}
