import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowSidebar } from './WorkflowSidebar';
import { WorkflowSidebarContent } from './WorkflowSidebarContent';

const pathnameMock = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn().mockResolvedValue({
      list: vi.fn().mockResolvedValue([]),
    }),
  ),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@ui/menus/sidebar-back-row/SidebarBackRow', () => ({
  default: (props: { href: string; label: string }) => (
    <a href={props.href}>{props.label}</a>
  ),
}));

vi.mock('@workflow-cloud/components/workflow-sidebar.shared', () => ({
  formatWorkflowRelativeTime: () => 'just now',
  WorkflowLifecycleDot: () => <div data-testid="workflow-lifecycle-dot" />,
}));

vi.mock('@workflow-cloud/services/workflow-api', () => ({
  createWorkflowApiService: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

describe('Workflow sidebar navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/workflows');
  });

  it('uses the canonical agent workflows root for the library link', async () => {
    render(<WorkflowSidebarContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Library' }).getAttribute('href'),
      ).toBe('/workflows');
      expect(
        screen.getByRole('link', { name: 'Templates' }).getAttribute('href'),
      ).toBe('/workflows/templates');
      expect(
        screen.getByRole('link', { name: 'Executions' }).getAttribute('href'),
      ).toBe('/workflows/executions');
    });
  });

  it('does not emit the deprecated library alias in the persistent sidebar', async () => {
    const { container } = render(<WorkflowSidebar />);

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Library' }).getAttribute('href'),
      ).toBe('/workflows');
      expect(container.querySelector('a[href="/workflows"]')).toBeNull();
    });
  });
});
