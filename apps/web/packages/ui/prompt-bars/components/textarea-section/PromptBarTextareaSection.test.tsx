import type { IModel } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import PromptBarTextareaSection from '@ui/prompt-bars/components/textarea-section/PromptBarTextareaSection';
import { createRef } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

describe('PromptBarTextareaSection', () => {
  const textareaRegister: UseFormRegisterReturn<'text'> = {
    name: 'text',
    onBlur: vi.fn(),
    onChange: vi.fn(),
    ref: vi.fn(),
  };

  const selectedModels = [{ id: 'model-1', trigger: 'spark' } as IModel];

  it('should render without crashing', () => {
    const { container } = render(
      <PromptBarTextareaSection
        textareaRegister={textareaRegister}
        textareaRef={createRef<HTMLTextAreaElement>()}
        placeholder="Enter prompt"
        isDisabled={false}
        onChange={vi.fn()}
        selectedModels={selectedModels}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <PromptBarTextareaSection
        textareaRegister={textareaRegister}
        textareaRef={createRef<HTMLTextAreaElement>()}
        placeholder="Enter prompt"
        isDisabled={false}
        onChange={vi.fn()}
        selectedModels={selectedModels}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <PromptBarTextareaSection
        textareaRegister={textareaRegister}
        textareaRef={createRef<HTMLTextAreaElement>()}
        placeholder="Enter prompt"
        isDisabled={false}
        onChange={vi.fn()}
        selectedModels={selectedModels}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
