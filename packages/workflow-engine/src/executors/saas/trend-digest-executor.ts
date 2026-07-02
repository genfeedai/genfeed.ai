import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Structural shape of a ranked trend item. Kept local (not imported from
 * `@genfeedai/helpers`) so the engine package retains its minimal dependency
 * surface; it is structurally compatible with `TrendDigestItem` from helpers.
 */
export interface TrendDigestEntry {
  platform: string;
  topic: string;
  viralScore: number;
  type: 'video' | 'hashtag' | 'sound' | 'topic';
  url?: string;
  usageCount?: number;
}

export interface RenderedDigest {
  subject: string;
  html: string;
}

/** Resolves the org owner the digest is addressed to. */
export type DigestOwnerResolver = (
  organizationId: string,
) => Promise<{ userId: string | null; email: string | null } | null>;

/** Fetches the deterministically-ranked top-N trends for an org. */
export type DigestTrendsProvider = (params: {
  organizationId: string;
  platforms: string[];
  topN: number;
  minViralScore: number;
}) => Promise<TrendDigestEntry[]>;

/**
 * Durable "ran today" marker. Returns true if THIS caller acquired the marker
 * (i.e. is the first across all replicas today). Implemented with Redis
 * `SET key val NX EX ttl` — the marker is NOT released, so it survives the run.
 */
export type DigestIdempotencyGuard = (
  key: string,
  ttlSeconds: number,
) => Promise<boolean>;

/** Credit availability pre-check (no deduction here — that happens post-send). */
export type DigestCreditsChecker = (
  organizationId: string,
  cost: number,
) => Promise<boolean>;

/** Renders the branded subject + HTML for the digest. */
export type DigestRenderer = (
  trends: TrendDigestEntry[],
  options: { minViralScore: number; appUrl?: string; headerTitle?: string },
) => RenderedDigest;

export interface TrendDigestSkippedOutput {
  skipped: true;
  reason:
    | 'no-owner-email'
    | 'already-ran-today'
    | 'insufficient-credits'
    | 'no-trends';
}

export interface TrendDigestReadyOutput {
  skipped: false;
  to: string;
  subject: string;
  html: string;
  orgId: string;
  ownerUserId: string | null;
  creditCost: number;
}

export type TrendDigestOutput =
  | TrendDigestSkippedOutput
  | TrendDigestReadyOutput;

const DEFAULT_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'twitter'];
const DEFAULT_TOP_N = 5;
const DEFAULT_MIN_VIRAL_SCORE = 70;
const DEFAULT_CREDIT_COST = 5;
const IDEMPOTENCY_TTL_SECONDS = 93_600; // ~26h — spans a daily run + clock skew

function utcDateKey(): string {
  // Executors run in normal Node runtime (unlike the sandboxed workflow script
  // layer), so Date is available here. UTC day boundary, documented.
  return new Date().toISOString().slice(0, 10);
}

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Trend Digest Executor
 *
 * Action node that assembles a curated daily trends digest from the already
 * collected global corpus (deterministic ranking — no LLM, no scrape). It
 * resolves the org-owner recipient, enforces a durable per-day idempotency
 * marker (multi-replica safe), pre-checks credits, and renders the branded
 * email. It does NOT send or deduct — it emits a serializable payload that the
 * downstream `sendEmail` node sends and the adapter's post-run hook charges.
 *
 * Node Type: trendDigest
 */
export class TrendDigestExecutor extends BaseExecutor {
  readonly nodeType = 'trendDigest';
  private ownerResolver: DigestOwnerResolver | null = null;
  private trendsProvider: DigestTrendsProvider | null = null;
  private idempotencyGuard: DigestIdempotencyGuard | null = null;
  private creditsChecker: DigestCreditsChecker | null = null;
  private renderer: DigestRenderer | null = null;

  setOwnerResolver(resolver: DigestOwnerResolver): void {
    this.ownerResolver = resolver;
  }

  setTrendsProvider(provider: DigestTrendsProvider): void {
    this.trendsProvider = provider;
  }

  setIdempotencyGuard(guard: DigestIdempotencyGuard): void {
    this.idempotencyGuard = guard;
  }

  setCreditsChecker(checker: DigestCreditsChecker): void {
    this.creditsChecker = checker;
  }

  setRenderer(renderer: DigestRenderer): void {
    this.renderer = renderer;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (
      !this.ownerResolver ||
      !this.trendsProvider ||
      !this.idempotencyGuard ||
      !this.creditsChecker ||
      !this.renderer
    ) {
      throw new Error('Trend digest dependencies not configured');
    }

    const orgId = context.organizationId;
    const platforms = this.getOptionalConfig<string[]>(
      node.config,
      'platforms',
      DEFAULT_PLATFORMS,
    );
    const topN = this.getOptionalConfig<number>(
      node.config,
      'topN',
      DEFAULT_TOP_N,
    );
    const minViralScore = this.getOptionalConfig<number>(
      node.config,
      'minViralScore',
      DEFAULT_MIN_VIRAL_SCORE,
    );
    const creditCost = this.getOptionalConfig<number>(
      node.config,
      'creditCost',
      DEFAULT_CREDIT_COST,
    );
    const appUrl = this.getOptionalConfig<string | undefined>(
      node.config,
      'appUrl',
      undefined,
    );
    const headerTitle = this.getOptionalConfig<string | undefined>(
      node.config,
      'headerTitle',
      undefined,
    );

    const owner = await this.ownerResolver(orgId);
    if (!owner?.email) {
      return this.skip('no-owner-email');
    }

    const acquired = await this.idempotencyGuard(
      `workflow-digest:${context.workflowId}:${utcDateKey()}`,
      IDEMPOTENCY_TTL_SECONDS,
    );
    if (!acquired) {
      return this.skip('already-ran-today');
    }

    const hasCredits = await this.creditsChecker(orgId, creditCost);
    if (!hasCredits) {
      return this.skip('insufficient-credits');
    }

    const trends = await this.trendsProvider({
      minViralScore,
      organizationId: orgId,
      platforms,
      topN,
    });

    if (trends.length === 0) {
      return this.skip('no-trends');
    }

    const { subject, html } = this.renderer(trends, {
      appUrl,
      headerTitle,
      minViralScore,
    });

    const output: TrendDigestReadyOutput = {
      creditCost,
      html,
      orgId,
      ownerUserId: owner.userId,
      skipped: false,
      subject,
      to: owner.email,
    };

    return {
      data: output,
      metadata: { skipped: false, trendCount: trends.length },
    };
  }

  estimateCost(): number {
    // Charge is applied explicitly by the adapter post-run hook after a
    // confirmed send, not via the engine credit accumulator.
    return 0;
  }

  private skip(reason: TrendDigestSkippedOutput['reason']): ExecutorOutput {
    const output: TrendDigestSkippedOutput = { reason, skipped: true };
    return { data: output, metadata: { reason, skipped: true } };
  }
}
