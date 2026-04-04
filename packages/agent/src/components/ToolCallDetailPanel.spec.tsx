import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    children?: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
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

import { ToolCallDetailPanel } from './ToolCallDetailPanel';

describe('ToolCallDetailPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('copies available error details to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });

    render(
      <ToolCallDetailPanel
        error='Schema has not been registered for model "User".'
        resultSummary="Use mongoose.model(name, schema)"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy error details' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'Schema has not been registered for model "User".\n\nUse mongoose.model(name, schema)',
      );
    });
  });
});
