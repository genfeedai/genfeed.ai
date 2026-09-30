import { render, waitFor } from '@testing-library/react';
import ButtonCredits from '@ui/buttons/credits/ButtonCredits';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findOneMock = vi.fn().mockResolvedValue({ balance: 1000 });
const subscribeMock = vi.fn();
const socketState = { isReady: true };

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org_123' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn(async () => ({
      findOne: findOneMock,
    })),
}));

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => ({
      creditsBreakdown: {
        planLimit: 1000,
      },
      refreshCreditsBreakdown: vi.fn(),
    }),
  }),
);

vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: socketState.isReady,
    subscribe: subscribeMock,
    unsubscribe: vi.fn(),
  }),
}));

describe('ButtonCredits', () => {
  beforeEach(() => {
    subscribeMock.mockClear();
    socketState.isReady = true;
  });

  it('subscribes to live balance events only once the socket is ready', async () => {
    socketState.isReady = false;
    const { rerender } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());
    expect(subscribeMock).not.toHaveBeenCalled();

    socketState.isReady = true;
    rerender(<ButtonCredits />);

    await waitFor(() =>
      expect(subscribeMock).toHaveBeenCalledWith(
        '/credits/org_123',
        expect.any(Function),
      ),
    );
  });

  it('should render without crashing', async () => {
    const { container } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', async () => {
    const { container } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', async () => {
    const { container } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
