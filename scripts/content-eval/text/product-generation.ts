import { createHash } from 'node:crypto';
import type { ProductApiClientOptions } from '../media/generation';
import { readErrorMessage } from '../media/generation';

/**
 * Text generation through the product API (`POST /posts/draft-generations`)
 * with an eval-organization API key, so CreditsGuard, brand resolution, the
 * harness brief, the branded-text receipt and the credit ledger all run as
 * they do for a customer. The runner never calls a provider URL and never
 * sends the fixture's guidance: the synthetic Kelder brand lives in the eval
 * organization, which is the point of the product arm.
 */

export type ProductTextPlatform = 'linkedin' | 'twitter';

/**
 * Text kinds the product serves through the draft route. Every other smoke
 * text kind has its own endpoint (article, newsletter, script, reply, …) and
 * is listed as "no product route yet" in the smoke summary rather than faked.
 */
export const PRODUCT_TEXT_ROUTES: Readonly<
  Record<string, { platform: ProductTextPlatform }>
> = {
  'linkedin-post': { platform: 'linkedin' },
  'social-post': { platform: 'twitter' },
};

/**
 * Credits reserved before each product call. The draft route settles a
 * small-model text charge; this is a ceiling for the hard cap, not a price.
 */
export const PRODUCT_TEXT_RESERVED_CREDITS = 5;

export interface TextGenerationRequest {
  brandId: string;
  platform: ProductTextPlatform;
  prompt: string;
  /** Idempotency key (UUID v4); a fresh one per call so a retry never replays. */
  requestKey: string;
}

export type TextGenerationStatus = 'generated' | 'failed' | 'refused';

export interface TextGenerationResult {
  costEvidence: 'reported' | 'estimated';
  creditsCharged: number;
  error: string | null;
  latencyMs: number;
  /** Model the product actually used (the Admin default or the seed fallback). */
  model: string | null;
  postId: string | null;
  status: TextGenerationStatus;
  text: string | null;
}

export interface TextGenerationPort {
  generate(
    request: TextGenerationRequest,
    signal: AbortSignal,
  ): Promise<TextGenerationResult>;
}

/** The product API a `product` contestant generates through, and its brand. */
export interface ProductTextBinding {
  brandId: string;
  port: TextGenerationPort;
}

interface DraftGenerationResponse {
  description?: unknown;
  model?: unknown;
  postId?: unknown;
}

interface CreditsUsageDocument {
  data?: { attributes?: { currentBalance?: unknown } };
}

/** Status text that means the provider refused rather than failed. */
const REFUSAL_PATTERN = /(safety|moderation|nsfw|content policy|refus)/i;

function maybeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export class ProductApiTextGeneration implements TextGenerationPort {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: ProductApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async generate(
    request: TextGenerationRequest,
    signal: AbortSignal,
  ): Promise<TextGenerationResult> {
    const balanceBefore = await this.readBalance(signal);
    const startedAt = this.now();

    let payload: DraftGenerationResponse | null = null;
    let error: string | null = null;
    try {
      const response = await this.fetchImpl(
        this.url('/posts/draft-generations'),
        {
          body: JSON.stringify({
            brandId: request.brandId,
            platform: request.platform,
            prompt: request.prompt,
            requestKey: request.requestKey,
          }),
          headers: this.headers(),
          method: 'POST',
          signal,
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        error = `HTTP ${response.status}: ${readErrorMessage(body)}`;
      } else {
        payload = (body ?? {}) as DraftGenerationResponse;
      }
    } catch (caught: unknown) {
      if (signal.aborted) throw caught;
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const latencyMs = Math.max(0, Math.round(this.now() - startedAt));

    const balanceAfter = await this.readBalance(signal);
    const reported =
      balanceBefore !== null && balanceAfter !== null
        ? Math.max(0, balanceBefore - balanceAfter)
        : null;
    const credits = {
      costEvidence:
        reported === null ? ('estimated' as const) : ('reported' as const),
      // No balance read: charge the reservation, never zero, so the cap holds.
      creditsCharged: reported ?? PRODUCT_TEXT_RESERVED_CREDITS,
    };

    const text = maybeString(payload?.description);
    const meta = {
      model: maybeString(payload?.model),
      postId: maybeString(payload?.postId),
    };
    if (error === null && text) {
      return {
        ...credits,
        ...meta,
        error: null,
        latencyMs,
        status: 'generated',
        text,
      };
    }

    const detail = error ?? 'the product returned no generated text';
    return {
      ...credits,
      ...meta,
      error: detail,
      latencyMs,
      status: REFUSAL_PATTERN.test(detail) ? 'refused' : 'failed',
      text: null,
    };
  }

  private async readBalance(signal: AbortSignal): Promise<number | null> {
    try {
      const response = await this.fetchImpl(this.url('/credits/usage'), {
        headers: this.headers(),
        method: 'GET',
        signal,
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as CreditsUsageDocument;
      const balance = payload.data?.attributes?.currentBalance;
      return typeof balance === 'number' ? balance : null;
    } catch {
      if (signal.aborted) throw signal.reason;
      return null;
    }
  }

  private url(path: string): string {
    return `${this.options.apiUrl.replace(/\/+$/, '')}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}

/**
 * Free deterministic port for the stub dispatcher: it proves the suite, the
 * ledger and the report wiring and never measures the product.
 */
export function createStubTextGeneration(model: string): TextGenerationPort {
  return {
    async generate(request) {
      const digest = createHash('sha256').update(request.prompt).digest('hex');
      return {
        costEvidence: 'estimated',
        creditsCharged: 0.5,
        error: null,
        latencyMs: 1,
        model,
        postId: `stub-post-${digest.slice(0, 8)}`,
        status: 'generated',
        text: `On-brand ${request.platform} draft: ${request.prompt} Follow us for more.`,
      };
    },
  };
}
