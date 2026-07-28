import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/agent/components/AgentThreadList', () => ({
  AgentThreadList: ({ searchAction }: { searchAction?: ReactNode }) => (
    <div>
      {searchAction}
      <div>Thread list</div>
    </div>
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/test-org/test-brand${path}`,
    orgHref: (path: string) => `/test-org/~${path}`,
  }),
}));

vi.mock('next/link', () => ({
  default: function MockLink(props: {
    children?: ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
    'aria-label'?: string;
  }) {
    return (
      <a
        aria-label={props['aria-label']}
        className={props.className}
        href={props.href}
        onClick={props.onClick}
      >
        {props.children}
      </a>
    );
  },
}));

describe('AgentSidebarContent', () => {
  it('renders semantic links for overview and new thread', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(
      screen.getByRole('link', { name: 'Back to overview' }),
    ).toHaveAttribute('href', '/test-org/test-brand/overview');
    expect(
      screen.getByRole('link', { name: 'New agent thread' }),
    ).toHaveAttribute('href', '/test-org/~/agent/new');
  });

  it('uses a compact new-thread action beside the conversation controls', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(
      screen.getByRole('link', { name: 'New agent thread' }),
    ).toBeInTheDocument();
  });

  it('keeps the sidebar focused on agent actions and threads', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(
      screen.getByRole('link', { name: 'New agent thread' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Thread list')).toBeInTheDocument();
  });

  it('does not render automation or connection chrome', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(
      screen.queryByRole('link', { name: 'Automations' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Executions' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Workflows')).not.toBeInTheDocument();
  });

  it('renders thread list below agent actions', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(screen.getByText('Thread list')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to overview' }),
    ).toBeInTheDocument();
  });
});
