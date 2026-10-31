import { AgentContextCoveragePanel } from '@genfeedai/agent/components/AgentContextCoveragePanel';
import { formatPlatformLabel } from '@genfeedai/contracts';
import type { ContextCoverage } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/web/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

const partialCoverage: ContextCoverage = {
  families: [
    {
      family: 'knowledge',
      lastSuccessAt: '2026-10-20T10:00:00.000Z',
      purpose: 'BRAND_TRUTH',
      recoveries: [
        {
          kind: 'open_knowledge',
          label: 'Pricing page',
          sourceId: 'source 1',
          state: 'stale',
        },
      ],
      state: 'stale',
    },
    {
      family: 'knowledge',
      lastSuccessAt: null,
      purpose: 'RESEARCH',
      recoveries: [],
      state: 'empty',
    },
    {
      family: 'agent_memory',
      lastSuccessAt: null,
      recoveries: [],
      state: 'partial',
    },
    {
      family: 'social_connections',
      lastSuccessAt: null,
      recoveries: [
        {
          kind: 'reconnect',
          label: 'Reconnect account',
          platform: 'twitter',
          state: 'disconnected',
        },
      ],
      state: 'disconnected',
    },
  ],
  isIncomplete: true,
  usage: 'search',
} as never;

function build(coverage: Promise<ContextCoverage> | ContextCoverage) {
  const getContextCoverage = vi
    .fn()
    .mockImplementation(() => Promise.resolve(coverage));
  return { apiService: { getContextCoverage }, getContextCoverage };
}

describe('AgentContextCoveragePanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows each family state, success time and recovery links', async () => {
    const { apiService, getContextCoverage } = build(partialCoverage);

    render(<AgentContextCoveragePanel apiService={apiService} brandId="b1" />);

    expect(await screen.findByTestId('coverage-summary')).toHaveTextContent(
      'Some sources are incomplete',
    );
    expect(getContextCoverage).toHaveBeenCalledWith(
      { brandId: 'b1', usage: 'search' },
      expect.any(AbortSignal),
    );

    const brandTruth = screen.getByTestId(
      'coverage-family-knowledge-BRAND_TRUTH',
    );
    expect(brandTruth).toHaveTextContent('Brand truth');
    expect(brandTruth).toHaveTextContent('Stale');
    expect(brandTruth).toHaveTextContent('Most recent success');
    expect(
      screen.getByRole('link', { name: 'Open Pricing page' }),
    ).toHaveAttribute(
      'href',
      '/acme/brand/settings/knowledge?sourceId=source%201',
    );

    expect(
      screen.getByTestId('coverage-family-knowledge-RESEARCH'),
    ).toHaveTextContent('Success time unavailable');

    expect(
      screen.getByTestId('coverage-family-agent_memory'),
    ).toHaveTextContent('Agent memory');

    const social = screen.getByTestId('coverage-family-social_connections');
    expect(social).toHaveTextContent('Disconnected');
    expect(
      screen.getByRole('link', {
        name: `Reconnect ${formatPlatformLabel('twitter')}`,
      }),
    ).toHaveAttribute('href', '/acme/brand/platforms/twitter');
  });

  it('says every listed source is readable when coverage is complete', async () => {
    const { apiService } = build({
      families: [
        {
          family: 'knowledge',
          lastSuccessAt: null,
          purpose: 'BRAND_TRUTH',
          recoveries: [],
          state: 'available',
        },
      ],
      isIncomplete: false,
      usage: 'search',
    } as never);

    render(<AgentContextCoveragePanel apiService={apiService} />);

    expect(await screen.findByTestId('coverage-summary')).toHaveTextContent(
      'Every source listed here is readable',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not read while inactive', () => {
    const { apiService, getContextCoverage } = build(partialCoverage);

    render(
      <AgentContextCoveragePanel apiService={apiService} isActive={false} />,
    );

    expect(getContextCoverage).not.toHaveBeenCalled();
    expect(screen.getByTestId('coverage-loading')).toBeInTheDocument();
  });

  it('shows an error with a retry that reads again', async () => {
    const getContextCoverage = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(partialCoverage);

    render(<AgentContextCoveragePanel apiService={{ getContextCoverage }} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Coverage could not be loaded.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('coverage-summary')).toBeInTheDocument();
    expect(getContextCoverage).toHaveBeenCalledTimes(2);
  });

  it('drops the previous brand coverage at once and ignores its late response', async () => {
    let resolveFirst: (value: ContextCoverage) => void = () => undefined;
    const getContextCoverage = vi
      .fn()
      .mockImplementationOnce(
        (_params: unknown, signal: AbortSignal) =>
          new Promise<ContextCoverage>((resolve, reject) => {
            resolveFirst = resolve;
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      )
      .mockResolvedValueOnce({
        families: [
          {
            family: 'knowledge',
            lastSuccessAt: null,
            purpose: 'RESEARCH',
            recoveries: [],
            state: 'available',
          },
        ],
        isIncomplete: false,
        usage: 'search',
      });
    const apiService = { getContextCoverage };

    const view = render(
      <AgentContextCoveragePanel apiService={apiService} brandId="brand-a" />,
    );
    view.rerender(
      <AgentContextCoveragePanel apiService={apiService} brandId="brand-b" />,
    );

    expect(
      await screen.findByTestId('coverage-family-knowledge-RESEARCH'),
    ).toBeInTheDocument();
    resolveFirst(partialCoverage);
    await waitFor(() => {
      expect(
        screen.queryByTestId('coverage-family-social_connections'),
      ).toBeNull();
    });
    expect(getContextCoverage).toHaveBeenLastCalledWith(
      { brandId: 'brand-b', usage: 'search' },
      expect.any(AbortSignal),
    );
  });

  it('reloads when the window regains focus', async () => {
    const { apiService, getContextCoverage } = build(partialCoverage);

    render(<AgentContextCoveragePanel apiService={apiService} />);
    await screen.findByTestId('coverage-summary');

    fireEvent.focus(window);

    await waitFor(() => expect(getContextCoverage).toHaveBeenCalledTimes(2));
  });
});
