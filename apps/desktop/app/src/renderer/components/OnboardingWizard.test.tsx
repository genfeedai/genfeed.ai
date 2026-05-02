import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingWizard from './OnboardingWizard';

type SessionListener = Parameters<
  typeof window.genfeedDesktop.auth.onDidChangeSession
>[0];

describe('OnboardingWizard', () => {
  const originalDesktopBridge = window.genfeedDesktop;

  afterEach(() => {
    window.genfeedDesktop = originalDesktopBridge;
    vi.restoreAllMocks();
  });

  const installDesktopBridge = () => {
    let sessionListener: SessionListener | null = null;
    const login = vi.fn().mockResolvedValue(undefined);

    window.genfeedDesktop = {
      auth: {
        login,
        onDidChangeSession: (callback: SessionListener) => {
          sessionListener = callback;
          return vi.fn();
        },
      },
    } as typeof window.genfeedDesktop;

    return {
      emitSession: () =>
        sessionListener?.({
          issuedAt: '2026-05-01T09:00:00.000Z',
          token: 'gf_desktop_key',
          userId: 'user-1',
        }),
      login,
    };
  };

  it('makes Genfeed server credits the default onboarding path', async () => {
    const bridge = installDesktopBridge();
    const onComplete = vi.fn();

    render(<OnboardingWizard onComplete={onComplete} />);

    expect(screen.getByText(/defaults to the Genfeed server/i)).toBeVisible();
    expect(screen.getByText(/do not need Replicate, fal.ai/i)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(
      screen.getByRole('button', { name: /use Genfeed credits/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: /set up my own local provider instead/i,
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: /use Genfeed credits/i }),
    );

    await waitFor(() => expect(bridge.login).toHaveBeenCalledTimes(1));
  });

  it('completes onboarding after the desktop cloud session arrives', () => {
    const bridge = installDesktopBridge();
    const onComplete = vi.fn();

    render(<OnboardingWizard onComplete={onComplete} />);

    bridge.emitSession();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
