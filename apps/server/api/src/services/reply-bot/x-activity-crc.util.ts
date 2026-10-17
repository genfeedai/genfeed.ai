import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * X Account Activity / V2 Webhooks CRC response token.
 * response_token = "sha256=" + base64(HMAC-SHA256(crc_token, consumer_secret))
 *
 * @see https://docs.x.com/x-api/webhooks/introduction
 */
export function buildXActivityCrcResponseToken(
  crcToken: string,
  consumerSecret: string,
): string {
  const digest = createHmac('sha256', consumerSecret)
    .update(crcToken, 'utf8')
    .digest('base64');
  return `sha256=${digest}`;
}

export function buildXActivityCrcResponseBody(
  crcToken: string,
  consumerSecret: string,
): { response_token: string } {
  return {
    response_token: buildXActivityCrcResponseToken(crcToken, consumerSecret),
  };
}

/**
 * Event deliveries carry `x-twitter-webhooks-signature: sha256=<base64>`, the
 * HMAC-SHA256 of the raw request body keyed with the consumer secret.
 */
export function verifyXActivitySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  consumerSecret: string,
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expected = Buffer.from(
    `sha256=${createHmac('sha256', consumerSecret).update(rawBody).digest('base64')}`,
  );
  const received = Buffer.from(signatureHeader);

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
