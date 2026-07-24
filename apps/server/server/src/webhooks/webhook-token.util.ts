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
 * When no secret is configured the callback is accepted with a warning so
 * existing deployments keep working until the secret is provisioned.
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
  url: string;
}): void {
  const { acceptBearerHeader, configuredSecret, loggerService, request, url } =
    options;

  if (!configuredSecret) {
    loggerService.warn(
      `${url} webhook token not configured — accepting unauthenticated callback`,
    );
    return;
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
