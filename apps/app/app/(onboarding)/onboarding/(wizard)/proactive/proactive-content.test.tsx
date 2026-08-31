import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProactiveContent from './proactive-content';

const mocks = vi.hoisted(() => ({
  claimProactiveWorkspace: vi.fn(),
  getProactiveWorkspace: vi.fn(),
  getToken: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: mocks.getToken }),
}));

vi.mock('@genfeedai/hooks/ui/use-visible-polling/use-visible-polling', () => ({
  useVisiblePolling: () => undefined,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}));

vi.mock('@services/onboarding/onboarding.service', () => ({
  OnboardingService: {
    getInstance: () => ({
      claimProactiveWorkspace: mocks.claimProactiveWorkspace,
      getProactiveWorkspace: mocks.getProactiveWorkspace,
    }),
  },
}));

vi.mock('./proactive-error-state', () => ({
  default: () => <div>Error state</div>,
}));

vi.mock('./proactive-hero-card', () => ({
  default: ({ workspace }: { workspace: { summary: string } }) => (
    <div>{workspace.summary}</div>
  ),
}));

vi.mock('./proactive-outputs-card', () => ({
  default: () => <div>Outputs</div>,
}));

vi.mock('./proactive-workspace-sidebar', () => ({
  default: () => <div>Sidebar</div>,
}));

describe('ProactiveContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue('test-token');
  });

  it('renders an in-region loading placeholder while the workspace claim is in flight, then the workspace', async () => {
    let resolveClaim!: (value: unknown) => void;
    mocks.claimProactiveWorkspace.mockReturnValue(
      new Promise((resolve) => {
        resolveClaim = resolve;
      }),
    );

    render(<ProactiveContent />);

    expect(
      screen.getByTestId('proactive-workspace-loading'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sidebar')).not.toBeInTheDocument();

    resolveClaim({
      organization: { label: 'Acme' },
      outputs: [],
      prepPercent: 40,
      prepStage: 'drafting',
      summary: 'Your workspace is warming up.',
    });

    expect(
      await screen.findByText('Your workspace is warming up.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('proactive-workspace-loading'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Outputs')).toBeInTheDocument();
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
  });

  it('renders the error state when neither claim nor fallback fetch resolve a workspace', async () => {
    mocks.claimProactiveWorkspace.mockRejectedValue(new Error('claim failed'));
    mocks.getProactiveWorkspace.mockRejectedValue(new Error('fetch failed'));

    render(<ProactiveContent />);

    await waitFor(() => {
      expect(
        screen.queryByTestId('proactive-workspace-loading'),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('Error state')).toBeInTheDocument();
  });
});
