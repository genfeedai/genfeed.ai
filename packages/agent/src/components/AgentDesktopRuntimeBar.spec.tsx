import { AgentDesktopRuntimeBar } from '@genfeedai/agent/components/AgentDesktopRuntimeBar';
import type { AgentRuntimeSelection } from '@genfeedai/agent/hooks/use-agent-runtime-selection';
import { buildAgentRuntimeCatalog } from '@genfeedai/agent/utils/agent-runtime-options.util';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const UPGRADE_MESSAGE =
  'This Codex CLI is too old to run Genfeed agent turns. Update it with `npm install -g @openai/codex@latest`, then restart Genfeed Desktop.';

function buildSelection(
  upgradesRequired: { key: string; message: string }[],
): AgentRuntimeSelection {
  const catalog = buildAgentRuntimeCatalog({
    desktopTools: {
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
      grok: false,
      upgradesRequired,
    },
  });

  return {
    catalog,
    hasDesktopCliRuntimes: false,
    onRuntimeChange: vi.fn(),
    selectedRuntime: catalog.options[0] ?? {
      category: 'auto',
      description: '',
      key: '',
      label: 'Auto',
      provider: 'genfeed',
      requestedModel: '',
    },
  };
}

describe('AgentDesktopRuntimeBar', () => {
  it('tells the user how to update a Codex CLI that is too old', () => {
    render(
      <AgentDesktopRuntimeBar
        selection={buildSelection([{ key: 'codex', message: UPGRADE_MESSAGE }])}
      />,
    );

    expect(
      screen.getByTestId('agent-desktop-runtime-notice'),
    ).toHaveTextContent('npm install -g @openai/codex@latest');
  });

  it('shows no notice when every installed CLI is ready', () => {
    render(<AgentDesktopRuntimeBar selection={buildSelection([])} />);

    expect(screen.queryByTestId('agent-desktop-runtime-notice')).toBeNull();
  });
});
