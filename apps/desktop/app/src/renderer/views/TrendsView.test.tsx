import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendsView } from './TrendsView';

const cloudApi = {
  getTrends: vi.fn(),
};

describe('TrendsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cloudApi.getTrends.mockReset();

    Object.defineProperty(window, 'genfeedDesktop', {
      configurable: true,
      value: {
        cloud: cloudApi,
      },
    });
  });

  it('shows an offline state without calling the cloud API', async () => {
    render(
      <TrendsView
        isCloudConnected
        isOnline={false}
        onGenerateFromTrend={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText('Trend discovery is offline'),
      ).toBeInTheDocument(),
    );

    expect(cloudApi.getTrends).not.toHaveBeenCalled();
  });

  it('shows a retryable API failure state', async () => {
    cloudApi.getTrends.mockRejectedValue(new Error('API unavailable'));

    render(
      <TrendsView
        isCloudConnected
        isOnline
        onGenerateFromTrend={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Unable to load trends')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(cloudApi.getTrends).toHaveBeenCalledTimes(2));
  });

  it('shows an empty state for a successful empty trends response', async () => {
    cloudApi.getTrends.mockResolvedValue([]);

    render(
      <TrendsView
        isCloudConnected
        isOnline
        onGenerateFromTrend={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('No trends found')).toBeInTheDocument(),
    );
  });
});
