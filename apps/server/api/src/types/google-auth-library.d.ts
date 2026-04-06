declare module 'google-auth-library' {
  export class OAuth2Client {
    constructor(clientId?: string, clientSecret?: string, redirectUri?: string);
    setCredentials(credentials: {
      access_token?: string;
      refresh_token?: string;
      expiry_date?: number;
    }): void;
    getAccessToken(): Promise<{ token?: string | null; res?: unknown }>;
    refreshAccessToken(): Promise<{ credentials: unknown; res?: unknown }>;
    generateAuthUrl(opts?: {
      access_type?: string;
      scope?: string | string[];
      state?: string;
      redirect_uri?: string;
    }): string;
    getToken(code: string): Promise<{ tokens: unknown; res?: unknown }>;
    credentials: {
      access_token?: string | null;
      refresh_token?: string | null;
      expiry_date?: number | null;
    };
  }
}
