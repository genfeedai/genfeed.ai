import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseNetworkStatus, mockUseOfflineQueue } = vi.hoisted(() => ({
  mockUseNetworkStatus: vi.fn(),
  mockUseOfflineQueue: vi.fn(),
}));

vi.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: mockUseNetworkStatus,
}));

vi.mock('@/hooks/use-offline-queue', () => ({
  useOfflineQueue: mockUseOfflineQueue,
}));

import { OfflineBanner, OfflineIndicator } from '@/components/OfflineIndicator';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
    mockUseOfflineQueue.mockReturnValue({ queueLength: 0 });
  });

  it('renders nothing when online with no queued work', () => {
    const { container } = render(<OfflineIndicator />);

    expect(container.firstChild).toBeNull();
  });

  it('renders an offline message when the device is disconnected', () => {
    mockUseNetworkStatus.mockReturnValue({ isOnline: false });

    render(<OfflineIndicator />);

    expect(screen.getByText("You're offline")).toBeTruthy();
  });

  it('renders a syncing message when queued work exists', () => {
    mockUseOfflineQueue.mockReturnValue({ queueLength: 2 });

    render(<OfflineIndicator />);

    expect(screen.getByText('Syncing 2 items...')).toBeTruthy();
  });
});

describe('OfflineBanner', () => {
  it('renders the default offline banner copy', () => {
    mockUseNetworkStatus.mockReturnValue({ isOnline: false });

    render(<OfflineBanner />);

    expect(
      screen.getByText(
        "No internet connection. Changes will sync when you're back online.",
      ),
    ).toBeTruthy();
  });

  it('renders a custom offline banner message', () => {
    mockUseNetworkStatus.mockReturnValue({ isOnline: false });

    render(<OfflineBanner message="Offline draft mode is active." />);

    expect(screen.getByText('Offline draft mode is active.')).toBeTruthy();
  });
});
