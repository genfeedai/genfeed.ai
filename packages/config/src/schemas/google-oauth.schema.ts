import { conditionalRequired } from '../helpers';

/**
 * Shared Google OAuth application credentials.
 *
 * One Google Cloud OAuth client serves first-party sign-in plus the YouTube,
 * Google Ads, and Search Console connectors. Each connector keeps its own
 * redirect URI and scopes while sharing this provider-level client identity.
 */
export const googleOAuthSchema = {
  GOOGLE_OAUTH_CLIENT_ID: conditionalRequired(),
  GOOGLE_OAUTH_CLIENT_SECRET: conditionalRequired(),
};
