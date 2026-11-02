import type { Preset } from '@models/elements/preset.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ui from '../../../../../messages/en/ui.json';
import PresetDescriptionActions from './preset-description-actions';

const fixture = vi.hoisted(() => ({
  enhance: null as ((text: string, category: string) => Promise<string>) | null,
}));

vi.mock('@/hooks/ui/use-prompt-enhance/use-prompt-enhance', () => ({
  usePromptEnhance: () => ({
    enhance: (text: string, category: string) =>
      fixture.enhance?.(text, category),
    isEnhancing: false,
  }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

/** Keeps the saved description like the list does after its refresh. */
function Harness() {
  const [description, setDescription] = useState('plain studio banner');

  return (
    <NextIntlClientProvider locale="en" messages={{ ui }}>
      <p data-testid="saved">{description}</p>
      <PresetDescriptionActions
        onSave={async (next) => setDescription(next)}
        preset={{ category: 'image', description, id: 'p1' } as Preset}
      />
    </NextIntlClientProvider>
  );
}

describe('PresetDescriptionActions', () => {
  it('saves the enhanced description and lets the admin undo it', async () => {
    fixture.enhance = async () => 'cinematic studio banner, soft light';
    render(<Harness />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Enhance description' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('saved')).toHaveTextContent(
        'cinematic studio banner, soft light',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo enhancement' }));
    await waitFor(() =>
      expect(screen.getByTestId('saved')).toHaveTextContent(
        'plain studio banner',
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Undo enhancement' }),
    ).toBeNull();
  });

  it('keeps the description when the enhancement fails', async () => {
    fixture.enhance = async () => {
      throw new Error('timed out');
    };
    render(<Harness />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Enhance description' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Enhance description' }),
      ).toBeEnabled(),
    );
    expect(screen.getByTestId('saved')).toHaveTextContent(
      'plain studio banner',
    );
    expect(
      screen.queryByRole('button', { name: 'Undo enhancement' }),
    ).toBeNull();
  });
});
