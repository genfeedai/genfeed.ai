import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import '@testing-library/jest-dom/vitest';
import { MediaType } from '@genfeedai/contracts';
import type { WorkflowTemplateDetailsPanelProps } from '@genfeedai/props/workflows/workflow-template-details-panel.props';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowTemplateDetailsPanel } from './WorkflowTemplateDetailsPanel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../library/WorkflowCardPreview', () => ({
  default: ({ name }: { name: string }) => <div>{name} preview</div>,
}));

function renderPanel(props: WorkflowTemplateDetailsPanelProps) {
  return render(
    <ContextSidebarProvider>
      <WorkflowTemplateDetailsPanel {...props} />
      <ContextSidebarOutlet testId="rail" />
    </ContextSidebarProvider>,
  );
}

describe('WorkflowTemplateDetailsPanel', () => {
  it('shows the full description and supporting metadata in the sidebar', () => {
    renderPanel({
      actionLabel: 'Install',
      categoryLabel: 'Analytics',
      changeSummary: 'Sends a daily digest email.',
      description:
        'Scan the latest social trends daily and email a curated digest to the organization owner. Uses credits per delivered email.',
      id: 'template-1',
      onClose: vi.fn(),
      preview: { name: 'Daily Trends Digest' },
      scheduleLabel: 'Daily',
      sourceLabel: 'Available',
      title: 'Daily Trends Digest',
    });

    const panel = within(screen.getByTestId('rail')).getByTestId(
      'workflow-template-details-panel',
    );
    expect(
      within(panel).getByText(
        'Scan the latest social trends daily and email a curated digest to the organization owner. Uses credits per delivered email.',
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText('Analytics')).toBeInTheDocument();
    expect(within(panel).getByText('Daily')).toBeInTheDocument();
    expect(
      within(panel).getByText('Sends a daily digest email.'),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText('Daily Trends Digest preview'),
    ).toBeInTheDocument();
  });

  it('previews the template by its example output when it has one', () => {
    renderPanel({
      actionLabel: 'Use template',
      categoryLabel: 'Social Media',
      description: 'Post to every social channel at once.',
      id: 'template-1',
      onClose: vi.fn(),
      preview: {
        exampleOutput: {
          mediaType: MediaType.IMAGE,
          url: 'https://cdn.example.com/examples/social-blast.png',
        },
        name: 'Social blast',
      },
      sourceLabel: 'Available',
      title: 'Social blast',
    });

    expect(
      screen.getByRole('img', { name: 'Example output from Social blast' }),
    ).toHaveAttribute(
      'src',
      'https://cdn.example.com/examples/social-blast.png',
    );
    expect(screen.queryByText('Social blast preview')).not.toBeInTheDocument();
  });

  it('installs from the sidebar action, or links when there is a page', () => {
    const onInstall = vi.fn();
    const { unmount } = renderPanel({
      actionLabel: 'Install',
      categoryLabel: 'Analytics',
      description: 'Digest',
      id: 'template-1',
      onClose: vi.fn(),
      onInstall,
      sourceLabel: 'Available',
      title: 'Digest',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    unmount();

    renderPanel({
      actionLabel: 'Use template',
      categoryLabel: 'Analytics',
      description: 'Digest',
      href: '/workflows/new',
      id: 'template-1',
      onClose: vi.fn(),
      sourceLabel: 'Available',
      title: 'Digest',
    });
    expect(screen.getByRole('link', { name: 'Use template' })).toHaveAttribute(
      'href',
      '/workflows/new',
    );
  });

  it('renders nothing while no template is selected', () => {
    renderPanel({
      actionLabel: 'Install',
      categoryLabel: '',
      description: '',
      id: null,
      onClose: vi.fn(),
      sourceLabel: '',
      title: '',
    });

    expect(
      screen.queryByTestId('workflow-template-details-panel'),
    ).not.toBeInTheDocument();
  });
});
