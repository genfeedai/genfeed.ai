/**
 * Text generation through the product API with an eval-organization API key,
 * so CreditsGuard, brand resolution, the harness brief, the branded-text
 * receipt and the credit ledger run as they do for a customer. The runner
 * never calls a provider URL and never sends the fixture's guidance: the
 * synthetic Kelder brand lives in the eval organization, which is the point
 * of the product arm.
 *
 * Routes, by smoke text kind:
 *   draft   `POST /posts/draft-generations` (branded, receipt-backed post)
 *   thread  the draft above, then `POST /posts/:id/thread-drafts` for the
 *           replies, which is how the app builds an X thread
 *   reply   `POST /reply-bot-configs/author-reply/draft` (harness-aware, saves
 *           no post, and not metered by the credit ledger)
 *   article `POST /articles/generations` (credit-metered; the org must have
 *           article generation enabled). A LinkedIn article is the same route
 *           with the `linkedin-article` category
 *   newsletter `POST /newsletters/generate-draft` (saves a draft; not metered
 *           by the credit ledger). It takes no brand id: the brand is the eval
 *           API key's default brand, which must be the eval brand
 *
 * Script and ad copy have no HTTP route a fixture row can reach: scripts are
 * written by the agent chat tool, and ad packs start from a researched ad id.
 */

import { createHash } from 'node:crypto';
import type { FixtureRow } from '../contracts';
import type { ProductApiClientOptions } from '../media/generation';
import { readErrorMessage } from '../media/generation';

export type ProductTextPlatform = 'linkedin' | 'twitter';

export type ProductTextRoute =
  | { kind: 'article'; category: 'linkedin-article' | null }
  | { kind: 'draft'; platform: ProductTextPlatform }
  | { kind: 'newsletter' }
  | { kind: 'reply' }
  | { kind: 'thread' };

/**
 * Text kinds the product serves through a route above. Every other smoke text
 * kind (script, ad copy) is listed as "no product route yet" in the smoke
 * summary rather than faked.
 */
export const PRODUCT_TEXT_ROUTES: Readonly<Record<string, ProductTextRoute>> = {
  article: { kind: 'article', category: null },
  'linkedin-article': { kind: 'article', category: 'linkedin-article' },
  'linkedin-post': { kind: 'draft', platform: 'linkedin' },
  newsletter: { kind: 'newsletter' },
  reply: { kind: 'reply' },
  'social-post': { kind: 'draft', platform: 'twitter' },
  thread: { kind: 'thread' },
};

/**
 * The platform a route writes for, or null when it is not tied to one.
 * Replies and threads are X features: the product only builds them there.
 */
export function routePlatform(
  route: ProductTextRoute,
): ProductTextPlatform | null {
  switch (route.kind) {
    case 'draft':
      return route.platform;
    case 'article':
      return route.category === 'linkedin-article' ? 'linkedin' : null;
    case 'newsletter':
      return null;
    case 'reply':
    case 'thread':
      return 'twitter';
  }
}

/** Routes whose spend the credit ledger records, so a balance diff is real. */
function isMeteredRoute(route: ProductTextRoute): boolean {
  return route.kind !== 'reply' && route.kind !== 'newsletter';
}

/** Request limits of the product routes, so an over-long row fails by name. */
const PROMPT_LIMITS = { article: 500, newsletter: 200 } as const;

/**
 * Credits reserved before each product call. The draft route settles a
 * small-model text charge; this is a ceiling for the hard cap, not a price.
 */
export const PRODUCT_TEXT_RESERVED_CREDITS = 5;

/** The product's thread route takes 2 to 5 posts including the opener. */
const THREAD_SIZE = { default: 3, max: 5, min: 2 } as const;

export interface TextGenerationRequest {
  brandId: string;
  /** The inbound message a reply route answers; null for the other routes. */
  comment: { author: string; text: string } | null;
  prompt: string;
  /** Idempotency key (UUID v4); a fresh one per call so a retry never replays. */
  requestKey: string;
  route: ProductTextRoute;
  /** Posts in a thread including the opener; null for the other routes. */
  threadSize: number | null;
}

/** Why a fixture row cannot run through its route, or null when it can. */
export function routeRowProblem(row: FixtureRow): string | null {
  const route = PRODUCT_TEXT_ROUTES[row.contentKind];
  if (!route) return `${row.contentKind} has no product text route`;
  const platform = routePlatform(route);
  if (platform && row.input.platform && row.input.platform !== platform) {
    return `row ${row.id} is ${row.input.platform} but the product route for ${row.contentKind} writes for ${platform}`;
  }
  if (route.kind === 'reply' && !row.input.comment) {
    return `row ${row.id} needs input.comment: the product reply route answers an inbound message`;
  }
  const limit =
    route.kind === 'article' || route.kind === 'newsletter'
      ? PROMPT_LIMITS[route.kind]
      : null;
  if (limit !== null && row.input.prompt.length > limit) {
    return `row ${row.id} prompt is ${row.input.prompt.length} characters; the ${route.kind} route takes at most ${limit}`;
  }
  return null;
}

/** "Write a 4-post thread": the size the row asks for, kept inside the route's range. */
export function threadSizeOf(prompt: string): number {
  const asked = Number(/(\d+)-post/i.exec(prompt)?.[1]);
  if (!Number.isInteger(asked)) return THREAD_SIZE.default;
  return Math.min(THREAD_SIZE.max, Math.max(THREAD_SIZE.min, asked));
}

export function buildTextGenerationRequest(
  row: FixtureRow,
  brandId: string,
  requestKey: string,
): TextGenerationRequest {
  const problem = routeRowProblem(row);
  const route = PRODUCT_TEXT_ROUTES[row.contentKind];
  if (problem || !route) throw new Error(problem ?? 'no product text route');
  return {
    brandId,
    comment: route.kind === 'reply' ? (row.input.comment ?? null) : null,
    prompt: row.input.prompt,
    requestKey,
    route,
    threadSize: route.kind === 'thread' ? threadSizeOf(row.input.prompt) : null,
  };
}

export type TextGenerationStatus = 'generated' | 'failed' | 'refused';

export interface TextGenerationResult {
  costEvidence: 'reported' | 'estimated';
  creditsCharged: number;
  /** Product endpoints called, in order, for the call's provenance. */
  endpoints: string[];
  error: string | null;
  latencyMs: number;
  /** Model the product reported (null for routes that do not say). */
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

/** A serialized document: `{ data: { attributes } }` or a collection of them. */
interface SerializedDocument {
  data?: unknown;
}

interface ThreadDraftResponse {
  posts?: unknown;
}

interface ReplyDraftResponse {
  draft?: unknown;
  intentLabel?: unknown;
}

interface CreditsUsageDocument {
  data?: { attributes?: { currentBalance?: unknown } };
}

/** Status text that means the provider refused rather than failed. */
const REFUSAL_PATTERN = /(safety|moderation|nsfw|content policy|refus)/i;

function maybeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** `attributes` of a serialized document, or of the first of a collection. */
function firstAttributes(data: unknown): Record<string, unknown> | null {
  const document = Array.isArray(data) ? data[0] : data;
  if (typeof document !== 'object' || document === null) return null;
  const attributes = (document as { attributes?: unknown }).attributes;
  return typeof attributes === 'object' && attributes !== null
    ? (attributes as Record<string, unknown>)
    : null;
}

/** What a route's calls produced, before cost and status are settled. */
type PipelineOutcome = Pick<
  TextGenerationResult,
  'endpoints' | 'error' | 'model' | 'postId' | 'text'
>;

interface StepOutcome<TBody> {
  body: TBody | null;
  error: string | null;
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
    // The reply and newsletter routes run outside the credit ledger, so a
    // balance diff would read as a free call; they are charged the reservation
    // instead.
    const isMetered = isMeteredRoute(request.route);
    const balanceBefore = isMetered ? await this.readBalance(signal) : null;
    const startedAt = this.now();

    const outcome = await this.run(request, request.route, signal);

    const latencyMs = Math.max(0, Math.round(this.now() - startedAt));
    const balanceAfter = isMetered ? await this.readBalance(signal) : null;
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

    if (outcome.error === null && outcome.text) {
      return {
        ...credits,
        ...outcome,
        error: null,
        latencyMs,
        status: 'generated',
      };
    }
    const detail = outcome.error ?? 'the product returned no generated text';
    return {
      ...credits,
      ...outcome,
      error: detail,
      latencyMs,
      status: REFUSAL_PATTERN.test(detail) ? 'refused' : 'failed',
      text: null,
    };
  }

  private run(
    request: TextGenerationRequest,
    route: ProductTextRoute,
    signal: AbortSignal,
  ): Promise<PipelineOutcome> {
    switch (route.kind) {
      case 'article':
        return this.draftArticle(request, route.category, signal);
      case 'draft':
        return this.draftPost(request, route.platform, signal);
      case 'newsletter':
        return this.draftNewsletter(request, signal);
      case 'reply':
        return this.draftReply(request, signal);
      case 'thread':
        return this.draftThread(request, signal);
    }
  }

  private async draftPost(
    request: TextGenerationRequest,
    platform: ProductTextPlatform,
    signal: AbortSignal,
  ): Promise<PipelineOutcome> {
    const endpoint = 'posts/draft-generations';
    const step = await this.post<DraftGenerationResponse>(
      `/${endpoint}`,
      {
        brandId: request.brandId,
        platform,
        prompt: request.prompt,
        requestKey: request.requestKey,
      },
      signal,
    );
    return {
      endpoints: [endpoint],
      error: step.error,
      model: maybeString(step.body?.model),
      postId: maybeString(step.body?.postId),
      text: maybeString(step.body?.description),
    };
  }

  /** The opener is a branded draft; the replies come from the thread route. */
  private async draftThread(
    request: TextGenerationRequest,
    signal: AbortSignal,
  ): Promise<PipelineOutcome> {
    const opener = await this.draftPost(request, 'twitter', signal);
    if (opener.error !== null || !opener.text || !opener.postId) {
      return {
        ...opener,
        error: opener.error ?? 'the product returned no thread opener',
        text: null,
      };
    }
    const endpoint = 'posts/:id/thread-drafts';
    const step = await this.post<ThreadDraftResponse>(
      `/posts/${encodeURIComponent(opener.postId)}/thread-drafts`,
      { count: request.threadSize ?? 3 },
      signal,
    );
    const replies = Array.isArray(step.body?.posts)
      ? step.body.posts.filter(
          (post): post is string =>
            typeof post === 'string' && post.trim() !== '',
        )
      : [];
    const error =
      step.error ??
      (replies.length === 0 ? 'thread-drafts returned no replies' : null);
    return {
      endpoints: [...opener.endpoints, endpoint],
      error: error === null ? null : `thread replies: ${error}`,
      model: opener.model,
      postId: opener.postId,
      text: error === null ? [opener.text, ...replies].join('\n\n') : null,
    };
  }

  private async draftReply(
    request: TextGenerationRequest,
    signal: AbortSignal,
  ): Promise<PipelineOutcome> {
    const endpoint = 'reply-bot-configs/author-reply/draft';
    if (!request.comment) {
      return {
        endpoints: [],
        error: 'a reply needs the inbound comment',
        model: null,
        postId: null,
        text: null,
      };
    }
    const step = await this.post<ReplyDraftResponse>(
      `/${endpoint}`,
      {
        brandId: request.brandId,
        commentAuthor: request.comment.author,
        commentId: `eval-${request.requestKey.slice(0, 8)}`,
        commentText: request.comment.text,
        platform: 'twitter',
      },
      signal,
    );
    const draft = maybeString(step.body?.draft);
    const label = maybeString(step.body?.intentLabel);
    return {
      endpoints: [endpoint],
      // An empty draft is the product declining to answer, not a free pass.
      error:
        step.error ??
        (draft === null
          ? `the product skipped this comment${label ? ` as ${label}` : ''}`
          : null),
      model: null,
      postId: null,
      text: draft,
    };
  }

  private async draftArticle(
    request: TextGenerationRequest,
    category: 'linkedin-article' | null,
    signal: AbortSignal,
  ): Promise<PipelineOutcome> {
    const endpoint = 'articles/generations';
    const step = await this.post<SerializedDocument>(
      `/${endpoint}`,
      {
        brandId: request.brandId,
        count: 1,
        prompt: request.prompt,
        ...(category ? { category } : {}),
      },
      signal,
    );
    return this.serializedOutcome(endpoint, step, 'article');
  }

  private async draftNewsletter(
    request: TextGenerationRequest,
    signal: AbortSignal,
  ): Promise<PipelineOutcome> {
    const endpoint = 'newsletters/generate-draft';
    const step = await this.post<SerializedDocument>(
      `/${endpoint}`,
      { topic: request.prompt },
      signal,
    );
    return this.serializedOutcome(endpoint, step, 'newsletter');
  }

  /** Title and body of the first serialized document, as one piece of text. */
  private serializedOutcome(
    endpoint: string,
    step: StepOutcome<SerializedDocument>,
    what: string,
  ): PipelineOutcome {
    const attributes = firstAttributes(step.body?.data);
    const content = maybeString(attributes?.content);
    const label = maybeString(attributes?.label);
    return {
      endpoints: [endpoint],
      error:
        step.error ??
        (content === null ? `the product returned no ${what} content` : null),
      model: null,
      postId: null,
      text:
        content === null ? null : label ? `${label}\n\n${content}` : content,
    };
  }

  private async post<TBody>(
    path: string,
    body: Record<string, string | number>,
    signal: AbortSignal,
  ): Promise<StepOutcome<TBody>> {
    try {
      const response = await this.fetchImpl(this.url(path), {
        body: JSON.stringify(body),
        headers: this.headers(),
        method: 'POST',
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          body: null,
          error: `HTTP ${response.status}: ${readErrorMessage(payload)}`,
        };
      }
      return { body: (payload ?? {}) as TBody, error: null };
    } catch (caught: unknown) {
      if (signal.aborted) throw caught;
      return {
        body: null,
        error: caught instanceof Error ? caught.message : String(caught),
      };
    }
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
      const platform = routePlatform(request.route) ?? 'web';
      const text =
        request.route.kind === 'thread'
          ? Array.from(
              { length: request.threadSize ?? 3 },
              (_unused, index) =>
                `${index + 1}/ On-brand ${platform} post: ${request.prompt}`,
            ).join('\n\n')
          : request.route.kind === 'reply'
            ? `On-brand ${platform} reply to ${request.comment?.author ?? 'a customer'}: ${request.comment?.text ?? request.prompt}`
            : `On-brand ${platform} draft: ${request.prompt} Follow us for more.`;
      return {
        costEvidence: 'estimated',
        creditsCharged: 0.5,
        endpoints: ['stub'],
        error: null,
        latencyMs: 1,
        model,
        postId: `stub-post-${digest.slice(0, 8)}`,
        status: 'generated',
        text,
      };
    },
  };
}
