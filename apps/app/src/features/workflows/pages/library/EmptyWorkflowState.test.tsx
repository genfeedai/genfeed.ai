import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EmptyWorkflowState from './EmptyWorkflowState';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/moonrise-org/moonrise-studio${path}`,
  }),
}));

describe('EmptyWorkflowState', () => {
  it('renders translated empty-library labels and actions', () => {
    render(<EmptyWorkflowState />);

    expect(screen.getByText('No workflows yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create your first workflow for a fixed, repeatable automation pipeline.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse Templates' }),
    ).toHaveAttribute(
      'href',
      '/moonrise-org/moonrise-studio/automation/workflows/templates',
    );
    expect(
      screen.getByRole('link', { name: 'Create Workflow' }),
    ).toHaveAttribute(
      'href',
      '/moonrise-org/moonrise-studio/automation/workflows/new',
    );
  });
});
