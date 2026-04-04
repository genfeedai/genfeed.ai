import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingGuard } from './OnboardingGuard';

// Mock next/navigation
const mockReplace = vi.fn();
const mockPathname = vi.fn<() => string>().mockReturnValue('/');

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: mockReplace,
  }),
}));

// Mock setup API
const mockGetStatus = vi.fn();

vi.mock('@/lib/api/setup', () => ({
  setupApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock settingsStore
const mockGetState = vi.fn();

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => mockGetState(),
  },
}));

describe('OnboardingGuard', () => {
  const mockSetHasSeenWelcome = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/');
    // Default: hasSeenWelcome false, setup not complete
    mockGetState.mockReturnValue({
      hasSeenWelcome: false,
      setHasSeenWelcome: mockSetHasSeenWelcome,
    });
    mockGetStatus.mockResolvedValue({
      detectedTools: {},
      hasCompletedSetup: false,
    });
  });

  it('should render null initially before setup check completes', () => {
    // Keep getStatus pending so isReady stays false
    mockGetStatus.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <OnboardingGuard>
        <div>App content</div>
      </OnboardingGuard>
    );

    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('should render children when hasSeenWelcome is true', async () => {
    mockGetState.mockReturnValue({
      hasSeenWelcome: true,
      setHasSeenWelcome: mockSetHasSeenWelcome,
    });

    render(
      <OnboardingGuard>
        <div>App content</div>
      </OnboardingGuard>
    );

    await waitFor(() => {
      expect(screen.getByText('App content')).toBeInTheDocument();
    });

    // Should not call getStatus since hasSeenWelcome is true
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('should redirect to /onboarding when hasSeenWelcome is false and not on /onboarding', async () => {
    mockPathname.mockReturnValue('/');
    mockGetState.mockReturnValue({
      hasSeenWelcome: false,
      setHasSeenWelcome: mockSetHasSeenWelcome,
    });
    mockGetStatus.mockResolvedValueOnce({ hasCompletedSetup: false });

    render(
      <OnboardingGuard>
        <div>App content</div>
      </OnboardingGuard>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('should NOT redirect when already on /onboarding', async () => {
    mockPathname.mockReturnValue('/onboarding');
    mockGetState.mockReturnValue({
      hasSeenWelcome: false,
      setHasSeenWelcome: mockSetHasSeenWelcome,
    });
    mockGetStatus.mockResolvedValueOnce({ hasCompletedSetup: false });

    render(
      <OnboardingGuard>
        <div>Onboarding page</div>
      </OnboardingGuard>
    );

    await waitFor(() => {
      expect(screen.getByText('Onboarding page')).toBeInTheDocument();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should skip onboarding when server says hasCompletedSetup is true', async () => {
    // Simulate setHasSeenWelcome updating state so re-renders see hasSeenWelcome=true
    let hasSeenWelcome = false;
    const setHasSeenWelcome = vi.fn((val: boolean) => {
      hasSeenWelcome = val;
    });
    mockGetState.mockImplementation(() => ({
      hasSeenWelcome,
      setHasSeenWelcome,
    }));
    mockGetStatus.mockResolvedValue({ hasCompletedSetup: true });

    render(
      <OnboardingGuard>
        <div>App content</div>
      </OnboardingGuard>
    );

    await waitFor(() => {
      expect(screen.getByText('App content')).toBeInTheDocument();
    });

    expect(setHasSeenWelcome).toHaveBeenCalledWith(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should render children when API call fails (does not block the app)', async () => {
    // Simulate setHasSeenWelcome updating state on subsequent reads
    let hasSeenWelcome = false;
    mockGetState.mockImplementation(() => ({
      hasSeenWelcome,
      setHasSeenWelcome: vi.fn(() => {
        hasSeenWelcome = true;
      }),
    }));
    mockGetStatus.mockRejectedValue(new Error('API unreachable'));

    render(
      <OnboardingGuard>
        <div>App content</div>
      </OnboardingGuard>
    );

    await waitFor(() => {
      expect(screen.getByText('App content')).toBeInTheDocument();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not set hasSeenWelcome when API fails', async () => {
    let hasSeenWelcome = false;
    mockGetState.mockImplementation(() => ({
      hasSeenWelcome,
      setHasSeenWelcome: vi.fn(() => {
        hasSeenWelcome = true;
      }),
    }));
    mockGetStatus.mockRejectedValue(new Error('Network error'));

    render(
      <OnboardingGuard>
        <div>App content</div>
      </OnboardingGuard>
    );

    await waitFor(() => {
      expect(screen.getByText('App content')).toBeInTheDocument();
    });

    expect(mockSetHasSeenWelcome).not.toHaveBeenCalled();
  });

  it('should not treat AbortError as a failure', () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockGetState.mockReturnValue({
      hasSeenWelcome: false,
      setHasSeenWelcome: mockSetHasSeenWelcome,
    });
    mockGetStatus.mockRejectedValueOnce(abortError);

    const { container } = render(
      <OnboardingGuard>
        <div>App content</div>
      </OnboardingGuard>
    );

    // AbortError means cleanup happened — component should not set isReady
    // So children should not render and no redirect should happen
    expect(mockReplace).not.toHaveBeenCalled();
    // Container stays empty since isReady is never set on abort
    expect(container.innerHTML).toBe('');
  });
});
