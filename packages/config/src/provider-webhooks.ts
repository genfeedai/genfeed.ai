/**
 * Whether external AI providers can POST webhooks back to this deployment.
 *
 * Local Portless hosts (`*.genfeed.localhost`), loopback, and private LAN
 * addresses are never reachable from Replicate/Leonardo/etc. When this returns
 * false, callers must poll the provider API instead of waiting for a webhook.
 */
export function isProviderWebhookReachable(
  webhookBaseUrl?: string | null,
): boolean {
  const raw = webhookBaseUrl?.trim();
  if (!raw) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]'
  ) {
    return false;
  }

  // Portless / mDNS local TLDs
  if (host.endsWith('.localhost') || host.endsWith('.local')) {
    return false;
  }

  // RFC1918 private IPv4
  if (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }

  return url.protocol === 'https:' || url.protocol === 'http:';
}

/**
 * Resolve webhook reachability from the process environment.
 * Uses GENFEEDAI_WEBHOOKS_URL — the base providers append `/v1/webhooks/...` to.
 */
export function canReceiveProviderWebhooks(
  webhookBaseUrl: string | null | undefined = process.env
    .GENFEEDAI_WEBHOOKS_URL,
): boolean {
  return isProviderWebhookReachable(webhookBaseUrl);
}
