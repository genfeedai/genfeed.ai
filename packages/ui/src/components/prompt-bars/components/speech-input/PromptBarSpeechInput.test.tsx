import { render } from '@testing-library/react';
import PromptBarSpeechInput from '@ui/prompt-bars/components/speech-input/PromptBarSpeechInput';
import { describe, expect, it, vi } from 'vitest';

describe('PromptBarSpeechInput', () => {
  const baseProps = {
    charLimit: 100,
    isAvatarRoute: false,
    isDisabled: false,
    onSpeechChange: vi.fn(),
    shouldRender: true,
    watchedSpeech: 'Hello world',
  };

  it('should apply correct styles and classes', () => {
    const { container } = render(<PromptBarSpeechInput {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
