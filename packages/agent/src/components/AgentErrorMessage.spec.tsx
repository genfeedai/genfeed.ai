import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/button', () => ({
  Button: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

import { AgentErrorMessage } from './AgentErrorMessage';

describe('AgentErrorMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('copies the complete error message', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(
      <AgentErrorMessage message="Generation failed: Prisma rejected prompt" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy error' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'Generation failed: Prisma rejected prompt',
      );
    });
  });

  it('displays human-readable connection copy for bare Generation failed: 500', () => {
    render(<AgentErrorMessage message="Generation failed: 500" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Connection interrupted/i,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'Generation failed: 500',
    );
  });

  it('keeps scrubbed generic details actionable', () => {
    render(<AgentErrorMessage message="Selected model is unavailable" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Selected model is unavailable',
    );
  });

  it('keeps trusted step context while hiding classified provider details', () => {
    render(
      <AgentErrorMessage message={'Failed at: Generate Clip\nGPU timeout'} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed at: Generate Clip',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('GPU timeout');
  });
});
