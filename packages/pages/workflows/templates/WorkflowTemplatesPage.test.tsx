import WorkflowTemplatesPage from '@pages/workflows/templates/WorkflowTemplatesPage';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const listTemplatesMock = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn().mockResolvedValue({
      listTemplates: listTemplatesMock,
    }),
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('WorkflowTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    listTemplatesMock.mockResolvedValue([]);
    const { container } = render(<WorkflowTemplatesPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('shows the real-estate template category and real-estate templates', async () => {
    listTemplatesMock.mockResolvedValue([
      {
        category: 'real-estate',
        description: 'Stage poor listing photos realistically',
        id: 'virtual-staging-rescue',
        name: 'Virtual Staging Rescue',
        steps: [],
      },
    ]);

    render(<WorkflowTemplatesPage />);

    expect(await screen.findByText('Real Estate')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Virtual Staging Rescue')).toBeInTheDocument();
    });
  });
});
