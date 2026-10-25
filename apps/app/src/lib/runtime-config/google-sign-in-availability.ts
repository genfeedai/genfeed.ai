import { isCloudDeployment } from '@genfeedai/config';

/**
 * Google sign-in needs OAuth client credentials. Cloud always has them; a
 * self-hosted install has them only when both `GOOGLE_OAUTH_CLIENT_ID` and
 * `GOOGLE_OAUTH_CLIENT_SECRET` are set, which is the same check the API uses
 * to register the provider. Without them the button only errors, so the auth
 * screens must not offer it.
 */
export function readGoogleSignInAvailableFromEnv(): boolean {
  return (
    isCloudDeployment() ||
    Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
    )
  );
}
