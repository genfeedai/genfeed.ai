import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConnectorsAgentsContent from './content';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.ai' },
    mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ConnectorsAgentsContent', () => {
  it('offers every client the MCP setup page offers', () => {
    render(<ConnectorsAgentsContent />);

    expect(
      screen.getAllByRole('radio').map((tile) => tile.textContent),
    ).toEqual([
      expect.stringContaining('Claude Code'),
      expect.stringContaining('Claude & Cowork'),
      expect.stringContaining('Codex'),
      expect.stringContaining('Grok'),
      expect.stringContaining('Meta Muse'),
      expect.stringContaining('Other clients'),
      expect.stringContaining('Agent prompt'),
    ]);
  });

  it('shows the Claude Code steps first, with the instance MCP URL', () => {
    render(<ConnectorsAgentsContent />);

    expect(
      screen.getByRole('heading', { name: 'Add the MCP server' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp',
      ),
    ).toBeInTheDocument();
  });

  it('switches to the Grok prompt when Grok is picked', async () => {
    render(<ConnectorsAgentsContent />);

    await userEvent.click(screen.getByRole('radio', { name: /Grok/ }));

    expect(
      screen.getByRole('heading', { name: 'Paste this prompt' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy Grok prompt' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/MCP server URL: https:\/\/mcp\.genfeed\.ai\/mcp/),
    ).toBeInTheDocument();
  });
});
