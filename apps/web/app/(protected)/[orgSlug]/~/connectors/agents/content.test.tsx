import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectorsAgentsContent from './content';

const navigation = vi.hoisted(() => ({ search: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.ai' },
    mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
  },
}));

describe('ConnectorsAgentsContent', () => {
  beforeEach(() => {
    navigation.search = '';
  });

  it('opens on the Claude steps, with the instance MCP URL', () => {
    render(<ConnectorsAgentsContent />);

    expect(screen.getByRole('heading', { name: 'Claude' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp',
      ),
    ).toBeInTheDocument();
  });

  it('shows the Grok prompt for ?client=grok', () => {
    navigation.search = 'client=grok';
    render(<ConnectorsAgentsContent />);

    expect(
      screen.getByRole('heading', { name: 'Paste this prompt' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy Grok prompt' }),
    ).toBeInTheDocument();
  });

  it('falls back to Claude for an unknown client', () => {
    navigation.search = 'client=nope';
    render(<ConnectorsAgentsContent />);

    expect(screen.getByRole('heading', { name: 'Claude' })).toBeInTheDocument();
  });
});
