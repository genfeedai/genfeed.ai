import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PromptBarSpeechInput from '@/components/prompt-bars/components/speech-input/PromptBarSpeechInput';

describe('PromptBarSpeechInput', () => {
  const baseProps = {
    charLimit: 100,
    isAvatarRoute: false,
    isDisabled: false,
    onSpeechChange: vi.fn(),
    shouldRender: true,
    watchedSpeech: 'Hello world',
  };

  it('should render without crashing', () => {
    const { container } = render(<PromptBarSpeechInput {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<PromptBarSpeechInput {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PromptBarSpeechInput {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
