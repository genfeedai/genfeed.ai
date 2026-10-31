import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandBlock from './agent-client-command-block';

const copy = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: copy }) },
}));

describe('connector copy control', () => {
  it('copies the exact URL through the shared clipboard service', async () => {
    render(
      <CommandBlock
        label="Genfeed connector URL"
        value="https://mcp.genfeed.ai/mcp"
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Genfeed connector URL' }),
    );
    await waitFor(() =>
      expect(copy).toHaveBeenCalledWith('https://mcp.genfeed.ai/mcp'),
    );
  });
});
