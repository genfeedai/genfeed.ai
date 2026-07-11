import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  type DigestCreditsChecker,
  type DigestIdempotencyGuard,
  type DigestOwnerResolver,
  type DigestRenderer,
  type DigestTrendsProvider,
  type TrendDigestEntry,
  TrendDigestExecutor,
  type TrendDigestReadyOutput,
  type TrendDigestSkippedOutput,
} from '@workflow-engine/executors/saas/trend-digest-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SAMPLE_TRENDS: TrendDigestEntry[] = [
  { platform: 'tiktok', topic: 'Dancing cats', type: 'video', viralScore: 92 },
];

function makeInput(config: Record<string, unknown> = {}): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'digest-1',
    inputs: [],
    label: 'Trend Digest',
    type: 'trendDigest',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

interface Mocks {
  ownerResolver: ReturnType<typeof vi.fn>;
  trendsProvider: ReturnType<typeof vi.fn>;
  idempotencyGuard: ReturnType<typeof vi.fn>;
  creditsChecker: ReturnType<typeof vi.fn>;
  renderer: ReturnType<typeof vi.fn>;
}

function wire(executor: TrendDigestExecutor): Mocks {
  const ownerResolver = vi
    .fn()
    .mockResolvedValue({ email: 'owner@org.com', userId: 'user-1' });
  const trendsProvider = vi.fn().mockResolvedValue(SAMPLE_TRENDS);
  const idempotencyGuard = vi.fn().mockResolvedValue(true);
  const creditsChecker = vi.fn().mockResolvedValue(true);
  const renderer = vi
    .fn()
    .mockReturnValue({ html: '<p>digest</p>', subject: 'Daily trends' });

  executor.setOwnerResolver(ownerResolver as unknown as DigestOwnerResolver);
  executor.setTrendsProvider(trendsProvider as unknown as DigestTrendsProvider);
  executor.setIdempotencyGuard(
    idempotencyGuard as unknown as DigestIdempotencyGuard,
  );
  executor.setCreditsChecker(creditsChecker as unknown as DigestCreditsChecker);
  executor.setRenderer(renderer as unknown as DigestRenderer);

  return {
    creditsChecker,
    idempotencyGuard,
    ownerResolver,
    renderer,
    trendsProvider,
  };
}

describe('TrendDigestExecutor', () => {
  let executor: TrendDigestExecutor;
  let mocks: Mocks;

  beforeEach(() => {
    executor = new TrendDigestExecutor();
    mocks = wire(executor);
  });

  it('throws when dependencies are not configured', async () => {
    const fresh = new TrendDigestExecutor();
    await expect(fresh.execute(makeInput())).rejects.toThrow(
      'Trend digest dependencies not configured',
    );
  });

  it('produces a ready payload on the happy path (no charge in node)', async () => {
    const result = await executor.execute(makeInput({ creditCost: 5 }));
    const data = result.data as TrendDigestReadyOutput;
    expect(data.skipped).toBe(false);
    expect(data).toMatchObject({
      creditCost: 5,
      html: '<p>digest</p>',
      orgId: 'org-1',
      ownerUserId: 'user-1',
      subject: 'Daily trends',
      to: 'owner@org.com',
    });
    expect(mocks.renderer).toHaveBeenCalledWith(
      SAMPLE_TRENDS,
      expect.objectContaining({ minViralScore: 70 }),
    );
  });

  it('keys the idempotency marker by workflow id and UTC date', async () => {
    await executor.execute(makeInput());
    const key = mocks.idempotencyGuard.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^workflow-digest:wf-1:\d{4}-\d{2}-\d{2}$/);
  });

  it('skips with no-owner-email and never acquires the marker', async () => {
    mocks.ownerResolver.mockResolvedValueOnce({ email: null, userId: null });
    const result = await executor.execute(makeInput());
    expect((result.data as TrendDigestSkippedOutput).reason).toBe(
      'no-owner-email',
    );
    expect(mocks.idempotencyGuard).not.toHaveBeenCalled();
  });

  it('skips with already-ran-today when the marker is already held', async () => {
    mocks.idempotencyGuard.mockResolvedValueOnce(false);
    const result = await executor.execute(makeInput());
    expect((result.data as TrendDigestSkippedOutput).reason).toBe(
      'already-ran-today',
    );
    expect(mocks.creditsChecker).not.toHaveBeenCalled();
    expect(mocks.trendsProvider).not.toHaveBeenCalled();
  });

  it('skips with insufficient-credits without fetching trends', async () => {
    mocks.creditsChecker.mockResolvedValueOnce(false);
    const result = await executor.execute(makeInput());
    expect((result.data as TrendDigestSkippedOutput).reason).toBe(
      'insufficient-credits',
    );
    expect(mocks.trendsProvider).not.toHaveBeenCalled();
  });

  it('skips with no-trends and does not render', async () => {
    mocks.trendsProvider.mockResolvedValueOnce([]);
    const result = await executor.execute(makeInput());
    expect((result.data as TrendDigestSkippedOutput).reason).toBe('no-trends');
    expect(mocks.renderer).not.toHaveBeenCalled();
  });
});
