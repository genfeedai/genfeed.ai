import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';
import {
  createLocalJWKSet,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';
import { z } from 'zod';

const METADATA_MAX_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const MIN_CACHE_MS = 60_000;
const MAX_CACHE_MS = 60 * 60_000;
const DEFAULT_CACHE_MS = 5 * 60_000;
/** An unknown `kid` forces a refetch, at most this often per issuer. */
const UNKNOWN_KID_REFETCH_MS = 30_000;
const MAX_CACHED_ISSUERS = 256;

const discoverySchema = z.object({
  issuer: z.string(),
  jwks_uri: z.string().max(2048),
});

const jwksSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown())).max(100),
});

type CachedKeys = {
  expiresAt: number;
  fetchedAt: number;
  jwks: JSONWebKeySet;
};

export class IssuerKeysError extends Error {}

function cacheTtlMs(response: Response): number {
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (/(?:^|,)\s*(?:no-store|no-cache)(?:\s|,|$)/i.test(cacheControl)) {
    return MIN_CACHE_MS;
  }
  const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl)?.[1];
  const ttl = maxAge === undefined ? DEFAULT_CACHE_MS : Number(maxAge) * 1000;
  return Math.min(Math.max(ttl, MIN_CACHE_MS), MAX_CACHE_MS);
}

async function readJson(
  response: Response,
): Promise<{ body: unknown; ttl: number }> {
  if (
    !response.ok ||
    Number(response.headers.get('content-length') ?? 0) > METADATA_MAX_BYTES
  ) {
    await response.body?.cancel();
    throw new IssuerKeysError('Issuer document request failed');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new IssuerKeysError('Issuer document was empty');
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > METADATA_MAX_BYTES) {
        throw new IssuerKeysError('Issuer document too large');
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return {
    body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
    ttl: cacheTtlMs(response),
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Signing keys of a trusted assertion issuer, found through the issuer's own
 * `<issuer>/.well-known/openid-configuration` document. Keys named by the
 * assertion itself are never used. Every fetch goes through the outbound
 * destination guard because the issuer URL is customer-supplied.
 */
@Injectable()
export class EnterpriseIssuerKeysService {
  private readonly cache = new Map<string, CachedKeys>();

  constructor(private readonly logger: LoggerService) {}

  /** A key resolver for `issuer`, refetching once when `kid` is unknown. */
  async resolver(
    issuer: string,
    kid: string | undefined,
  ): Promise<JWTVerifyGetKey> {
    let entry = await this.load(issuer, false);
    if (kid && !entry.jwks.keys.some((key) => key.kid === kid)) {
      if (Date.now() - entry.fetchedAt >= UNKNOWN_KID_REFETCH_MS) {
        entry = await this.load(issuer, true);
      }
    }
    return createLocalJWKSet(entry.jwks);
  }

  private async load(issuer: string, force: boolean): Promise<CachedKeys> {
    const cached = this.cache.get(issuer);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return cached;
    }
    try {
      const fetched = await this.fetchKeys(issuer);
      if (!this.cache.has(issuer) && this.cache.size >= MAX_CACHED_ISSUERS) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(issuer, fetched);
      return fetched;
    } catch (error) {
      this.logger.warn('Enterprise assertion issuer keys unavailable', {
        error: error instanceof Error ? error.message : String(error),
        issuer,
      });
      throw new IssuerKeysError('Issuer keys unavailable');
    }
  }

  private async fetchJson(
    url: string,
  ): Promise<{ body: unknown; ttl: number }> {
    const response = await safeFetch(
      url,
      {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
      { allowedSchemes: ['https:'], maxRedirects: 0 },
    );
    return readJson(response);
  }

  private async fetchKeys(issuer: string): Promise<CachedKeys> {
    if (!isHttpsUrl(issuer)) {
      throw new IssuerKeysError('Issuer must be an https URL');
    }
    const discoveryUrl = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
    const discovery = discoverySchema.parse(
      (await this.fetchJson(discoveryUrl)).body,
    );
    // The document must describe the issuer it was fetched for.
    if (discovery.issuer !== issuer || !isHttpsUrl(discovery.jwks_uri)) {
      throw new IssuerKeysError('Issuer metadata mismatch');
    }
    const { body, ttl } = await this.fetchJson(discovery.jwks_uri);
    const jwks = jwksSchema.parse(body) as JSONWebKeySet;
    const now = Date.now();
    return { expiresAt: now + ttl, fetchedAt: now, jwks };
  }
}
