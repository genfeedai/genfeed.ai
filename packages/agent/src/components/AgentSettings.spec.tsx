import { AgentSettings } from '@genfeedai/agent/components/AgentSettings';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentSettings', () => {
  const onSave = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates controls from authoritative settings', () => {
    render(
      <AgentSettings
        initialSettings={{
          defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
          generationPriority: 'speed',
          persona: 'Write like a pragmatic founder.',
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('button', { name: /^Fast/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /Claude Sonnet 4.5/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Agent persona' })).toHaveValue(
      'Write like a pragmatic founder.',
    );
  });

  it('labels authoritative empty settings as defaults', () => {
    render(
      <AgentSettings
        initialSettings={{
          defaultModel: '',
          generationPriority: 'balanced',
          persona: '',
        }}
        isDefaultState
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'No model, persona, or generation priority overrides are saved yet.',
    );
    expect(screen.getByRole('button', { name: /^Balanced/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('saves the edited values through the provided boundary', async () => {
    render(
      <AgentSettings
        initialSettings={{
          defaultModel: '',
          generationPriority: 'balanced',
          persona: '',
        }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Budget/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent persona' }), {
      target: { value: 'Keep every answer crisp.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        defaultModel: '',
        generationPriority: 'cost',
        persona: 'Keep every answer crisp.',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Settings saved');
  });

  it('keeps the form editable and reports a recoverable save failure', async () => {
    onSave.mockRejectedValueOnce(new Error('save failed'));

    render(
      <AgentSettings
        initialSettings={{
          defaultModel: '',
          generationPriority: 'balanced',
          persona: '',
        }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to save settings',
    );
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
  });
});
