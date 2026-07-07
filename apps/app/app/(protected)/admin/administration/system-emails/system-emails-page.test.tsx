import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemEmailsPage from './system-emails-page';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  getSystemEmails: vi.fn(),
  info: vi.fn(),
}));

const getSystemEmailsService = vi.hoisted(() =>
  vi.fn(async () => ({
    getSystemEmails: mocks.getSystemEmails,
  })),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getSystemEmailsService,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.error,
    info: mocks.info,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="card">{children}</div>
  ),
}));

vi.mock('@ui/card/empty/CardEmpty', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description: string;
    label: string;
  }) => (
    <section aria-label={label}>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

vi.mock('@ui/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

describe('SystemEmailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemEmails.mockResolvedValue([
      {
        action: {
          label: 'Start onboarding',
          path: '/onboarding',
          type: 'app-path',
        },
        audience: 'New cloud signups',
        id: 'welcome-day-0',
        name: 'Welcome day 0',
        paragraphs: ['{{greeting}}, welcome to Genfeed.ai.'],
        preheader: 'Start your Genfeed.ai onboarding path.',
        schedule: 'Immediately after signup',
        sequence: 'welcome',
        skipRules: ['Recipient is missing, deleted, or unsubscribed.'],
        step: 'welcome-day-0',
        subject: 'Welcome to Genfeed.ai',
        systemWorkflowId: 'system.lifecycle-email.welcome-day-0',
        title: 'Your Genfeed workspace is ready',
        trigger: 'User signs up',
        visibility: 'admin-only',
      },
    ]);
  });

  it('loads and renders lifecycle system email copy and triggers', async () => {
    render(<SystemEmailsPage />);

    await waitFor(() => {
      expect(mocks.getSystemEmails).toHaveBeenCalledWith(
        expect.any(AbortSignal),
      );
    });

    expect(screen.getByText('Welcome day 0')).toBeInTheDocument();
    expect(screen.getByText('User signs up')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Genfeed.ai')).toBeInTheDocument();
    expect(
      screen.getByText('Hi {first name}, welcome to Genfeed.ai.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('system.lifecycle-email.welcome-day-0'),
    ).toBeInTheDocument();
  });
});
