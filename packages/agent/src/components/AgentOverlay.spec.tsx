import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@cloud/agent/components/AgentPanel', () => ({
  AgentPanel: () => <div data-testid="agent-panel-mock" />,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    className?: string;
    onClick?: () => void;
    withWrapper?: boolean;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        className={props.className}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

import { AgentOverlay } from '@cloud/agent/components/AgentOverlay';

describe('AgentOverlay', () => {
  it('renders the overlay controls on non-agent routes and opens the drawer on demand', () => {
    mockUsePathname.mockReturnValue('/overview');

    render(<AgentOverlay apiService={{} as never} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByTestId('agent-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('agent-panel-mock').closest('aside')).toHaveClass(
      'translate-x-full',
    );

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByRole('button')[1]).toHaveClass(
      'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm',
    );
    expect(screen.getByTestId('agent-panel-mock').closest('aside')).toHaveClass(
      'translate-x-0',
    );
  });

  it('returns null on dedicated agent routes', () => {
    mockUsePathname.mockReturnValue('/chat/thread-123');

    const { container } = render(<AgentOverlay apiService={{} as never} />);

    expect(container).toBeEmptyDOMElement();
  });
});
