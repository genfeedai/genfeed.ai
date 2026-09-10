import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowTemplateDetailsDialog } from './WorkflowTemplateDetailsDialog';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('../library/WorkflowCardPreview', () => ({
  default: ({ name }: { name: string }) => <div>{name} preview</div>,
}));

describe('WorkflowTemplateDetailsDialog', () => {
  it('shows the full description and supporting metadata', () => {
    render(
      <WorkflowTemplateDetailsDialog
        actionLabel="Install"
        categoryLabel="Analytics"
        changeSummary="Sends a daily digest email."
        description="Scan the latest social trends daily and email a curated digest to the organization owner. Uses credits per delivered email."
        isOpen
        onOpenChange={vi.fn()}
        scheduleLabel="Daily"
        sourceLabel="Available"
        title="Daily Trends Digest"
        preview={{ name: 'Daily Trends Digest' }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Daily Trends Digest' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Scan the latest social trends daily and email a curated digest to the organization owner. Uses credits per delivered email.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText('Sends a daily digest email.')).toBeInTheDocument();
    expect(screen.getByText('Daily Trends Digest preview')).toBeInTheDocument();
  });
});
