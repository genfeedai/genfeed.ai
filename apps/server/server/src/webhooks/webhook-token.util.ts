import { timingSafeEqual } from 'node:crypto';
import type { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Extract the credential from an `Authorization: Bearer <token>` header.
 * Returns undefined for any other scheme so a stray `Basic`/`Digest` header
 * never gets compared against the webhook secret.
 */
function resolveBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer') {
    return undefined;
  }

  return token?.trim() || undefined;
}

/**
 * Shared-secret verification for provider webhooks whose vendors do not give
 * us a documented HMAC scheme (HeyGen, KlingAI, OpusPro, Leonardo.Ai). We
 * control the callback URL registered with each vendor, so the secret travels
 * as a `token` query parameter (or `x-webhook-token` header) and is compared
 * in constant time.
 *
 * These routes are `@Public()`, so this check is the *only* thing standing
 * between the public internet and a job-completion handler that writes media
 * records. It therefore fails closed: an unconfigured secret rejects the
 * callback rather than accepting it. The rejection reuses the generic
 * client-facing message so an anonymous caller cannot probe which deployments
 * have provisioned a secret; the actionable detail (which environment variable
 * to set) is logged server-side instead.
 */
export function assertWebhookToken(options: {
  /**
   * Additionally accept the secret as `Authorization: Bearer <secret>`.
   * Opt-in per vendor: only widen the accepted credential surface for
   * providers that document that transport (Leonardo.Ai). Safe on `@Public()`
   * routes, which short-circuit `CombinedAuthGuard` before it inspects the
   * Authorization header.
   */
  acceptBearerHeader?: boolean;
  configuredSecret: string | undefined;
  loggerService: LoggerService;
  request: Request;
  /**
   * Name of the environment variable holding this vendor's secret. Only ever
   * used in the server-side log line, so a misconfigured deployment gets a
   * message it can act on instead of a bare 401.
   */
  secretEnvVar: string;
  url: string;
}): void {
  const {
    acceptBearerHeader,
    configuredSecret,
    loggerService,
    request,
    secretEnvVar,
    url,
  } = options;

  // The config schema allows an empty string, so treat blank as unset.
  if (!configuredSecret?.trim()) {
    loggerService.error(
      `${url} webhook rejected — ${secretEnvVar} is not configured. Set it and re-register the vendor callback URL, otherwise this provider's callbacks cannot be authenticated.`,
    );
    throw new UnauthorizedException('Invalid webhook token');
  }

  const provided =
    (request.query?.token as string | undefined) ??
    (request.headers['x-webhook-token'] as string | undefined) ??
    (acceptBearerHeader
      ? resolveBearerToken(request.headers?.authorization)
      : undefined);

  if (!provided) {
    throw new UnauthorizedException('Missing webhook token');
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(configuredSecret);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new UnauthorizedException('Invalid webhook token');
  }
}

/**
 * Append the shared-secret token to a vendor callback URL. No-op when the
 * secret is not configured.
 *
 * Deliberately does not throw: most callers build their callback URL in a
 * constructor, so failing here would take down DI at boot for deployments that
 * never touch this vendor. The un-tokenised URL is instead rejected inbound by
 * `assertWebhookToken`, which confines the blast radius to the one provider
 * whose secret is actually missing and logs the variable to set.
 */
export function appendWebhookToken(
  callbackUrl: string,
  secret: string | undefined,
): string {
  if (!secret) {
    return callbackUrl;
  }

  const separator = callbackUrl.includes('?') ? '&' : '?';

  return `${callbackUrl}${separator}token=${encodeURIComponent(secret)}`;
}
