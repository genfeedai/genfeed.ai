import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

describe('PromptBar composer controls', () => {
  it('groups file upload and Library references under one context menu', async () => {
    const onAddFiles = vi.fn();
    const onOpenLibrary = vi.fn();
    const file = new File(['image'], 'reference.png', { type: 'image/png' });

    render(
      <PromptBarReferenceControls
        onAddFiles={onAddFiles}
        onOpenLibrary={onOpenLibrary}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Attach files' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reference library content' }),
    ).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add context' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Attach files' }),
    ).toBeVisible();
    expect(
      screen.getByRole('menuitem', { name: 'Reference library content' }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Attach files' }));
    fireEvent.change(screen.getByTestId('composer-file-input'), {
      target: { files: [file] },
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add context' }));
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Reference library content',
      }),
    );

    expect(onAddFiles).toHaveBeenCalledWith([file]);
    expect(onOpenLibrary).toHaveBeenCalledOnce();
  });

  it('uses one voice control for idle, listening, and transcribing states', () => {
    const onStartListening = vi.fn();
    const onStopListening = vi.fn();
    const { rerender } = render(
      <PromptBarVoiceControl
        isListening={false}
        isTranscribing={false}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(onStartListening).toHaveBeenCalledOnce();

    rerender(
      <PromptBarVoiceControl
        isListening
        isTranscribing={false}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(onStopListening).toHaveBeenCalledOnce();

    rerender(
      <PromptBarVoiceControl
        isListening={false}
        isTranscribing
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />,
    );
    expect(screen.getByRole('button', { name: 'Transcribing' })).toBeDisabled();
  });
});
