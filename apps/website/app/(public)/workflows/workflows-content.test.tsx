import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowsContent from './workflows-content';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    title,
    description,
  }: {
    children: ReactNode;
    title: string;
    description: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock('@ui/marketing/PricingStrip', () => ({
  default: () => <div>Pricing Strip</div>,
}));

vi.mock('@ui/buttons/tracked/ButtonTracked', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('WorkflowsContent', () => {
  it('renders deterministic control and agent-trigger positioning', () => {
    render(<WorkflowsContent />);

    expect(
      screen.getByText('Deterministic Workflows for Agentic Systems'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Agents can trigger the workflow/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Agent-Triggered')).toBeInTheDocument();
    expect(
      screen.getByText('Deterministic workflow control for agentic execution.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Deterministic')).toBeInTheDocument();
  });
});
