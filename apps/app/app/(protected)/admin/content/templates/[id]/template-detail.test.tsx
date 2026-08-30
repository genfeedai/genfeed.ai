import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TemplateDetail from './template-detail';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  getTemplate: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ getTemplate: mocks.getTemplate }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

const notificationsServiceInstance = vi.hoisted(() => ({
  error: mocks.error,
  success: mocks.success,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsServiceInstance,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe('TemplateDetail shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading shell immediately while the template is loading', () => {
    mocks.getTemplate.mockReturnValueOnce(new Promise(() => undefined));

    render(<TemplateDetail templateId="template-1" />);

    expect(screen.getByTestId('template-detail-shell')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Template' })).toBeVisible();
    expect(
      screen.queryByText(
        'The template you are looking for does not exist or has been deleted.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the not-found card inside the shell once loading resolves with no template', async () => {
    mocks.getTemplate.mockResolvedValueOnce(null);

    render(<TemplateDetail templateId="template-1" />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'The template you are looking for does not exist or has been deleted.',
        ),
      ).toBeVisible();
    });
    expect(screen.getByTestId('template-detail-shell')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Template' })).toBeVisible();
  });
});
