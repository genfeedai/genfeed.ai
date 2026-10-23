import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AdminModelDetail } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelDetailContent from './content';

const api = vi.hoisted(() => ({
  detail: vi.fn(),
  update: vi.fn(),
  setProviderActive: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({ type: 'video', modelId: 'logical-1' }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => api,
}));
vi.mock('@services/admin/model-detail.service', () => ({
  AdminModelDetailService: { getInstance: vi.fn() },
}));
vi.mock(
  '@app/(protected)/admin/automation/models/[type]/model-pricing-details',
  () => ({ default: () => <p>Pricing review controls</p> }),
);
vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const Empty = () => null;
  return {
    ResponsiveContainer: Container,
    AreaChart: Container,
    BarChart: Container,
    Area: Empty,
    Bar: Empty,
    CartesianGrid: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});
function detail(): AdminModelDetail {
  return {
    id: 'logical-1',
    key: 'google/model',
    label: 'Logical video model',
    description: 'One model, multiple providers',
    category: 'video',
    isActive: true,
    pinnedProvider: null,
    marginMultiplier: 3,
    periodDays: 30,
    candidates: [],
    usage: [
      {
        date: new Date().toISOString().slice(0, 10),
        provider: 'fal',
        generations: 3,
        vendorCostUsd: 0.3,
      },
    ],
    offers: [
      {
        id: 'offer-1',
        executionModelId: 'fal-1',
        executionModelKey: 'fal/model',
        provider: 'fal',
        endpoint: 'fal-ai/model',
        isActive: true,
        isRegistrationActive: true,
        isProviderActive: true,
        priority: 0,
        hasReviewedPricing: true,
        verifiedAt: '2026-10-23T00:00:00Z',
        sourceUrl: 'https://fal.ai/models/test',
        rates: [
          {
            component: 'video',
            unit: 'second',
            unitPriceUsd: 0.1,
            when: { audio: true },
          },
        ],
      },
    ],
  };
}
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <ModelDetailContent />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.detail.mockResolvedValue(detail());
  api.update.mockResolvedValue(undefined);
  api.setProviderActive.mockResolvedValue(undefined);
});
describe('admin model detail page', () => {
  it('shows one model with provider connections, reviewed price units, and usage', async () => {
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Logical video model' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Pricing table' }),
    ).toBeInTheDocument();
    expect(screen.getByText('fal-ai/model')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Provider pricing' }),
    ).toHaveAttribute('href', 'https://fal.ai/models/test');
    expect(
      screen.getByRole('heading', { name: 'Usage and provider costs' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('disables only this offer through the association endpoint', async () => {
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Disable offer' }),
    );
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('logical-1', {
        executionModelId: 'fal-1',
        isActive: false,
      }),
    );
  });
  it('exposes a distinct global provider switch', async () => {
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Disable provider globally' }),
    );
    await waitFor(() =>
      expect(api.setProviderActive).toHaveBeenCalledWith('fal', false),
    );
  });
  it('saves model settings inline', async () => {
    mount();
    const name = await screen.findByLabelText('Model name');
    fireEvent.change(name, { target: { value: 'Updated model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('logical-1', {
        label: 'Updated model',
        description: 'One model, multiple providers',
      }),
    );
  });
  it('shows an error and retry when the detail cannot be loaded', async () => {
    api.detail.mockRejectedValue(new Error('unavailable'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be loaded',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
