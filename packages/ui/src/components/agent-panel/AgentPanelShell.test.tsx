'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AgentPanelShell from './AgentPanelShell';

// Mock Button — avoids deep @genfeedai/contracts + CVA dependency chain
vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
    ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
  }) => (
    <button type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Maximize2: () => <span data-testid="icon-expand" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
}));

vi.mock('@genfeedai/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/contracts')>()),
  ButtonSize: { DEFAULT: 'default', ICON: 'icon' },
  ButtonVariant: { GHOST: 'ghost', SOFT: 'soft' },
}));

const chatContent = <div data-testid="chat-content">Chat</div>;

const defaultProps = {
  chatContent,
  isOpen: true,
  onToggle: vi.fn(),
};

describe('AgentPanelShell', () => {
  it('renders chatContent when isOpen=true', () => {
    render(<AgentPanelShell {...defaultProps} />);
    expect(screen.getByTestId('chat-content')).toBeInTheDocument();
  });

  it('renders default title when no title prop', () => {
    render(<AgentPanelShell {...defaultProps} />);
    expect(screen.getByText('Console')).toBeInTheDocument();
  });

  it('renders custom title (subtitle prop accepted but not rendered)', () => {
    render(
      <AgentPanelShell
        {...defaultProps}
        title="My Agent"
        subtitle="Helping you"
      />,
    );
    expect(screen.getByText('My Agent')).toBeInTheDocument();
    expect(screen.queryByText('Helping you')).not.toBeInTheDocument();
  });

  it('calls onToggle when toggle button clicked', () => {
    const onToggle = vi.fn();
    render(<AgentPanelShell {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText('Collapse terminal'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows "Expand terminal" aria-label when isOpen=false', () => {
    render(<AgentPanelShell {...defaultProps} isOpen={false} />);
    expect(screen.getByLabelText('Expand terminal')).toBeInTheDocument();
  });

  it('body has opacity-0 class when isOpen=false', () => {
    render(
      <AgentPanelShell
        {...defaultProps}
        isOpen={false}
        chatContent={<div data-testid="chat-content">Chat</div>}
      />,
    );
    const body = screen
      .getByTestId('chat-content')
      .closest('[data-panel-body]');
    expect(body).toHaveClass('opacity-0');
  });

  it('switches to Outputs tab and shows outputsContent', async () => {
    const outputsContent = <div data-testid="outputs-content">Outputs</div>;
    render(
      <AgentPanelShell {...defaultProps} outputsContent={outputsContent} />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Outputs' }));
    expect(screen.getByTestId('outputs-content')).toBeInTheDocument();
    // chat tab slot should be hidden
    expect(screen.getByTestId('chat-content').parentElement).toHaveClass(
      'hidden',
    );
  });

  it('switches back to Chat tab', async () => {
    const outputsContent = <div data-testid="outputs-content">Outputs</div>;
    render(
      <AgentPanelShell {...defaultProps} outputsContent={outputsContent} />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Outputs' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Terminal' }));
    expect(screen.getByTestId('chat-content').parentElement).not.toHaveClass(
      'hidden',
    );
  });

  it('calls onExpand when expand button clicked', () => {
    const onExpand = vi.fn();
    render(<AgentPanelShell {...defaultProps} onExpand={onExpand} />);
    fireEvent.click(screen.getByLabelText('Open full agent workspace'));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('does not render expand button when onExpand not provided', () => {
    render(<AgentPanelShell {...defaultProps} />);
    expect(
      screen.queryByLabelText('Open full agent workspace'),
    ).not.toBeInTheDocument();
  });

  it('starts on outputs tab when defaultTab="outputs"', () => {
    const outputsContent = <div data-testid="outputs-content">Outputs</div>;
    render(
      <AgentPanelShell
        {...defaultProps}
        outputsContent={outputsContent}
        defaultTab="outputs"
      />,
    );
    // chat slot should be hidden when outputs is default
    expect(screen.getByTestId('chat-content').parentElement).toHaveClass(
      'hidden',
    );
    expect(screen.getByTestId('outputs-content').parentElement).not.toHaveClass(
      'hidden',
    );
  });
});
