import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/agent/components/AgentThreadList', () => ({
  AGENT_REFRESH_CONVERSATIONS_EVENT: 'agent:threads:refresh',
  AgentThreadList: () => <div>Thread list</div>,
}));

vi.mock('@ui/menus/sidebar-search-trigger/SidebarSearchTrigger', () => ({
  default: function MockSidebarSearchTrigger(props: { onClick?: () => void }) {
    return (
      <button type="button" onClick={props.onClick}>
        Search
      </button>
    );
  },
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
  it('renders semantic links for overview and new chat', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(
      screen.getByRole('link', { name: 'Back to overview' }),
    ).toHaveAttribute('href', '/overview');
    expect(screen.getByRole('link', { name: /New Chat/ })).toHaveAttribute(
      'href',
      '/chat/new',
    );
  });

  it('shows keyboard shortcut badge on the new chat link', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(screen.getByText('⌘⇧N')).toBeInTheDocument();
  });

  it('keeps the sidebar focused on chat actions and threads', () => {
    render(<AgentSidebarContent apiService={{} as never} />);

    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
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
