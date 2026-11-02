import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readRecordOrUndefined } from '@genfeedai/utils/data/extract.util';

/**
 * Meta signs every webhook delivery with `X-Hub-Signature-256: sha256=<hex>`,
 * the HMAC-SHA256 of the raw request body keyed with the app secret.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecrets: readonly string[],
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const received = Buffer.from(signatureHeader);

  return appSecrets.some((secret) => {
    const expected = Buffer.from(
      `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
    );

    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  });
}

/** Constant-time string comparison that does not leak the expected length. */
export function safeEqualStrings(received: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(received).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

/**
 * Instagram professional account ids that received a new inbound message in
 * this delivery. Echoes (messages the account itself sent), deletions, read
 * receipts, reactions and postbacks carry nothing the inbox needs to fetch.
 *
 * @see https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks
 */
export function extractInstagramInboundMessageAccountIds(
  payload: unknown,
): string[] {
  const body = readRecordOrUndefined(payload);
  if (body?.object !== 'instagram' || !Array.isArray(body.entry)) {
    return [];
  }

  const accountIds = new Set<string>();

  for (const rawEntry of body.entry) {
    const entry = readRecordOrUndefined(rawEntry);
    const accountId = entry?.id;
    if (
      typeof accountId !== 'string' ||
      accountId.length === 0 ||
      !Array.isArray(entry?.messaging)
    ) {
      continue;
    }

    const hasInboundMessage = entry.messaging.some((rawEvent) => {
      const message = readRecordOrUndefined(
        readRecordOrUndefined(rawEvent)?.message,
      );
      return (
        message !== undefined &&
        message.is_echo !== true &&
        message.is_deleted !== true
      );
    });

    if (hasInboundMessage) {
      accountIds.add(accountId);
    }
  }

  return [...accountIds];
}
