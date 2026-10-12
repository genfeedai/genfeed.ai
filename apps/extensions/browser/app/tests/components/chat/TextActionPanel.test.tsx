import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatActionChips } from '~components/chat/ChatActionChips';
import { TextActionPanel } from '~components/chat/TextActionPanel';
import type { UseTextActionReturn } from '~hooks/use-text-action';
import { usePlatformStore } from '~store/use-platform-store';

const RESULT = {
  hasBrandVoice: false,
  isReplayed: false,
  maxCharacters: 280,
  mode: 'rewrite',
  platform: 'twitter',
  text: 'The launch is live',
  voiceHint: 'Set up and approve your brand voice in Genfeed.',
} as const;

function textAction(overrides: Partial<UseTextActionReturn> = {}) {
  return {
    apply: vi.fn(),
    dismiss: vi.fn(),
    error: null,
    mode: null,
    original: '',
    phase: 'idle',
    result: null,
    snapshotId: null,
    start: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  } as UseTextActionReturn;
}

afterEach(cleanup);

describe('TextActionPanel', () => {
  it('starts each mode from its button', () => {
    const state = textAction();
    render(<TextActionPanel textAction={state} />);

    fireEvent.click(screen.getByRole('button', { name: 'Proofread' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Rewrite in my voice' }),
    );

    expect(state.start).toHaveBeenNthCalledWith(1, 'proofread');
    expect(state.start).toHaveBeenNthCalledWith(2, 'rewrite');
  });

  it('hides the buttons where the chips already offer them', () => {
    render(<TextActionPanel hasActions={false} textAction={textAction()} />);
    expect(screen.queryByRole('button', { name: 'Proofread' })).toBeNull();
  });

  it('previews with the voice hint, Apply and the original', () => {
    const state = textAction({
      mode: 'rewrite',
      original: 'Teh launch is live',
      phase: 'preview',
      result: RESULT,
    });
    render(<TextActionPanel textAction={state} />);

    expect(screen.getByText('The launch is live')).toBeTruthy();
    expect(screen.getByText(RESULT.voiceHint)).toBeTruthy();
    expect(screen.getByText('Original: Teh launch is live')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(state.apply).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(state.dismiss).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('offers Undo and Done once applied', () => {
    const state = textAction({ phase: 'applied', result: RESULT });
    render(<TextActionPanel textAction={state} />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(state.undo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(state.dismiss).toHaveBeenCalledOnce();
  });

  it('shows progress and disables the buttons while working', () => {
    render(
      <TextActionPanel
        textAction={textAction({ mode: 'proofread', phase: 'working' })}
      />,
    );

    expect(screen.getByText('Proofreading your draft…')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Proofread' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('announces an error', () => {
    render(
      <TextActionPanel
        textAction={textAction({ error: 'Not enough credits.' })}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Not enough credits.');
  });
});

describe('ChatActionChips', () => {
  it('offers Proofread and Rewrite in my voice on every platform and no Improve draft', () => {
    usePlatformStore.setState({ currentPlatform: 'twitter' });
    const onTextAction = vi.fn();
    render(
      <ChatActionChips onChipClick={vi.fn()} onTextAction={onTextAction} />,
    );

    expect(screen.queryByText('Improve draft')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Proofread' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Rewrite in my voice' }),
    );
    expect(onTextAction).toHaveBeenNthCalledWith(1, 'proofread');
    expect(onTextAction).toHaveBeenNthCalledWith(2, 'rewrite');
  });

  it('keeps the prompt chips of the platform', () => {
    usePlatformStore.setState({ currentPlatform: 'linkedin' });
    const onChipClick = vi.fn();
    render(
      <ChatActionChips onChipClick={onChipClick} onTextAction={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Write post' }));
    expect(onChipClick).toHaveBeenCalledWith('Write a LinkedIn post about');
  });

  it('drops the generic Improve text chip with the rest of the dead path', () => {
    usePlatformStore.setState({ currentPlatform: null });
    render(<ChatActionChips onChipClick={vi.fn()} onTextAction={vi.fn()} />);

    expect(screen.queryByText('Improve text')).toBeNull();
    expect(screen.getByRole('button', { name: 'Write content' })).toBeTruthy();
  });
});
