import { AgentSettings } from '@genfeedai/agent/components/AgentSettings';
import { GenerationPriority } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SETTINGS_MODELS = [
  {
    brandSlug: 'anthropic',
    description: 'Balanced intelligence',
    key: 'anthropic/claude-sonnet-5',
    label: 'Claude Sonnet 5',
  },
  {
    brandSlug: 'openai',
    description: 'Balanced',
    key: 'openai/gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
  },
] as const;

describe('AgentSettings', () => {
  const onSave = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves selector copy through the host agent catalog', () => {
    const source = readFileSync(join(__dirname, 'AgentSettings.tsx'), 'utf8');
    expect(source).toContain("useTranslations('agent.settings')");
    expect(source).not.toContain('DEFAULT_MODEL_COPY');
  });

  it('hydrates controls from authoritative settings', () => {
    render(
      <AgentSettings
        models={SETTINGS_MODELS}
        isModelsLoading={false}
        initialSettings={{
          defaultModel: 'anthropic/claude-sonnet-5',
          generationPriority: GenerationPriority.SPEED,
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
      screen.getByRole('button', { name: /Claude Sonnet 5/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Agent persona' })).toHaveValue(
      'Write like a pragmatic founder.',
    );
  });

  it('labels authoritative empty settings as defaults', () => {
    render(
      <AgentSettings
        models={SETTINGS_MODELS}
        isModelsLoading={false}
        initialSettings={{
          defaultModel: '',
          generationPriority: GenerationPriority.BALANCED,
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
    expect(screen.getByRole('button', { name: /^Auto/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps Auto available when a removed override is absent from the catalog', () => {
    render(
      <AgentSettings
        models={SETTINGS_MODELS}
        initialSettings={{
          defaultModel: 'retired/model',
          generationPriority: GenerationPriority.BALANCED,
          persona: '',
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('button', { name: /^Auto/ })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Claude Sonnet 5/i }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves Auto as an explicit empty model override', async () => {
    const user = userEvent.setup();

    render(
      <AgentSettings
        models={[]}
        initialSettings={{
          defaultModel: 'retired/model',
          generationPriority: GenerationPriority.BALANCED,
          persona: '',
        }}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Auto/ }));
    await user.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        defaultModel: '',
        generationPriority: GenerationPriority.BALANCED,
        persona: '',
      });
    });
  });

  it('saves the edited values through the provided boundary', async () => {
    render(
      <AgentSettings
        models={SETTINGS_MODELS}
        isModelsLoading={false}
        initialSettings={{
          defaultModel: '',
          generationPriority: GenerationPriority.BALANCED,
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
        generationPriority: GenerationPriority.COST,
        persona: 'Keep every answer crisp.',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Settings saved');
  });

  it('keeps the form editable and reports a recoverable save failure', async () => {
    onSave.mockRejectedValueOnce(new Error('save failed'));

    render(
      <AgentSettings
        models={SETTINGS_MODELS}
        isModelsLoading={false}
        initialSettings={{
          defaultModel: '',
          generationPriority: GenerationPriority.BALANCED,
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
