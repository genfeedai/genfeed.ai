import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard }),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    icon?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        onClick={props.onClick}
      >
        {props.icon}
        {props.children}
      </button>
    );
  },
}));

import {
  AgentRunFailureCard,
  buildAgentRunFailureCopyText,
} from './AgentRunFailureCard';

describe('AgentRunFailureCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('copies a full diagnostic payload including the raw error', async () => {
    copyToClipboard.mockClear();

    const raw =
      'Invalid `prisma.post.create()` invocation:\nUnknown argument `visibility`.';

    render(<AgentRunFailureCard error={raw} onRetry={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy error' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalled();
    });
    const copied = copyToClipboard.mock.calls[0]?.[0] as string;
    expect(copied).toContain('## Agent run failure');
    expect(copied).toContain('Data save failed');
    expect(copied).toContain('Unknown argument `visibility`');
    expect(copied).toContain('### Raw error');
  });

  it('buildAgentRunFailureCopyText includes title and recovery', () => {
    const text = buildAgentRunFailureCopyText('Failed to fetch');
    expect(text).toContain('Connection interrupted');
    expect(text).toContain('Failed to fetch');
  });

  it('uses a compact solid surface instead of a translucent destructive fill', () => {
    render(<AgentRunFailureCard error="Failed to fetch" />);

    const card = screen.getByRole('alert');
    expect(card).toHaveClass('max-w-2xl');
    expect(card).toHaveClass('bg-background-secondary');
    expect(card).toHaveClass('shadow-border');
    expect(card).not.toHaveClass('bg-destructive/15');
  });
});
