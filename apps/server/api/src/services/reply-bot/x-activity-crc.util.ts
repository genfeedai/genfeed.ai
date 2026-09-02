import { createHmac } from 'node:crypto';

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
