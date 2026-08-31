import '@testing-library/jest-dom/vitest';
import { WorkflowLifecycle } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowEditorSectionTopbar } from './WorkflowEditorSectionTopbar';

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({ hasCanonicalBreadcrumb: true }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (route: string) => `/acme/moonrise${route}`,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      archive: 'Archive',
      menu: 'Workflow actions',
      publish: 'Publish',
      run: 'Run',
      running: 'Running…',
      schedule: 'Schedule',
      scheduleTooltip: 'Set a recurring schedule',
    };

    return labels[key] ?? key;
  },
}));

function renderTopbar(
  overrides: Partial<ComponentProps<typeof WorkflowEditorSectionTopbar>> = {},
) {
  const props = {
    estimateLabel: 'Typical run ~2m',
    isRunning: false,
    lifecycle: WorkflowLifecycle.DRAFT,
    onArchive: vi.fn(),
    onPublish: vi.fn(),
    onRun: vi.fn(),
    onSchedule: vi.fn(),
    title: 'Launch workflow',
    ...overrides,
  };

  render(<WorkflowEditorSectionTopbar {...props} />);
  return props;
}

describe('WorkflowEditorSectionTopbar', () => {
  it('keeps route navigation and lifecycle actions in shared module chrome', () => {
    renderTopbar();

    const topbar = screen.getByTestId('section-topbar');
    const tabs = screen.getByTestId('section-topbar-tabs');
    const actions = screen.getByTestId('section-topbar-actions');
    const heading = screen.getByRole('heading', { name: 'Launch workflow' });
    const workflowsLink = screen.getByRole('link', { name: 'Workflows' });

    expect(topbar).toHaveClass('shrink-0');
    expect(heading).toHaveClass('sr-only');
    expect(tabs).toContainElement(workflowsLink);
    expect(workflowsLink).toHaveAttribute(
      'href',
      '/acme/moonrise/automation/workflows',
    );
    expect(actions).toContainElement(
      screen.getByRole('button', { name: 'Run' }),
    );
    expect(actions).toContainElement(
      screen.getByRole('button', { name: 'Publish' }),
    );
    expect(actions).toContainElement(
      screen.getByRole('button', { name: 'Schedule' }),
    );
  });

  it('keeps dense actions on one row and moves Archive into overflow', () => {
    const props = renderTopbar();

    expect(screen.getByTestId('workflow-editor-section-actions')).toHaveClass(
      'flex-nowrap',
    );
    expect(screen.getByText('Typical run ~2m')).toHaveClass(
      'hidden',
      '2xl:inline-flex',
    );

    const trigger = screen.getByRole('button', { name: 'Workflow actions' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(props.onArchive).toHaveBeenCalledTimes(1);
  });

  it('hides draft-only actions and disables Run while a workflow is running', () => {
    renderTopbar({
      isRunning: true,
      lifecycle: WorkflowLifecycle.PUBLISHED,
      onSchedule: undefined,
    });

    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Publish' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Schedule' }),
    ).not.toBeInTheDocument();
  });
});
