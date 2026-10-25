import { AgentApiServiceProvider } from '@genfeedai/agent/components/AgentApiServiceContext';
import { TurboRunResultCard } from '@genfeedai/agent/components/TurboRunResultCard';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { TurboRunItemStatus, TurboRunStatus } from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    credentials: [],
    selectedBrand: { id: 'brand-1', organizationId: 'org-1', label: 'Genfeed' },
  }),
}));

describe('TurboRunResultCard', () => {
  it('renders a dense metrics line without nested metric boxes', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 20,
          completedCount: 12,
          creditsUsed: 5,
          ctas: [
            {
              href: '/publishing/review?run=run-123&filter=ready',
              label: 'Open review queue',
            },
            { href: '/calendar/posts', label: 'Open calendar' },
          ],
          description: 'Generating drafts for Instagram, X, and LinkedIn.',
          failedCount: 1,
          id: 'run-result-1',
          platforms: ['instagram', 'twitter', 'linkedin'],
          status: 'processing',
          title: 'Turbo run started',
          type: 'turbo_run_result_card',
        }}
      />,
    );

    expect(screen.getByText('Turbo run started')).toBeInTheDocument();
    expect(
      screen.getByText(
        '20 requested · 12 ready · 1 failed · 5 credits · Instagram · X · LinkedIn',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Creating posts');
    expect(screen.getByText('12 of 20 ready')).toBeInTheDocument();
    // Nested metric boxes removed for T3 density.
    expect(screen.queryByText('Posts')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open review queue' }),
    ).toHaveAttribute('href', '/publishing/review?run=run-123&filter=ready');
    expect(screen.queryByText('run-123')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Collapse run result' }),
    ).toBeInTheDocument();
  });

  it('collapses previews and CTAs with a centered toggle', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 3,
          completedCount: 3,
          ctas: [
            {
              href: '/publishing/review?run=b1&filter=ready',
              label: 'View all',
            },
          ],
          description: 'Generated 3 X drafts.',
          id: 'run-collapse',
          items: [
            {
              id: 'post-1',
              platform: 'twitter',
              title: 'Draft one',
              type: 'post',
            },
          ],
          title: 'Turbo run complete',
          type: 'turbo_run_result_card',
        }}
      />,
    );

    expect(screen.getByText('Draft one')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse run result' }),
    );
    expect(screen.queryByText('Draft one')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand run result' }),
    ).toBeInTheDocument();
  });

  it('renders server-limited platform previews and a link to the rest', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 10,
          completedCount: 8,
          ctas: [
            {
              href: '/publishing/review?run=run-xyz&filter=ready',
              label: 'View all 8 posts',
            },
          ],
          description: 'Generated 8 X drafts.',
          id: 'run-result-previews',
          // Server already applied takeTurboRunPostPreviews({ limit: 3 }).
          items: [
            {
              id: 'post-1',
              platform: 'twitter',
              title: 'First draft about image content',
              type: 'post',
            },
            {
              id: 'post-2',
              platform: 'twitter',
              title: 'Second draft with a hook',
              type: 'post',
            },
            {
              id: 'post-3',
              platform: 'twitter',
              title: 'Third draft for the feed',
              type: 'post',
            },
          ],
          remainingCount: 5,
          title: 'Turbo run complete',
          type: 'turbo_run_result_card',
        }}
      />,
    );

    // Publish-style X feed previews, not plain text rows.
    expect(screen.getAllByText('X feed preview')).toHaveLength(3);
    expect(
      screen.getByText('First draft about image content'),
    ).toBeInTheDocument();
    expect(screen.getByText('Second draft with a hook')).toBeInTheDocument();
    expect(screen.getByText('Third draft for the feed')).toBeInTheDocument();
    expect(screen.getAllByTestId('turbo-run-result-preview')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: '+5 more posts in review' }),
    ).toHaveAttribute('href', '/publishing/review?run=run-xyz&filter=ready');
  });

  it('emphasizes all-failed runs without Ready metrics', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 20,
          completedCount: 0,
          description: 'Generated 20 X drafts.',
          failedCount: 20,
          id: 'run-failed',
          platforms: ['twitter'],
          title: 'Turbo run complete',
          type: 'turbo_run_result_card',
        }}
      />,
    );

    expect(
      screen.getByText('20 requested · 0 ready · 20 failed · X'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('turbo-run-result').className).toMatch(
      /border-destructive/,
    );
  });

  describe('following a queued run', () => {
    const queuedCard = {
      completedCount: 0,
      ctas: [
        {
          href: '/publishing/posts?view=approvals&run=run-1',
          label: 'Open approval queue',
        },
      ],
      data: { turboRunId: 'run-1' },
      id: 'turbo-run-result:run-1',
      platforms: ['twitter'],
      status: 'queued',
      title: 'Generating posts',
      turboRunCount: 2,
      type: 'turbo_run_result_card' as const,
    };

    function run(overrides: Partial<ITurboRunSummary>): ITurboRunSummary {
      return {
        brandId: 'brand-1',
        completedCount: 0,
        contentMix: {
          carouselPercent: 0,
          imagePercent: 100,
          reelPercent: 0,
          storyPercent: 0,
          videoPercent: 0,
        },
        createdAt: '2026-10-25T09:00:00Z',
        failedCount: 0,
        id: 'run-1',
        items: [],
        pendingCount: 2,
        platforms: ['twitter'],
        status: TurboRunStatus.PROCESSING,
        totalCount: 2,
        ...overrides,
      };
    }

    function renderWithRun(
      summary: ITurboRunSummary,
      onUiAction?: () => Promise<boolean>,
    ) {
      const service = {
        getTurboRun: vi.fn().mockResolvedValue(summary),
      } as unknown as AgentApiService;
      render(
        <AgentApiServiceProvider service={service}>
          <TurboRunResultCard action={queuedCard} onUiAction={onUiAction} />
        </AgentApiServiceProvider>,
      );
      return service;
    }

    it('shows real progress while the run generates', async () => {
      const service = renderWithRun(
        run({
          completedCount: 1,
          items: [
            {
              caption: 'First ready draft',
              createdAt: '2026-10-25T09:00:00Z',
              format: 'post',
              id: 'item-1',
              platform: 'twitter',
              status: TurboRunItemStatus.COMPLETED,
              turboRunId: 'run-1',
            },
            {
              createdAt: '2026-10-25T09:00:00Z',
              format: 'post',
              id: 'item-2',
              platform: 'twitter',
              status: TurboRunItemStatus.PROCESSING,
              turboRunId: 'run-1',
            },
          ],
        }),
      );

      expect(await screen.findByText('First ready draft')).toBeInTheDocument();
      expect(service.getTurboRun).toHaveBeenCalledWith(
        'run-1',
        expect.any(AbortSignal),
      );
      expect(screen.getByText('Generating posts')).toBeInTheDocument();
      expect(screen.getByText('1 of 2 ready')).toBeInTheDocument();
      expect(screen.getAllByTestId('turbo-run-result-preview')).toHaveLength(1);
    });

    it('lists the finished posts with a one-click review of each and a link to the queue', async () => {
      renderWithRun(
        run({
          completedCount: 2,
          items: ['item-1', 'item-2'].map((id, index) => ({
            caption: `Draft ${index + 1}`,
            createdAt: '2026-10-25T09:00:00Z',
            format: 'post' as const,
            id,
            platform: 'twitter',
            status: TurboRunItemStatus.COMPLETED,
            turboRunId: 'run-1',
          })),
          pendingCount: 0,
          status: TurboRunStatus.COMPLETED,
        }),
      );

      expect(await screen.findByText('2 posts ready for review')).toBeVisible();
      const reviewLinks = screen.getAllByRole('link', {
        name: 'Review this X post in the approval queue',
      });
      expect(reviewLinks.map((link) => link.getAttribute('href'))).toEqual([
        '/publishing/posts?view=approvals&run=run-1&item=item-1',
        '/publishing/posts?view=approvals&run=run-1&item=item-2',
      ]);
      expect(
        screen.getByRole('link', { name: 'Open approval queue' }),
      ).toHaveAttribute('href', '/publishing/posts?view=approvals&run=run-1');
    });

    it('asks the agent to rework just the post whose button was clicked', async () => {
      const onUiAction = vi.fn().mockResolvedValue(true);
      renderWithRun(
        run({
          completedCount: 1,
          items: [
            {
              caption: 'Needs a sharper hook',
              createdAt: '2026-10-25T09:00:00Z',
              format: 'post',
              id: 'item-1',
              platform: 'twitter',
              status: TurboRunItemStatus.COMPLETED,
              turboRunId: 'run-1',
            },
          ],
          status: TurboRunStatus.COMPLETED,
        }),
        onUiAction,
      );

      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Ask the agent to rework this X post',
        }),
      );

      await waitFor(() => expect(onUiAction).toHaveBeenCalledTimes(1));
      const [action, payload] = onUiAction.mock.calls[0];
      expect(action).toBe('send_prompt');
      expect(payload.sourceActionId).toBe(
        'turbo-run-result:run-1:rework:item-1',
      );
      expect(payload.prompt).toContain('run run-1, item item-1');
      expect(payload.prompt).toContain('Needs a sharper hook');
      expect(
        await screen.findByRole('button', { name: /Rework requested|rework/i }),
      ).toBeDisabled();
    });

    it('reports a failed run without ready posts', async () => {
      renderWithRun(
        run({
          failedCount: 2,
          pendingCount: 0,
          status: TurboRunStatus.FAILED,
        }),
      );

      expect(await screen.findByText('Post generation failed')).toBeVisible();
      expect(screen.getByTestId('turbo-run-result').className).toMatch(
        /border-destructive/,
      );
    });
  });
});
