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
});
