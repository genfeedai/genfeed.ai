import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import { describe, expect, it, vi } from 'vitest';

describe('PromptBar composer controls', () => {
  it('forwards selected files and opens the shared library picker', () => {
    const onAddFiles = vi.fn();
    const onOpenLibrary = vi.fn();
    const file = new File(['image'], 'reference.png', { type: 'image/png' });

    render(
      <PromptBarReferenceControls
        onAddFiles={onAddFiles}
        onOpenLibrary={onOpenLibrary}
      />,
    );

    fireEvent.change(screen.getByLabelText('Choose composer attachments'), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reference library content' }),
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
