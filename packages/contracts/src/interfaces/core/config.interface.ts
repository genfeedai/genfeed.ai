export interface AppConfigOptions {
  appName: string;
  sentryProject: string;
  redirects?: Array<{
    source: string;
    destination: string;
    permanent?: boolean;
  }>;
  sassOptions?: Record<string, unknown>;
  customAlias?: Record<string, string>;
}
