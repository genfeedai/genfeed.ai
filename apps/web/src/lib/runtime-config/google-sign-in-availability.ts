import { isCloudDeployment } from '@genfeedai/config';

/**
 * Google sign-in needs OAuth client credentials. Genfeed Cloud always has them
 * (they live on the API, not on the web app, so the web app cannot confirm
 * them); a self-hosted install has them only when both `GOOGLE_OAUTH_CLIENT_ID`
 * and `GOOGLE_OAUTH_CLIENT_SECRET` are set, which is the same check the API
 * uses to register the provider. Without them the button only errors, so
 * self-hosted auth screens must not offer it.
 */
export function readGoogleSignInAvailableFromEnv(
  isCloud: boolean = isCloudDeployment(),
): boolean {
  return (
    isCloud ||
    Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
    )
  );
}
