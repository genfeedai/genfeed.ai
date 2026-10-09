import { AgentRuntimeSelector } from '@genfeedai/agent/components/AgentRuntimeSelector';
import {
  buildAgentRuntimeCatalog,
  DESKTOP_CODEX_CLI_RUNTIME_OPTION,
  HOSTED_GENFEED_RUNTIME_OPTION,
} from '@genfeedai/agent/utils/agent-runtime-options.util';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const hosted = buildAgentRuntimeCatalog({});
const desktop = buildAgentRuntimeCatalog({
  desktopTools: {
    anyDetected: true,
    claude: false,
    codex: true,
    detected: ['codex'],
    grok: false,
    upgradesRequired: [],
  },
});

describe('AgentRuntimeSelector', () => {
  it('offers the hosted choices with a checked default and no explanatory copy', async () => {
    render(
      <AgentRuntimeSelector
        {...hosted}
        selectedRuntime={hosted.options[0]}
        onRuntimeChange={vi.fn()}
      />,
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Run with Default' }),
    );

    expect(
      await screen.findByRole('menuitemradio', { name: 'Default' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent),
    ).toEqual(['Default', 'Genfeed', 'OpenRouter', 'Replicate']);
    expect(screen.queryByText('This computer')).toBeNull();
    expect(screen.queryByText(hosted.providerSummary)).toBeNull();
    expect(screen.queryByText(hosted.localToolSummary)).toBeNull();
    expect(
      screen.queryByText(HOSTED_GENFEED_RUNTIME_OPTION.description),
    ).toBeNull();
  });

  it('groups only available local CLIs and preserves the selected runtime key', async () => {
    const onRuntimeChange = vi.fn();
    render(
      <AgentRuntimeSelector
        {...desktop}
        selectedRuntime={DESKTOP_CODEX_CLI_RUNTIME_OPTION}
        onRuntimeChange={onRuntimeChange}
      />,
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Run with Codex' }),
    );

    expect(
      await screen.findByRole('menuitemradio', { name: 'Codex' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('This computer')).toBeTruthy();
    expect(screen.getByText('Cloud')).toBeTruthy();
    expect(
      screen.queryByRole('menuitemradio', { name: 'Claude Code' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'OpenRouter' }));
    expect(onRuntimeChange).toHaveBeenCalledWith(
      desktop.options.find((option) => option.key === 'hosted/openrouter'),
    );
    expect(onRuntimeChange.mock.calls[0][0]).not.toEqual(
      HOSTED_GENFEED_RUNTIME_OPTION,
    );
  });

  it('can restore the empty-key default from an explicit hosted selection', async () => {
    const onRuntimeChange = vi.fn();
    const { rerender } = render(
      <AgentRuntimeSelector
        {...hosted}
        selectedRuntime={HOSTED_GENFEED_RUNTIME_OPTION}
        onRuntimeChange={onRuntimeChange}
      />,
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Run with Genfeed' }),
    );
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Default' }),
    );
    expect(onRuntimeChange).toHaveBeenCalledWith(hosted.options[0]);
    rerender(
      <AgentRuntimeSelector
        {...hosted}
        selectedRuntime={hosted.options[0]}
        onRuntimeChange={onRuntimeChange}
      />,
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Run with Default' }),
    );
    expect(
      await screen.findByRole('menuitemradio', { name: 'Default' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('retains an unavailable bound CLI on the trigger without offering it', async () => {
    render(
      <AgentRuntimeSelector
        {...hosted}
        selectedRuntime={DESKTOP_CODEX_CLI_RUNTIME_OPTION}
        onRuntimeChange={vi.fn()}
      />,
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Run with Codex' }),
    );
    await screen.findByRole('menuitemradio', { name: 'Default' });
    expect(screen.queryByRole('menuitemradio', { name: 'Codex' })).toBeNull();
    expect(
      screen
        .getAllByRole('menuitemradio')
        .every((item) => item.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
  });

  it('supports keyboard selection and dismissal without changing the runtime', async () => {
    const user = userEvent.setup();
    const onRuntimeChange = vi.fn();
    render(
      <AgentRuntimeSelector
        {...desktop}
        selectedRuntime={hosted.options[0]}
        onRuntimeChange={onRuntimeChange}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Run with Default' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitemradio', { name: 'Codex' });
    await user.keyboard('Codex{Enter}');
    await waitFor(() =>
      expect(onRuntimeChange).toHaveBeenCalledWith(
        DESKTOP_CODEX_CLI_RUNTIME_OPTION,
      ),
    );
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitemradio', { name: 'Codex' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onRuntimeChange).toHaveBeenCalledTimes(1);
  });
});
